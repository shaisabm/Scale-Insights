import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { GET as performingRoute } from "../../api/ads/performing.js";
import { PUT as saveRoute } from "../../api/ads/performing-settings.js";
import { PERFORMING_DEFAULTS, cleanZeroSettings, loadZeroSettings, saveZeroSettings } from "../../server/ads/insight-settings.js";
import { zeroSales } from "../../server/ads/zero-sales.js";
import { SESSION_COOKIE, createSessionToken } from "../../server/auth.js";
import { getDb, migrate } from "../../server/db.js";
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
  it("applies the same ad-group conversion filter to two-ASIN ad groups", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SP_SEARCH", start: to, end: to, rows: [
      { ...searchRow("weighted rope", 2, { impressions: 4, clicks: 2, orders: 1, sales: 25 }), campaignId: "multi", adGroupId: "winner" },
      { ...searchRow("weighted rope", 8, { impressions: 40, clicks: 20, orders: 0, sales: 0 }), campaignId: "multi", adGroupId: "loser" },
      { ...searchRow("weighted rope", 1, { impressions: 2, clicks: 1, orders: 1, sales: 25 }), campaignId: "single", adGroupId: "winner" },
    ], syncedAt: "now" });
    await storeWindow(db, { profileId, product: "SP", start: to, end: to, rows: [
      ...["winner", "loser"].flatMap(adGroupId => ["B0PRODUCTA", "B0PRODUCTB"].map(asin => ({
        date: to, campaignId: "multi", adGroupId, asin, impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0,
      }))),
      { date: to, campaignId: "single", adGroupId: "winner", asin: "B0PRODUCTA", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 },
    ], syncedAt: "now" });

    const data = await zeroSales(db, { profileId, from, to, settings: PERFORMING_DEFAULTS, perAdGroup: true });
    expect(data.rows.map(r => [r.asin, r.campaignId, r.adGroupId, r.term, r.clicks, r.orders, r.conversion])).toEqual([
      ["B0PRODUCTA", "single", "winner", "weighted rope", 1, 1, 100],
      ["B0PRODUCTA,B0PRODUCTB", "multi", "winner", "weighted rope", 2, 1, 50],
    ]);
    expect(data.total).toBe(2);
  });

  it("filters each campaign and ad group before another group's clicks can dilute conversion", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SB_SEARCH", start: to, end: to, rows: [
      { product: "SB_SEARCH", date: to, campaignId: "jump", adGroupId: "pink", term: "battle ropes", impressions: 289, clicks: 3, cost: 3, orders: 1, units: 1, sales: 24.99 },
      { product: "SB_SEARCH", date: to, campaignId: "other", adGroupId: "pink", term: "battle ropes", impressions: 500, clicks: 21, cost: 10, orders: 0, units: 0, sales: 0 },
      { product: "SB_SEARCH", date: to, campaignId: "battle", adGroupId: "pink", term: "workout equipment", impressions: 124, clicks: 1, cost: 1, orders: 1, units: 1, sales: 25.99 },
      { product: "SB_SEARCH", date: to, campaignId: "battle", adGroupId: "black", term: "workout equipment", impressions: 600, clicks: 9, cost: 5, orders: 0, units: 0, sales: 0 },
    ], syncedAt: "now" });
    for (const [campaign, group] of [["jump", "pink"], ["other", "pink"], ["battle", "pink"], ["battle", "black"]]) {
      await db.execute({ sql: "INSERT INTO ads_search_product_history VALUES (?, 'SB_SEARCH', ?, ?, 'B0PRODUCTA', ?, ?, ?)", args: [profileId, campaign, group, to, to, to] });
    }
    const data = await zeroSales(db, { profileId, from, to, settings: PERFORMING_DEFAULTS, perAdGroup: true });
    expect(data.rows.map(r => [r.term, r.campaignId, r.adGroupId, r.clicks, r.orders])).toEqual([
      ["workout equipment", "battle", "pink", 1, 1],
      ["battle ropes", "jump", "pink", 3, 1],
    ]);
    expect(data.rows[0].conversion).toBe(100);
    expect(data.rows[1].conversion).toBeCloseTo(100 / 3);
  });

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
    const data = await zeroSales(db, { profileId, from, to, settings: PERFORMING_DEFAULTS, perAdGroup: true });
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


  it("uses ad-group rows in the authenticated Performing route", async () => {
    vi.stubEnv("SESSION_SECRET", "secret");
    vi.stubEnv("TURSO_DATABASE_URL", ":memory:");
    vi.stubEnv("AMAZON_ADS_PROFILE_ID", "performing-route-grain");
    try {
      const db = await migrate(getDb());
      const routeProfile = "performing-route-grain";
      await storeWindow(db, { profileId: routeProfile, product: "SB_SEARCH", start: to, end: to, rows: [
        { product: "SB_SEARCH", date: to, campaignId: "winning", adGroupId: "pink", term: "battle ropes", impressions: 100, clicks: 3, cost: 3, orders: 1, units: 1, sales: 24.99 },
        { product: "SB_SEARCH", date: to, campaignId: "other", adGroupId: "pink", term: "battle ropes", impressions: 500, clicks: 21, cost: 10, orders: 0, units: 0, sales: 0 },
      ], syncedAt: "now" });
      for (const campaign of ["winning", "other"]) {
        await db.execute({ sql: "INSERT INTO ads_search_product_history VALUES (?, 'SB_SEARCH', ?, 'pink', 'B0PRODUCTA', ?, ?, ?)", args: [routeProfile, campaign, to, to, to] });
      }
      const response = await performingRoute(new Request(`https://app.test/api/ads/performing?from=${from}&to=${to}`, { headers: cookie }));
      expect(response.status).toBe(200);
      const report = await response.json();
      expect(report.rows.map(r => [r.term, r.campaignId, r.adGroupId, r.clicks, r.orders])).toEqual([["battle ropes", "winning", "pink", 3, 1]]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
