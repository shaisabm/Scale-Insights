import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { GET as zeroSalesRoute } from "../../api/ads/zero-sales.js";
import { PUT as saveRoute } from "../../api/ads/zero-sales-settings.js";
import { ZERO_DEFAULTS, cleanZeroSettings, loadZeroSettings, saveZeroSettings } from "../../server/ads/insight-settings.js";
import { SESSION_COOKIE, createSessionToken } from "../../server/auth.js";
import { migrate } from "../../server/db.js";

const profileId = "test-profile";
const valid = (changes = {}) => ({ ...structuredClone(ZERO_DEFAULTS), ...changes });

describe("cleanZeroSettings", () => {
  it("accepts the defaults and normalizes filters and tracked columns", () => {
    expect(cleanZeroSettings(valid()).settings).toEqual(ZERO_DEFAULTS);
    const { settings } = cleanZeroSettings(valid({ name: "  Mine  ", track: ["pl", "impressions"], filters: { clicks: { min: "5", max: "" }, sales: {}, pl: { max: -10 } } }));
    expect(settings).toMatchObject({ name: "Mine", track: ["impressions", "pl"], filters: { clicks: { min: 5 }, pl: { max: -10 } } });
  });

  it("refuses bad names, sorts, numbers, reversed limits and unavailable metrics", () => {
    for (const [changes, message] of [
      [{ name: "" }, /name/],
      [{ name: "x".repeat(81) }, /name/],
      [{ description: "x".repeat(301) }, /description/],
      [{ hideKeywords: "yes" }, /hideKeywords/],
      [{ sort: "term" }, /sort/],
      [{ sort: "breakEvenBid" }, /sort/],
      [{ dir: "up" }, /sort/],
      [{ filters: { clicks: { min: "lots" } } }, /number/],
      [{ filters: { clicks: { min: 9, max: 3 } } }, /above its max/],
      [{ filters: { breakEvenBid: { min: 1 } } }, /can't be filtered/],
      [{ track: ["breakEvenBid"] }, /tracked/],
    ]) {
      expect(cleanZeroSettings(valid(changes)).error).toMatch(message);
    }
    expect(cleanZeroSettings(null).error).toBeTruthy();
  });
});

describe("saved settings", () => {
  it("loads the defaults until settings are saved, then the saved ones", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    expect(await loadZeroSettings(db, profileId)).toEqual(ZERO_DEFAULTS);
    const mine = cleanZeroSettings(valid({ name: "Mine", hideKeywords: true })).settings;
    await saveZeroSettings(db, profileId, mine);
    expect(await loadZeroSettings(db, profileId)).toEqual(mine);
    expect(await loadZeroSettings(db, "other-profile")).toEqual(ZERO_DEFAULTS);
  });

  it("falls back to the defaults if what's stored no longer validates", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await db.execute({ sql: "INSERT INTO ads_insight_settings (profile_id, insight, settings, updated_at) VALUES (?, 'zero-sales', ?, 't')", args: [profileId, "{not json"] });
    expect(await loadZeroSettings(db, profileId)).toEqual(ZERO_DEFAULTS);
  });
});

describe("PUT /api/ads/zero-sales-settings", () => {
  const put = (body, signedIn = true) => saveRoute(new Request("https://app.test/api/ads/zero-sales-settings", {
    method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(signedIn ? { cookie: `${SESSION_COOKIE}=${createSessionToken("secret")}` } : {}) },
  }));

  it("needs sign-in, refuses invalid settings, and saves valid ones for the zero-sales report", async () => {
    vi.stubEnv("SESSION_SECRET", "secret");
    vi.stubEnv("TURSO_DATABASE_URL", ":memory:");
    vi.stubEnv("AMAZON_ADS_PROFILE_ID", profileId);
    try {
      expect((await put(valid(), false)).status).toBe(401);
      expect((await put("not json")).status).toBe(400);
      const bad = await put(valid({ sort: "nope" }));
      expect([bad.status, (await bad.json()).error]).toEqual([400, "Choose a sort order from the list."]);
      const ok = await put(valid({ name: "Mine", sort: "clicks", dir: "asc" }));
      expect(ok.status).toBe(200);
      expect((await ok.json()).settings).toMatchObject({ name: "Mine", sort: "clicks", dir: "asc" });
      const report = await zeroSalesRoute(new Request("https://app.test/api/ads/zero-sales", { headers: { cookie: `${SESSION_COOKIE}=${createSessionToken("secret")}` } }));
      expect((await report.json()).settings).toMatchObject({ name: "Mine", sort: "clicks", dir: "asc" });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
