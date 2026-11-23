import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { GET as zeroSalesRoute } from "../../api/ads/zero-sales.js";
import { normalizeRows, refreshSbProducts, reportSpec, storeWindow, syncAds } from "../../server/ads/sync.js";
import { zeroSales } from "../../server/ads/zero-sales.js";
import { SESSION_COOKIE, createSessionToken } from "../../server/auth.js";
import { migrate } from "../../server/db.js";
import { addDays, todayIn } from "../../server/http.js";

const profileId = "test-profile";
const from = "2026-10-23", to = "2026-11-21";

const searchRow = (term, cost, { product = "SP_SEARCH", campaignId = "1", adGroupId = "2", impressions = 100, clicks = 10, orders = 0 } = {}) => ({
  product, date: to, campaignId, adGroupId, term, impressions, clicks, cost, orders, sales: 0,
});

describe("search term reports", () => {
  it("requires sign-in before returning account search terms", async () => {
    vi.stubEnv("SESSION_SECRET", "test-session-secret");
    try {
      expect((await zeroSalesRoute(new Request("https://app.test/api/ads/zero-sales"))).status).toBe(401);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("requests the documented search-term grains and normalizes their rows", () => {
    expect(reportSpec("SP_SEARCH", { start: from, end: to }).configuration).toMatchObject({ reportTypeId: "spSearchTerm", groupBy: ["searchTerm"], timeUnit: "DAILY" });
    expect(reportSpec("SB_SEARCH", { start: from, end: to }).configuration).toMatchObject({ reportTypeId: "sbSearchTerm", groupBy: ["searchTerm"] });
    expect(normalizeRows("SP_SEARCH", [{ date: to, campaignId: 1, adGroupId: 2, searchTerm: "jump rope", impressions: 10, clicks: 2, cost: 1.5, purchases7d: 0, sales7d: 0 }])).toEqual([
      { date: to, campaignId: "1", adGroupId: "2", term: "jump rope", impressions: 10, clicks: 2, cost: 1.5, orders: 0, units: 0, sales: 0 },
    ]);
  });

  it("groups by advertised product before filtering zero-order terms and pages seven at a time", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const sp = Array.from({ length: 8 }, (_, i) => searchRow(`term ${i}`, 30 - i));
    sp.push(searchRow("term 0", 5, { campaignId: "other" }));
    sp.push(searchRow("term with a sale", 50, { orders: 1 }));
    sp.push(searchRow("below minimum", 9.99));
    sp.push(searchRow("B0ABC12345", 40));
    await storeWindow(db, { profileId, product: "SP_SEARCH", start: to, end: to, rows: sp, syncedAt: "now" });
    await storeWindow(db, { profileId, product: "SB_SEARCH", start: to, end: to, rows: [searchRow("brand term", 10, { product: "SB_SEARCH" })], syncedAt: "now" });
    await storeWindow(db, { profileId, product: "SP", start: to, end: to, rows: [
      { date: to, campaignId: "1", adGroupId: "2", asin: "B0PRODUCTA", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 },
      { date: to, campaignId: "other", adGroupId: "2", asin: "B0PRODUCTA", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 },
    ], syncedAt: "now" });
    await refreshSbProducts(db, { request: async () => ({ status: 200, data: { ads: [{ campaignId: "1", adGroupId: "2", creative: { asins: ["B0PRODUCTA"] } }] } }) }, profileId);
    const first = await zeroSales(db, { profileId, from, to });
    expect(first.total).toBe(9);
    expect(first.rows).toHaveLength(7);
    expect(first.rows[0]).toMatchObject({ term: "term 0", sponsored: "Products", impressions: 200, pl: -35 });
    expect(first.rows.every(r => r.term !== "B0ABC12345" && r.term !== "term with a sale")).toBe(true);
    expect(first.totals).toEqual({ impressions: 800, clicks: 80, pl: -194 });
    const second = await zeroSales(db, { profileId, from, to, page: 1 });
    expect(second.rows.map(r => r.term)).toEqual(["term 7", "brand term"]);
    expect(second.rows[1].pl).toBeNull();
    expect(second.totals).toEqual({ impressions: 200, clicks: 20, pl: -23 });
    expect((await db.execute("SELECT COUNT(*) AS n FROM ads_daily")).rows[0].n).toBe(2);
  });

  it("syncs both search reports into their own table without changing trend rows", async () => {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    await storeWindow(db, { profileId, product: "SP", start: to, end: to, rows: [{ date: to, campaignId: "1", adGroupId: "2", asin: "B0PRODUCTA", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 }], syncedAt: "now" });
    const specs = new Map();
    const ads = {
      async request() { return { status: 200, data: { ads: [{ campaignId: "1", adGroupId: "2", creative: { asins: ["B0PRODUCTA"] } }] } }; },
      async createReport(profile, spec) {
        const id = `report-${spec.configuration.reportTypeId}-${spec.startDate}`;
        specs.set(id, spec);
        return id;
      },
      async getReport(profile, id) { return { status: "COMPLETED", url: id }; },
      async downloadReport(id) {
        const sp = specs.get(id).configuration.reportTypeId === "spSearchTerm";
        return [{ date: to, campaignId: "1", adGroupId: "2", searchTerm: sp ? "jump rope" : "battle ropes", impressions: 100, clicks: 10, cost: 12, purchases7d: 0, sales7d: 0, purchases: 0, sales: 0 }];
      },
    };
    const now = () => Date.UTC(2026, 10, 22, 15);
    const summary = await syncAds({ db, ads, profileId, products: ["SP_SEARCH", "SB_SEARCH"], now, budgetMs: 30_000, sleep: async () => {} });
    // 90 days of Sponsored Products search terms take 3 reports, 60 days of Sponsored Brands take 2.
    expect(summary).toMatchObject({ requested: 5, stored: 5, rows: 5, pending: 0 });
    expect((await zeroSales(db, { profileId, from, to })).rows.map(r => r.term)).toEqual(["battle ropes", "jump rope"]);
    expect((await db.execute("SELECT COUNT(*) AS n FROM ads_daily")).rows[0].n).toBe(1);
  });

  it("keeps Sponsored Brands coverage incomplete until a product map has been built", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SB_SEARCH", start: from, end: to, rows: [searchRow("brand term", 10, { product: "SB_SEARCH" })], syncedAt: "now" });
    const before = await zeroSales(db, { profileId, from, to });
    expect(before.coverage.SB_SEARCH).toMatchObject({ days: 30, expectedDays: 30, mapReady: false });
    expect(before.rows).toEqual([]);
    await refreshSbProducts(db, { request: async () => ({ status: 200, data: { ads: [{ campaignId: "1", adGroupId: "2", creative: { asins: ["B0PRODUCTA"] } }] } }) }, profileId);
    const after = await zeroSales(db, { profileId, from, to });
    expect(after.coverage.SB_SEARCH).toMatchObject({ mapReady: true });
    expect(after.rows.map(r => r.term)).toEqual(["brand term"]);
  });

  it("records each map refresh, and keeps the last usable map when a later refresh fails", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const listed = () => ({ status: 200, data: { ads: [{ campaignId: "1", adGroupId: "2", creative: { asins: ["B0PRODUCTA"] } }] } });
    const down = () => ({ status: 503, data: {} });
    const ads = list => ({
      request: async () => list(),
      async createReport(profile, spec) { return `report-${spec.startDate}`; },
      async getReport(profile, id) { return { status: "COMPLETED", url: id }; },
      async downloadReport() { return []; },
    });
    const run = list => syncAds({ db, ads: ads(list), profileId, products: ["SB_SEARCH"], now: () => Date.UTC(2026, 10, 22, 15), budgetMs: 30_000, sleep: async () => {} });
    const mapReady = async () => (await zeroSales(db, { profileId, from, to })).coverage.SB_SEARCH.mapReady;
    const mapRows = async () => Number((await db.execute("SELECT COUNT(*) AS n FROM ads_search_product_map")).rows[0].n);

    expect((await run(down)).errors).toContain("SB product map: Sponsored Brands ad list failed: HTTP 503");
    expect(await mapReady()).toBe(false);
    await run(listed);
    expect([await mapReady(), await mapRows()]).toEqual([true, 1]);
    await run(down);
    expect([await mapReady(), await mapRows()]).toEqual([true, 1]);
  });

  it("shows each product's title and a link to its image served by this site", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SP_SEARCH", start: to, end: to, rows: [searchRow("jump rope", 20)], syncedAt: "now" });
    await storeWindow(db, { profileId, product: "SP", start: to, end: to, rows: [{ date: to, campaignId: "1", adGroupId: "2", asin: "B0PRODUCTA", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 }], syncedAt: "now" });
    expect((await zeroSales(db, { profileId, from, to })).rows[0]).toMatchObject({ asin: "B0PRODUCTA", title: "", image: null });
    await db.execute({ sql: "INSERT INTO ads_products (profile_id, asin, title, image_url, updated_at) VALUES (?, 'B0PRODUCTA', 'Battle Ropes', 'https://m.media-amazon.com/images/I/a.jpg', 't')", args: [profileId] });
    expect((await zeroSales(db, { profileId, from, to })).rows[0]).toMatchObject({ title: "Battle Ropes", image: "/api/ads/product-image?asin=B0PRODUCTA" });
  });

  it("expects only the dates Amazon can provide to be synced", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    // Today is 2026-11-22: Amazon reports through yesterday, and keeps 90 days of Sponsored
    // Products and 60 days of Sponsored Brands search terms.
    const range = { profileId, from: "2026-01-01", to: "2026-11-22", today: "2026-11-22" };
    await storeWindow(db, { profileId, product: "SP_SEARCH", start: "2026-08-24", end: "2026-11-21", rows: [], syncedAt: "now" });
    const { coverage } = await zeroSales(db, range);
    expect(coverage.SP_SEARCH).toMatchObject({ days: 90, expectedDays: 90, availableFrom: "2026-08-24", reportedThrough: "2026-11-21" });
    expect(coverage.SB_SEARCH).toMatchObject({ days: 0, expectedDays: 60, availableFrom: "2026-09-23" });
    const old = await zeroSales(db, { ...range, from: "2025-01-01", to: "2025-12-31" });
    expect(old.coverage.SP_SEARCH).toMatchObject({ days: 0, expectedDays: 0 });
  });

  it("accepts any range up to today, and refuses reversed, future or over-long ones", async () => {
    vi.stubEnv("SESSION_SECRET", "secret");
    vi.stubEnv("TURSO_DATABASE_URL", ":memory:");
    vi.stubEnv("AMAZON_ADS_PROFILE_ID", profileId);
    try {
      const today = todayIn("America/Los_Angeles");
      const get = query => zeroSalesRoute(new Request(`https://app.test/api/ads/zero-sales?${query}`, { headers: { cookie: `${SESSION_COOKIE}=${createSessionToken("secret")}` } }));
      const ok = await get(`from=${addDays(today, -365)}&to=${today}`);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ from: addDays(today, -365), to: today });
      expect((await get(`from=${today}&to=${addDays(today, -1)}`)).status).toBe(400);
      expect((await get(`from=${today}&to=${addDays(today, 1)}`)).status).toBe(400);
      expect((await get(`from=${addDays(today, -500)}&to=${today}`)).status).toBe(400);
      expect((await get("from=2026-02-30&to=2026-03-01")).status).toBe(400);
      expect(await (await get("days=7")).json()).toMatchObject({ from: addDays(today, -7), to: addDays(today, -1) });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refreshes product details when it syncs search terms", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SP", start: to, end: to, rows: [{ date: to, campaignId: "1", adGroupId: "2", asin: "B0PRODUCTA", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 }], syncedAt: "now" });
    const ads = {
      async request(method, path) {
        if (path === "/product/metadata") return { status: 200, data: { ProductMetadataList: [{ asin: "B0PRODUCTA", title: "Battle Ropes", imageUrl: "https://m.media-amazon.com/images/I/a.jpg" }] } };
        return { status: 200, data: { ads: [] } };
      },
      async createReport(profile, spec) { return `report-${spec.configuration.reportTypeId}-${spec.startDate}`; },
      async getReport(profile, id) { return { status: "COMPLETED", url: id }; },
      async downloadReport() { return []; },
    };
    const summary = await syncAds({ db, ads, profileId, products: ["SP_SEARCH"], now: () => Date.UTC(2026, 10, 22, 15), budgetMs: 30_000, sleep: async () => {} });
    expect(summary.errors).toEqual([]);
    expect((await db.execute("SELECT title FROM ads_products WHERE asin = 'B0PRODUCTA'")).rows[0].title).toBe("Battle Ropes");
  });
});
