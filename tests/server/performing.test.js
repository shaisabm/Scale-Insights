import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { GET as performingRoute } from "../../api/ads/performing.js";
import { PUT as saveRoute } from "../../api/ads/performing-settings.js";
import { PERFORMING_DEFAULTS, cleanZeroSettings, loadZeroSettings, saveZeroSettings } from "../../server/ads/insight-settings.js";
import { zeroSales } from "../../server/ads/zero-sales.js";
import { SESSION_COOKIE, createSessionToken } from "../../server/auth.js";
import { migrate } from "../../server/db.js";
import { storeWindow } from "../../server/ads/sync.js";

const profileId = "test-profile";
const from = "2026-10-23", to = "2026-11-21";
const cookie = { cookie: `${SESSION_COOKIE}=${createSessionToken("secret")}` };

const searchRow = (term, cost, { impressions = 100, clicks = 10, orders = 1, sales = 20 } = {}) => ({
  product: "SP_SEARCH", date: to, campaignId: "1", adGroupId: "2", term, impressions, clicks, cost, orders, units: orders, sales,
});

describe("Performing Search Terms defaults", () => {
  it("filter conversion from 15% up, best converting first, like the other cards otherwise", () => {
    expect(PERFORMING_DEFAULTS.name).toBe("Performing Search Terms");
    expect(PERFORMING_DEFAULTS.filters).toEqual({ conversion: { min: 15 } });
    expect([PERFORMING_DEFAULTS.sort, PERFORMING_DEFAULTS.dir]).toEqual(["conversion", "desc"]);
    expect(PERFORMING_DEFAULTS.hideAsins).toBe(true);
  });

  it("validate through the shared settings checks", () => {
    expect(cleanZeroSettings({ ...PERFORMING_DEFAULTS, filters: { conversion: { min: 20 } } }).settings.filters).toEqual({ conversion: { min: 20 } });
    expect(cleanZeroSettings({ ...PERFORMING_DEFAULTS, sort: "nope" }).error).toMatch("sort");
  });

  it("save and load per profile under the card's own insight key", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    expect(await loadZeroSettings(db, profileId, PERFORMING_DEFAULTS)).toEqual(PERFORMING_DEFAULTS);
    const mine = cleanZeroSettings({ ...PERFORMING_DEFAULTS, filters: { conversion: { min: 25 } } }).settings;
    await saveZeroSettings(db, profileId, mine, "t", PERFORMING_DEFAULTS);
    expect(await loadZeroSettings(db, profileId, PERFORMING_DEFAULTS)).toEqual(mine);
    // The other cards' settings are untouched.
    expect(await loadZeroSettings(db, profileId)).not.toEqual(mine);
  });
});

describe("zeroSales with the Performing Search Terms defaults", () => {
  it("keeps terms from 15% conversion up, best first, and hides ASIN terms", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SP_SEARCH", start: to, end: to, rows: [
      searchRow("best term", 12, { orders: 4, sales: 80 }), // 40% conversion
      searchRow("middle term", 14, { orders: 2, sales: 40 }), // 20% conversion
      searchRow("weak term", 16, { orders: 1, sales: 20 }), // 10% conversion, below the default filter
      searchRow("B0PERFORMS", 10, { orders: 5, sales: 100 }), // 50% conversion, but an ASIN
    ], syncedAt: "now" });
    await storeWindow(db, { profileId, product: "SP", start: to, end: to, rows: [
      { date: to, campaignId: "1", adGroupId: "2", asin: "B0PRODUCTA", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 },
    ], syncedAt: "now" });
    const data = await zeroSales(db, { profileId, from, to, settings: PERFORMING_DEFAULTS });
    expect(data.rows.map(r => [r.term, r.conversion])).toEqual([["best term", 40], ["middle term", 20]]);
    expect(data.totals.conversion).toBeCloseTo((4 + 2) / (10 + 10) * 100);
  });
});

describe("GET /api/ads/performing and PUT /api/ads/performing-settings", () => {
  const put = (body, signedIn = true) => saveRoute(new Request("https://app.test/api/ads/performing-settings", {
    method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(signedIn ? cookie : {}) },
  }));

  it("need sign-in, refuse invalid settings, and save valid ones for the Performing report", async () => {
    vi.stubEnv("SESSION_SECRET", "secret");
    vi.stubEnv("TURSO_DATABASE_URL", ":memory:");
    vi.stubEnv("AMAZON_ADS_PROFILE_ID", profileId);
    try {
      expect((await performingRoute(new Request("https://app.test/api/ads/performing"))).status).toBe(401);
      expect((await put({ name: "Mine" }, false)).status).toBe(401);
      expect((await put("not json")).status).toBe(400);
      const bad = await put({ ...PERFORMING_DEFAULTS, filters: { conversion: { min: 30, max: 10 } } });
      expect(bad.status).toBe(400);
      const ok = await put({ ...PERFORMING_DEFAULTS, filters: { conversion: { min: 20 } } });
      expect(ok.status).toBe(200);
      expect((await ok.json()).settings.filters).toEqual({ conversion: { min: 20 } });
      const report = await performingRoute(new Request("https://app.test/api/ads/performing", { headers: cookie }));
      expect((await report.json()).settings.filters).toEqual({ conversion: { min: 20 } });
      // The other two cards keep their own settings.
      const zero = await (await import("../../api/ads/zero-sales.js")).GET(new Request("https://app.test/api/ads/zero-sales", { headers: cookie }));
      expect((await zero.json()).settings.filters).toEqual({ spend: { min: 10 }, orders: { max: 0 } });
      const acos = await (await import("../../api/ads/high-acos.js")).GET(new Request("https://app.test/api/ads/high-acos", { headers: cookie }));
      expect((await acos.json()).settings.filters).toEqual({ acos: { min: 50 } });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
