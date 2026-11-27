import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { GET as highAcosRoute } from "../../api/ads/high-acos.js";
import { PUT as saveRoute } from "../../api/ads/[settings].js";
import { ACOS_DEFAULTS, ZERO_DEFAULTS, cleanZeroSettings, loadZeroSettings, saveZeroSettings } from "../../server/ads/insight-settings.js";
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

describe("High ACOS defaults", () => {
  it("filter ACOS from 50% up, worst first, like the 0 Sales card otherwise", () => {
    expect(ACOS_DEFAULTS.name).toBe("Search Terms with High ACOS");
    expect(ACOS_DEFAULTS.filters).toEqual({ acos: { min: 50 } });
    expect([ACOS_DEFAULTS.sort, ACOS_DEFAULTS.dir]).toEqual(["acos", "desc"]);
    expect(ACOS_DEFAULTS.hideAsins).toBe(true);
  });

  it("validate through the shared settings checks", () => {
    expect(cleanZeroSettings({ ...ACOS_DEFAULTS, filters: { acos: { min: 60 } } }).settings.filters).toEqual({ acos: { min: 60 } });
    expect(cleanZeroSettings({ ...ACOS_DEFAULTS, sort: "nope" }).error).toMatch("sort");
  });

  it("save and load per profile under the card's own insight key", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    expect(await loadZeroSettings(db, profileId, ACOS_DEFAULTS)).toEqual(ACOS_DEFAULTS);
    const mine = cleanZeroSettings({ ...ACOS_DEFAULTS, filters: { acos: { min: 80 } } }).settings;
    await saveZeroSettings(db, profileId, mine, "t", ACOS_DEFAULTS);
    expect(await loadZeroSettings(db, profileId, ACOS_DEFAULTS)).toEqual(mine);
    // The 0 Sales card's own settings are untouched.
    expect(await loadZeroSettings(db, profileId)).not.toEqual(mine);
  });
});

describe("zeroSales with the High ACOS defaults", () => {
  it("keeps a term's product-level ACOS across ad groups", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SB_SEARCH", start: to, end: to, rows: [
      { ...searchRow("battle ropes", 8, { clicks: 3, orders: 1, sales: 24.99 }), product: "SB_SEARCH" },
      { ...searchRow("battle ropes", 13.95, { clicks: 20, orders: 0, sales: 0 }), product: "SB_SEARCH", campaignId: "other", adGroupId: "3" },
    ], syncedAt: "now" });
    for (const [campaign, group] of [["1", "2"], ["other", "3"]]) {
      await db.execute({ sql: "INSERT INTO ads_search_product_history VALUES (?, 'SB_SEARCH', ?, ?, 'B0PRODUCTA', ?, ?, ?)", args: [profileId, campaign, group, to, to, to] });
    }
    const data = await zeroSales(db, { profileId, from, to, settings: ACOS_DEFAULTS });
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({ term: "battle ropes", clicks: 23, orders: 1, spend: 21.95, sales: 24.99 });
    expect(data.rows[0].acos).toBeCloseTo(21.95 / 24.99 * 100);
    const zeroCard = await zeroSales(db, { profileId, from, to, settings: { ...ZERO_DEFAULTS, filters: {} } });
    expect(zeroCard.rows[0]).toMatchObject({ term: "battle ropes", clicks: 23, orders: 1, spend: 21.95, sales: 24.99 });
  });

  it("keeps terms from 50% ACOS up, worst first, and hides ASIN terms", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SP_SEARCH", start: to, end: to, rows: [
      searchRow("worst term", 29), // 145% ACOS
      searchRow("middle term", 16), // 80% ACOS
      searchRow("cheap term", 8), // 40% ACOS, below the default filter
      searchRow("B0HIGHACOS", 50, { sales: 25 }), // 200% ACOS, but an ASIN
    ], syncedAt: "now" });
    await storeWindow(db, { profileId, product: "SP", start: to, end: to, rows: [
      { date: to, campaignId: "1", adGroupId: "2", asin: "B0PRODUCTA", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 },
    ], syncedAt: "now" });
    const data = await zeroSales(db, { profileId, from, to, settings: ACOS_DEFAULTS });
    expect(data.rows.map(r => [r.term, r.acos])).toEqual([["worst term", 145], ["middle term", 80]]);
    expect(data.totals.acos).toBeCloseTo((29 + 16) / (20 + 20) * 100);
  });
});

describe("GET /api/ads/high-acos and PUT /api/ads/high-acos-settings", () => {
  const put = (body, signedIn = true) => saveRoute(new Request("https://app.test/api/ads/high-acos-settings", {
    method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(signedIn ? cookie : {}) },
  }));

  it("need sign-in, refuse invalid settings, and save valid ones for the High ACOS report", async () => {
    vi.stubEnv("SESSION_SECRET", "secret");
    vi.stubEnv("TURSO_DATABASE_URL", ":memory:");
    vi.stubEnv("AMAZON_ADS_PROFILE_ID", profileId);
    try {
      expect((await highAcosRoute(new Request("https://app.test/api/ads/high-acos"))).status).toBe(401);
      expect((await put({ name: "Mine" }, false)).status).toBe(401);
      expect((await put("not json")).status).toBe(400);
      const bad = await put({ ...ACOS_DEFAULTS, filters: { acos: { min: 90, max: 10 } } });
      expect(bad.status).toBe(400);
      const ok = await put({ ...ACOS_DEFAULTS, filters: { acos: { min: 80 } } });
      expect(ok.status).toBe(200);
      expect((await ok.json()).settings.filters).toEqual({ acos: { min: 80 } });
      const report = await highAcosRoute(new Request("https://app.test/api/ads/high-acos", { headers: cookie }));
      expect((await report.json()).settings.filters).toEqual({ acos: { min: 80 } });
      // The zero-sales card keeps its own settings.
      const zero = await (await import("../../api/ads/zero-sales.js")).GET(new Request("https://app.test/api/ads/zero-sales", { headers: cookie }));
      expect((await zero.json()).settings.filters).toEqual({ spend: { min: 10 }, orders: { max: 0 } });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
