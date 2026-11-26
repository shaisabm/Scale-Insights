import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertAllowed, createAdsClient, isReadOnly } from "../../server/amazon/ads.js";
import { clearTokenCache, getAccessToken } from "../../server/amazon/lwa.js";

const cfg = {
  host: "https://ads.test",
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "real-refresh",
  profileId: "111",
  testRefreshToken: "test-refresh",
  testProfileId: "999",
  production: false,
};

// Token requests answer with a token named after the refresh token; everything else goes to `handler`.
function fakeFetch(handler = () => Response.json({})) {
  return vi.fn(async (url, init = {}) => {
    if (String(url).endsWith("/auth/o2/token")) {
      const refresh = new URLSearchParams(String(init.body)).get("refresh_token");
      return Response.json({ access_token: `token:${refresh}`, expires_in: 3600 });
    }
    return handler(String(url), init);
  });
}

beforeEach(() => clearTokenCache());

describe("isReadOnly", () => {
  it("treats GETs, report requests and list endpoints as reads", () => {
    expect(isReadOnly("GET", "/v2/profiles")).toBe(true);
    expect(isReadOnly("POST", "/reporting/reports")).toBe(true);
    expect(isReadOnly("POST", "/sp/campaigns/list")).toBe(true);
    expect(isReadOnly("POST", "/sp/keywords/list?x=1")).toBe(true);
    expect(isReadOnly("POST", "/product/metadata")).toBe(true);
    expect(isReadOnly("POST", "/product/metadata/extra")).toBe(false);
  });

  it("treats everything else as a write", () => {
    expect(isReadOnly("POST", "/sp/campaigns")).toBe(false);
    expect(isReadOnly("POST", "/sp/campaigns#/list")).toBe(false);
    expect(isReadOnly("POST", "/sp/campaigns?x=1#/list")).toBe(false);
    expect(isReadOnly("PUT", "/sp/campaigns")).toBe(false);
    expect(isReadOnly("POST", "/sp/campaigns/delete")).toBe(false);
    expect(isReadOnly("DELETE", "/reporting/reports/abc")).toBe(false);
  });
});

describe("assertAllowed", () => {
  const write = { method: "PUT", path: "/sp/keywords", testProfileId: "999" };

  it("blocks writes to the real profile outside production", () => {
    expect(() => assertAllowed({ ...write, profileId: "111", production: false })).toThrow(/test account/);
    expect(() => assertAllowed({ ...write, profileId: "111", production: false, humanApproved: true })).toThrow();
    expect(() => assertAllowed({ ...write, profileId: undefined, production: false })).toThrow();
  });

  it("blocks writes in production unless a person approved them", () => {
    expect(() => assertAllowed({ ...write, profileId: "111", production: true })).toThrow();
    expect(() => assertAllowed({ ...write, profileId: "111", production: true, humanApproved: true })).not.toThrow();
  });

  it("allows writes to the test account and reads anywhere", () => {
    expect(() => assertAllowed({ ...write, profileId: 999, production: false })).not.toThrow();
    expect(() => assertAllowed({ method: "GET", path: "/v2/profiles", profileId: "111", production: false })).not.toThrow();
  });

  it("never treats a missing test profile as a match", () => {
    expect(() => assertAllowed({ method: "POST", path: "/sp/campaigns", profileId: "", testProfileId: "", production: false })).toThrow();
  });
});

