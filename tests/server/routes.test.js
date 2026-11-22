import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as trend } from "../../api/ads/trend.js";
import { GET as cronSync, POST as syncNow } from "../../api/sync/ads.js";
import { storeWindow, syncAds } from "../../server/ads/sync.js";
import { SESSION_COOKIE, createSessionToken } from "../../server/auth.js";
import { getDb, migrate } from "../../server/db.js";

vi.mock("../../server/ads/sync.js", async importOriginal => ({ ...(await importOriginal()), syncAds: vi.fn(async () => ({ requested: 2, stored: 0, failed: 0, pending: 2, rows: 0 })) }));

const SECRET = "session-secret";
const signedIn = (url, init = {}) => new Request(url, { ...init, headers: { cookie: `${SESSION_COOKIE}=${createSessionToken(SECRET)}` } });
const row = (date, sales) => ({ date, campaignId: "1", adGroupId: "2", asin: "B0A", impressions: 100, clicks: 4, cost: 2, orders: 1, units: 1, sales });

function stubEnv() {
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("TURSO_DATABASE_URL", ":memory:");
  vi.stubEnv("AMAZON_ADS_PROFILE_ID", "111");
  vi.stubEnv("AMAZON_ADS_CLIENT_ID", "client-id");
  vi.stubEnv("AMAZON_ADS_CLIENT_SECRET", "client-secret");
  vi.stubEnv("AMAZON_ADS_REFRESH_TOKEN", "real-refresh");
}

beforeAll(async () => {
  stubEnv();
  const db = await migrate(getDb());
  await storeWindow(db, { profileId: "111", product: "SP", start: "2026-11-01", end: "2026-11-02", rows: [row("2026-11-01", 20), { ...row("2026-11-01", 5), asin: "B0B" }, row("2026-11-02", 10)], syncedAt: "2026-11-03T14:00:00.000Z" });
  await storeWindow(db, { profileId: "999", product: "SP", start: "2026-11-01", end: "2026-11-01", rows: [row("2026-11-01", 999)], syncedAt: "2026-11-03T14:00:00.000Z" });
  vi.unstubAllEnvs();
});

describe("GET /api/ads/trend", () => {
  it("needs a signed-in person", async () => {
    stubEnv();
    expect((await trend(new Request("https://app.test/api/ads/trend"))).status).toBe(401);
  });

  it("returns daily totals for the configured profile only", async () => {
    stubEnv();
    const res = await trend(signedIn("https://app.test/api/ads/trend?from=2026-11-01&to=2026-11-30"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      days: [
        { adProduct: "SP", date: "2026-11-01", impressions: 200, clicks: 8, cost: 4, orders: 2, units: 2, sales: 25 },
        { adProduct: "SP", date: "2026-11-02", impressions: 100, clicks: 4, cost: 2, orders: 1, units: 1, sales: 10 },
      ],
      synced: { SP: { first: "2026-11-01", last: "2026-11-02", syncedAt: "2026-11-03T14:00:00.000Z" } },
    });
  });

  it("rejects a reversed or too long range", async () => {
    stubEnv();
    expect((await trend(signedIn("https://app.test/api/ads/trend?from=2026-11-30&to=2026-11-01"))).status).toBe(400);
    expect((await trend(signedIn("https://app.test/api/ads/trend?from=2024-01-01&to=2026-11-01"))).status).toBe(400);
  });
});

describe("/api/sync/ads", () => {
  it("lets the cron job in only with the cron secret", async () => {
    stubEnv();
    expect((await cronSync(new Request("https://app.test/api/sync/ads"))).status).toBe(401);
    expect((await cronSync(new Request("https://app.test/api/sync/ads", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    const res = await cronSync(new Request("https://app.test/api/sync/ads", { headers: { authorization: "Bearer cron-secret" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ requested: 2, pending: 2 });
    expect(syncAds).toHaveBeenCalledWith(expect.objectContaining({ profileId: "111", timeZone: "America/Los_Angeles", budgetMs: 45_000 }));
  });

  it("lets a signed-in person sync now", async () => {
    stubEnv();
    expect((await syncNow(new Request("https://app.test/api/sync/ads", { method: "POST" }))).status).toBe(401);
    expect((await syncNow(signedIn("https://app.test/api/sync/ads", { method: "POST" }))).status).toBe(200);
  });

  it("refuses the cron call when no cron secret is set", async () => {
    stubEnv();
    vi.stubEnv("CRON_SECRET", "");
    expect((await cronSync(new Request("https://app.test/api/sync/ads", { headers: { authorization: "Bearer " } }))).status).toBe(401);
  });
});