describe("createAdsClient", () => {
  it("refuses a write to the real profile before any network call", async () => {
    const fetch = fakeFetch();
    const ads = createAdsClient(cfg, { fetch });
    await expect(ads.request("POST", "/sp/campaigns", { profileId: "111", body: {} })).rejects.toThrow(/Blocked POST \/sp\/campaigns/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a write disguised with a /list fragment before any network call", async () => {
    const fetch = fakeFetch();
    const ads = createAdsClient(cfg, { fetch });
    await expect(ads.request("POST", "/sp/campaigns#/list", { profileId: "111", body: {} })).rejects.toThrow(/Blocked POST/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a non-HTTPS Ads host before getting a token", async () => {
    const fetch = fakeFetch();
    const ads = createAdsClient({ ...cfg, host: "http://ads.test" }, { fetch });
    await expect(ads.request("GET", "/v2/profiles", { profileId: "111" })).rejects.toThrow(/https/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the real profile with the real login's token", async () => {
    const fetch = fakeFetch(() => Response.json([{ profileId: 111 }]));
    const ads = createAdsClient(cfg, { fetch });
    const res = await ads.request("GET", "/v2/profiles", { profileId: "111" });
    expect(res).toEqual({ status: 200, data: [{ profileId: 111 }] });
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe("https://ads.test/v2/profiles");
    expect(init.headers).toMatchObject({ Authorization: "Bearer token:real-refresh", "Amazon-Advertising-API-ClientId": "client-id", "Amazon-Advertising-API-Scope": "111" });
  });

  it("stops a request when the caller's signal aborts", async () => {
    const fetch = fakeFetch((url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))));
    const ads = createAdsClient(cfg, { fetch });
    await expect(ads.request("POST", "/sb/v4/ads/list", { profileId: "111", body: {}, signal: AbortSignal.timeout(20) })).rejects.toThrow(/abort/i);
  });

  it("stops waiting for a slow token when the caller's signal aborts, without cancelling the shared refresh", async () => {
    const fetch = vi.fn(async url => {
      if (String(url).endsWith("/auth/o2/token")) {
        await new Promise(resolve => setTimeout(resolve, 200));
        return Response.json({ access_token: "token", expires_in: 3600 });
      }
      return Response.json({});
    });
    const ads = createAdsClient(cfg, { fetch });
    const started = Date.now();
    await expect(ads.request("POST", "/sb/v4/ads/list", { profileId: "111", body: {}, signal: AbortSignal.timeout(20) })).rejects.toThrow(/abort/i);
    expect(Date.now() - started).toBeLessThan(150);
    expect(fetch.mock.calls[0][1].signal).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses an already-cancelled request without leaving a failed token refresh unhandled", async () => {
    const unhandled = [];
    const onUnhandled = reason => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const fetch = vi.fn(async () => { throw new Error("token service down"); });
      const ads = createAdsClient(cfg, { fetch });
      await expect(ads.request("POST", "/sb/v4/ads/list", { profileId: "111", body: {}, signal: AbortSignal.abort() })).rejects.toThrow(/abort/i);
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("writes to the test account with the test login's token", async () => {
    const fetch = fakeFetch(() => Response.json({ campaigns: { success: [] } }, { status: 207 }));
    const ads = createAdsClient(cfg, { fetch });
    const res = await ads.request("POST", "/sp/campaigns", { profileId: "999", body: { campaigns: [] } });
    expect(res.status).toBe(207);
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer token:test-refresh");
    expect(fetch.mock.calls[1][1].body).toBe(JSON.stringify({ campaigns: [] }));
  });

  it("createReport returns the new id, or the id of a duplicate request", async () => {
    const replies = [
      Response.json({ reportId: "new-id", status: "PENDING" }),
      Response.json({ code: "425", detail: "The Request is a duplicate of : 0b2c9a1e-1111-2222-3333-444455556666" }, { status: 425 }),
      Response.json({ code: "400", detail: "bad column" }, { status: 400 }),
    ];
    const fetch = fakeFetch(() => replies.shift());
    const ads = createAdsClient(cfg, { fetch });
    expect(await ads.createReport("111", { name: "x" })).toBe("new-id");
    expect(await ads.createReport("111", { name: "x" })).toBe("0b2c9a1e-1111-2222-3333-444455556666");
    await expect(ads.createReport("111", { name: "x" })).rejects.toThrow(/HTTP 400/);
    expect(fetch.mock.calls[1][1].headers["Content-Type"]).toBe("application/vnd.createasyncreportrequest.v3+json");
  });

  it("downloadReport unzips the report JSON", async () => {
    const rows = [{ date: "2026-11-01", cost: 1.5 }];
    const fetch = fakeFetch(() => new Response(gzipSync(JSON.stringify(rows))));
    expect(await createAdsClient(cfg, { fetch }).downloadReport("https://s3.test/report.json.gz")).toEqual(rows);
  });
});

describe("getAccessToken", () => {
  const creds = { clientId: "c", clientSecret: "s", refreshToken: "r" };

  it("caches the token until a minute before it expires", async () => {
    let t = 0;
    const fetch = fakeFetch();
    const opts = { fetch, now: () => t };
    expect(await getAccessToken(creds, opts)).toBe("token:r");
    t = 3_500_000;
    await getAccessToken(creds, opts);
    expect(fetch).toHaveBeenCalledTimes(1);
    t = 3_550_000;
    await getAccessToken(creds, opts);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares one token request between concurrent cache misses", async () => {
    let release;
    const fetch = vi.fn(() => new Promise(resolve => (release = () => resolve(Response.json({ access_token: "shared", expires_in: 3600 })))));
    const both = Promise.all([getAccessToken(creds, { fetch }), getAccessToken(creds, { fetch })]);
    release();
    expect(await both).toEqual(["shared", "shared"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("lets a later call retry after a shared request fails", async () => {
    const replies = [Response.json({ error: "server_error" }, { status: 500 }), Response.json({ access_token: "second try", expires_in: 3600 })];
    const fetch = vi.fn(async () => replies.shift());
    const both = await Promise.allSettled([getAccessToken(creds, { fetch }), getAccessToken(creds, { fetch })]);
    expect(both.map(r => r.status)).toEqual(["rejected", "rejected"]);
    expect(await getAccessToken(creds, { fetch })).toBe("second try");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws when Login with Amazon refuses", async () => {
    const fetch = vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
    await expect(getAccessToken(creds, { fetch })).rejects.toThrow(/HTTP 400 invalid_grant/);
  });
});
