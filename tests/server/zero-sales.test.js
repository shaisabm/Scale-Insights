import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { GET as zeroSalesRoute } from "../../api/ads/zero-sales.js";
import { normalizeRows, refreshSbProducts, reportSpec, storeWindow, syncAds } from "../../server/ads/sync.js";
import { ZERO_DEFAULTS } from "../../server/ads/insight-settings.js";
import { zeroSales } from "../../server/ads/zero-sales.js";
import { SESSION_COOKIE, createSessionToken } from "../../server/auth.js";
import { migrate } from "../../server/db.js";
import { addDays, todayIn } from "../../server/http.js";

const profileId = "test-profile";
const from = "2026-10-23", to = "2026-11-21";

const searchRow = (term, cost, { product = "SP_SEARCH", campaignId = "1", adGroupId = "2", impressions = 100, clicks = 10, orders = 0 } = {}) => ({
  product, date: to, campaignId, adGroupId, term, impressions, clicks, cost, orders, units: orders, sales: 0,
});

// Midday in Los Angeles on a date, as the epoch milliseconds Amazon's ads list uses.
const at = date => Date.parse(`${date}T20:00:00Z`);
const sbAd = (adGroupId, asins, { state = "ENABLED", created = "2026-09-01", updated = created } = {}) =>
  ({ adId: `${adGroupId}-${asins.join("-")}-${state}`, campaignId: "1", adGroupId, state, creative: { asins }, extendedData: { creationDate: at(created), lastUpdateDate: at(updated) } });
const scanOn = (db, date, ...list) => refreshSbProducts(db, { request: async () => ({ status: 200, data: { ads: list } }) }, profileId, { now: () => at(date) });

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

  it("keeps ad groups separate while filtering zero-order terms and pages seven at a time", async () => {
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
    await scanOn(db, "2026-11-22", sbAd("2", ["B0PRODUCTA"]));
    const first = await zeroSales(db, { profileId, from, to });
    expect(first.total).toBe(9);
    expect(first.rows).toHaveLength(7);
    expect(first.rows[0]).toMatchObject({ term: "term 0", campaignId: "1", adGroupId: "2", sponsored: "Products", impressions: 100, pl: -30 });
    expect(first.rows.every(r => r.term !== "B0ABC12345" && r.term !== "term with a sale")).toBe(true);
    expect(first.totals).toMatchObject({ impressions: 700, clicks: 70, pl: -189 });
    const second = await zeroSales(db, { profileId, from, to, page: 1 });
    expect(second.rows.map(r => r.term)).toEqual(["term 7", "brand term"]);
    expect(second.rows[1].pl).toBeNull();
    expect(second.totals).toMatchObject({ impressions: 200, clicks: 20, pl: -23 });
    // A page past the end (say, results shrank after a sync) gives the last page, so the pager stays.
    const beyond = await zeroSales(db, { profileId, from, to, page: 5 });
    expect([beyond.page, beyond.rows.map(r => r.term)]).toEqual([1, ["term 7", "brand term"]]);
    expect((await db.execute("SELECT COUNT(*) AS n FROM ads_daily")).rows[0].n).toBe(2);
  });

  it("syncs both search reports into their own table without changing trend rows", async () => {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    await storeWindow(db, { profileId, product: "SP", start: to, end: to, rows: [{ date: to, campaignId: "1", adGroupId: "2", asin: "B0PRODUCTA", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 }], syncedAt: "now" });
    const specs = new Map();
    const ads = {
      async request() { return { status: 200, data: { ads: [sbAd("2", ["B0PRODUCTA"])] } }; },
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
    await scanOn(db, "2026-11-22", sbAd("2", ["B0PRODUCTA"]));
    const after = await zeroSales(db, { profileId, from, to });
    expect(after.coverage.SB_SEARCH).toMatchObject({ mapReady: true });
    expect(after.rows.map(r => r.term)).toEqual(["brand term"]);
  });

  it("records each map refresh, and keeps the last usable map when a later refresh fails", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const listed = () => ({ status: 200, data: { ads: [sbAd("2", ["B0PRODUCTA"])] } });
    const down = () => ({ status: 503, data: {} });
    const ads = list => ({
      request: async () => list(),
      async createReport(profile, spec) { return `report-${spec.startDate}`; },
      async getReport(profile, id) { return { status: "COMPLETED", url: id }; },
      async downloadReport() { return []; },
    });
    const run = list => syncAds({ db, ads: ads(list), profileId, products: ["SB_SEARCH"], now: () => Date.UTC(2026, 10, 22, 15), budgetMs: 30_000, sleep: async () => {} });
    const mapReady = async () => (await zeroSales(db, { profileId, from, to })).coverage.SB_SEARCH.mapReady;
    const mapRows = async () => Number((await db.execute("SELECT COUNT(*) AS n FROM ads_search_product_history")).rows[0].n);

    const error = async () => (await db.execute("SELECT error FROM ads_product_map_status")).rows[0].error;

    expect((await run(down)).errors).toContain("SB product map: Sponsored Brands ad list failed: HTTP 503");
    expect([await mapReady(), await error()]).toEqual([false, "Sponsored Brands ad list failed: HTTP 503"]);
    await run(listed);
    expect([await mapReady(), await mapRows(), await error()]).toEqual([true, 1, null]);
    await run(down);
    expect([await mapReady(), await mapRows()]).toEqual([true, 1]);
  });

  it("records a failed list's error only while that sync still holds the lease", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const ads = {
      async request() {
        // Another sync takes over while this request is out, and then the request fails.
        await db.execute("UPDATE ads_product_map_status SET lease_owner = 'other', lease_until = 0");
        return { status: 503, data: {} };
      },
      async createReport(profile, spec) { return `report-${spec.startDate}`; },
      async getReport(profile, id) { return { status: "COMPLETED", url: id }; },
      async downloadReport() { return []; },
    };
    const summary = await syncAds({ db, ads, profileId, products: ["SB_SEARCH"], now: () => Date.UTC(2026, 10, 22, 15), budgetMs: 30_000, sleep: async () => {} });
    // The failure stays in this sync's summary, but can't overwrite what the other sync records.
    expect(summary.errors).toContain("SB product map: Sponsored Brands ad list failed: HTTP 503");
    expect((await db.execute("SELECT error, lease_owner FROM ads_product_map_status")).rows.map(r => [r.error, r.lease_owner])).toEqual([[null, "other"]]);
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
      for (const days of ["abc", "1e9", "31", "-7"]) expect((await get(`days=${days}`)).status).toBe(400);
      // A preset that would start before year 0 isn't a date.
      expect((await get("to=0000-01-05&days=30")).status).toBe(400);
      // 400 dates at most, counting both ends.
      expect((await get(`from=${addDays(today, -399)}&to=${today}`)).status).toBe(200);
      expect((await get(`from=${addDays(today, -400)}&to=${today}`)).status).toBe(400);
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

  it("works out every metric and applies the saved filters, sort and hide options", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SP_SEARCH", start: to, end: to, rows: [
      searchRow("jump rope", 20, { impressions: 1000, clicks: 40 }),
      { ...searchRow("battle ropes", 30, { impressions: 500, clicks: 10, orders: 2 }), units: 3, sales: 60 },
      searchRow("B0ABC12345", 15, { impressions: 200, clicks: 5 }),
    ], syncedAt: "now" });
    await storeWindow(db, { profileId, product: "SP", start: to, end: to, rows: [{ date: to, campaignId: "1", adGroupId: "2", asin: "B0PRODUCTA", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 }], syncedAt: "now" });
    const run = changes => zeroSales(db, { profileId, from, to, settings: { ...structuredClone(ZERO_DEFAULTS), filters: {}, ...changes } });
    const sold = (await run({ sort: "spend" })).rows.find(r => r.term === "battle ropes");
    expect(sold).toMatchObject({ impressions: 500, clicks: 10, orders: 2, units: 3, spend: 30, sales: 60, cpc: 3, ctr: 2, conversion: 20, acos: 50, roas: 2, pl: null, breakEvenBid: null });
    expect((await run({})).rows.find(r => r.term === "jump rope")).toMatchObject({ pl: -20, acos: null, roas: 0 });
    // Hide options: ASIN terms or word terms.
    expect((await run({ hideAsins: false })).rows.map(r => r.term)).toContain("B0ABC12345");
    expect((await run({ hideAsins: false, hideKeywords: true })).rows.map(r => r.term)).toEqual(["B0ABC12345"]);
    // Filters on any metric, and sorting either way.
    expect((await run({ filters: { ctr: { min: 3 } } })).rows.map(r => r.term)).toEqual(["jump rope"]);
    expect((await run({ filters: { roas: { min: 1 } } })).rows.map(r => r.term)).toEqual(["battle ropes"]);
    expect((await run({ sort: "clicks", dir: "asc" })).rows.map(r => r.term)).toEqual(["battle ropes", "jump rope"]);
    // Unknown values (P&L where something sold) never pass a filter on that metric, and sort last.
    expect((await run({ filters: { pl: { max: 0 } } })).rows.map(r => r.term)).toEqual(["jump rope"]);
    expect((await run({ sort: "pl", dir: "asc" })).rows.map(r => r.term)).toEqual(["jump rope", "battle ropes"]);
    const page = await run({ sort: "spend" });
    expect(page.totals).toMatchObject({ impressions: 1500, clicks: 50, orders: 2, units: 3, spend: 50, sales: 60, cpc: 1, roas: 1.2, pl: -20 });
    expect(page.settings).toMatchObject({ sort: "spend" });
  });

  it("stores units from search reports", () => {
    expect(normalizeRows("SP_SEARCH", [{ date: to, campaignId: 1, adGroupId: 2, searchTerm: "a", impressions: 1, clicks: 1, cost: 1, purchases7d: 1, unitsSoldClicks7d: 3, sales7d: 9 }])[0].units).toBe(3);
    expect(normalizeRows("SB_SEARCH", [{ date: to, campaignId: 1, adGroupId: 2, searchTerm: "a", impressions: 1, clicks: 1, cost: 1, purchases: 1, unitsSold: 2, sales: 9 }])[0].units).toBe(2);
    expect(reportSpec("SP_SEARCH", { start: to, end: to }).configuration.columns).toContain("unitsSoldClicks7d");
    expect(reportSpec("SB_SEARCH", { start: to, end: to }).configuration.columns).toContain("unitsSold");
  });

  it("adds units to an older database and marks its search days for re-fetching", async () => {
    const db = createClient({ url: ":memory:" });
    await db.batch([
      "CREATE TABLE ads_search_terms_daily (profile_id TEXT NOT NULL, ad_product TEXT NOT NULL, date TEXT NOT NULL, campaign_id TEXT NOT NULL, ad_group_id TEXT NOT NULL DEFAULT '', search_term TEXT NOT NULL, impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, orders INTEGER NOT NULL DEFAULT 0, sales REAL NOT NULL DEFAULT 0, PRIMARY KEY (profile_id, ad_product, date, campaign_id, ad_group_id, search_term))",
      "CREATE TABLE ads_synced_days (profile_id TEXT NOT NULL, ad_product TEXT NOT NULL, date TEXT NOT NULL, synced_at TEXT NOT NULL, PRIMARY KEY (profile_id, ad_product, date))",
      "CREATE TABLE ads_report_requests (report_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, ad_product TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL, requested_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT)",
      "INSERT INTO ads_report_requests VALUES ('old-search', 'p', 'SP_SEARCH', '2026-11-01', '2026-11-01', 'PENDING', 't', 't', NULL), ('trend', 'p', 'SP', '2026-11-01', '2026-11-01', 'PENDING', 't', 't', NULL)",
      "INSERT INTO ads_search_terms_daily (profile_id, ad_product, date, campaign_id, search_term) VALUES ('p', 'SP_SEARCH', '2026-11-01', '1', 'old term')",
      "INSERT INTO ads_synced_days VALUES ('p', 'SP_SEARCH', '2026-11-01', 't'), ('p', 'SB_SEARCH', '2026-11-01', 't'), ('p', 'SP', '2026-11-01', 't')",
    ], "write");
    await migrate(db);
    expect((await db.execute("SELECT units FROM ads_search_terms_daily")).rows[0].units).toBe(0);
    expect((await db.execute("SELECT ad_product FROM ads_synced_days")).rows.map(r => r.ad_product)).toEqual(["SP"]);
    // A search report requested without units can't be collected and mark those days synced again.
    expect((await db.execute("SELECT report_id, status FROM ads_report_requests ORDER BY report_id")).rows.map(r => [r.report_id, r.status])).toEqual([["old-search", "FAILED"], ["trend", "PENDING"]]);
  });

  it("checks and upgrades the schema inside one write transaction", async () => {
    const db = createClient({ url: ":memory:" });
    const transaction = vi.spyOn(db, "transaction");
    const execute = vi.spyOn(db, "execute");
    await migrate(db);
    // The write lock is taken before looking, so two cold starts can't both add a column.
    expect(transaction).toHaveBeenCalledWith("write");
    expect(execute.mock.calls.some(([stmt]) => /PRAGMA table_info/.test(String(stmt?.sql ?? stmt)))).toBe(false);
  });

  it("matches Sponsored Brands search terms to the product each ad group had on that date", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const term = (date, adGroupId, cost) => ({ ...searchRow("brand term", cost, { product: "SB_SEARCH", adGroupId }), date });
    await storeWindow(db, { profileId, product: "SB_SEARCH", start: "2026-09-01", end: "2026-11-21", syncedAt: "now", rows: [
      term("2026-09-15", "2", 5), // before the ad's last change: unknown
      term("2026-10-20", "2", 10), // product A
      term("2026-11-11", "2", 7), // after the first list saw A, before the change to B: unknown
      term("2026-11-15", "2", 20), // product B
      term("2026-11-20", "2", 3), // the day of the second list: unknown until a later list confirms it
      term("2026-11-15", "3", 12), // a new ad group counts from the day its ad was made
      term("2026-11-03", "4", 30), // D and E were both advertised until D's ad was archived
      term("2026-11-08", "4", 40),
    ] });
    const now = [
      sbAd("2", ["B0PRODUCTB"], { updated: "2026-11-12" }),
      sbAd("3", ["B0PRODUCTC"], { created: "2026-11-15" }),
      sbAd("4", ["B0PRODUCTD"], { state: "ARCHIVED", updated: "2026-11-05" }),
      sbAd("4", ["B0PRODUCTE"], { created: "2026-10-01" }),
    ];
    expect(await scanOn(db, "2026-11-10", sbAd("2", ["B0PRODUCTA"], { updated: "2026-10-01" }))).toBe(true);
    await scanOn(db, "2026-11-20", ...now);
    const run = () => zeroSales(db, { profileId, from: "2026-09-01", to: "2026-11-21", settings: { ...structuredClone(ZERO_DEFAULTS), filters: {} } });
    const first = await run();
    expect(first.rows.map(r => [r.asin, r.spend])).toEqual([["B0PRODUCTE", 40], ["B0PRODUCTB", 20], ["B0PRODUCTC", 12], ["B0PRODUCTA", 10]]);
    expect(first.coverage.SB_SEARCH.unattributedSpend).toBe(45);
    // Sponsored Brands P&L is unknown, so a page of only those rows has no P&L total either.
    expect(first.totals.pl).toBeNull();
    // A later list that finds nothing changed confirms the dates since the last one.
    await scanOn(db, "2026-11-22", ...now);
    const second = await run();
    expect(second.rows.find(r => r.asin === "B0PRODUCTB").spend).toBe(23);
    expect(second.coverage.SB_SEARCH.unattributedSpend).toBe(42);
  });

  it("shows search terms from an ad group advertising several products as one row naming each of them", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SP_SEARCH", start: to, end: to, rows: [searchRow("jump rope", 20)], syncedAt: "now" });
    await storeWindow(db, { profileId, product: "SP", start: to, end: to, syncedAt: "now", rows: ["B0PRODUCTB", "B0PRODUCTA"].map(asin => (
      { date: to, campaignId: "1", adGroupId: "2", asin, impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 })) });
    await storeWindow(db, { profileId, product: "SB_SEARCH", start: to, end: to, rows: [searchRow("brand term", 15, { product: "SB_SEARCH", adGroupId: "3" })], syncedAt: "now" });
    await scanOn(db, "2026-11-22", sbAd("3", ["B0PRODUCTD", "B0PRODUCTC"]));
    await db.execute({ sql: "INSERT INTO ads_products (profile_id, asin, title, image_url, updated_at) VALUES (?, 'B0PRODUCTA', 'Pink Ropes', 'https://m.media-amazon.com/images/I/a.jpg', 't')", args: [profileId] });
    const result = await zeroSales(db, { profileId, from, to, settings: { ...structuredClone(ZERO_DEFAULTS), filters: {} } });
    const none = asin => ({ asin, title: "", image: null });
    expect(result.rows.map(r => [r.term, r.asin, r.products])).toEqual([
      ["jump rope", "B0PRODUCTA,B0PRODUCTB", [{ asin: "B0PRODUCTA", title: "Pink Ropes", image: "/api/ads/product-image?asin=B0PRODUCTA" }, none("B0PRODUCTB")]],
      ["brand term", "B0PRODUCTC,B0PRODUCTD", [none("B0PRODUCTC"), none("B0PRODUCTD")]],
    ]);
    expect(result.rows[0]).toMatchObject({ title: "Pink Ropes", image: "/api/ads/product-image?asin=B0PRODUCTA", pl: -20 });
    expect([result.coverage.SP_SEARCH.unattributedSpend, result.coverage.SB_SEARCH.unattributedSpend]).toEqual([0, 0]);
  });

  it("counts Sponsored Brands as matched only through the dates the latest finished list confirms", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const ready = async () => (await zeroSales(db, { profileId, from, to, today: "2026-11-22" })).coverage.SB_SEARCH.mapReady;
    // Read on the 20th, it confirms products through the 19th, but Amazon reports through the 21st.
    await scanOn(db, "2026-11-20", sbAd("2", ["B0PRODUCTA"]));
    expect(await ready()).toBe(false);
    await scanOn(db, "2026-11-22", sbAd("2", ["B0PRODUCTA"]));
    expect(await ready()).toBe(true);
  });

  it("leaves out an ad group whose enabled ads include one that lists no products", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SB_SEARCH", start: to, end: to, rows: [searchRow("brand term", 20, { product: "SB_SEARCH" })], syncedAt: "now" });
    await scanOn(db, "2026-11-22", sbAd("2", ["B0PRODUCTA"]), { ...sbAd("2", []), adId: "no-asins", creative: {} });
    const result = await zeroSales(db, { profileId, from, to, settings: { ...structuredClone(ZERO_DEFAULTS), filters: {} } });
    expect(result.rows).toEqual([]);
    expect(result.coverage.SB_SEARCH.unattributedSpend).toBe(20);
  });

  it("lists Sponsored Brands ads within half the sync budget, after collecting reports, and resumes where it stopped", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    let clock = at("2026-11-22");
    const events = [], tokens = [];
    const ads = {
      async request(method, path, { body }) {
        if (path !== "/sb/v4/ads/list") return { status: 200, data: { ProductMetadataList: [] } };
        // Six pages that take ten seconds each.
        events.push("list");
        tokens.push(body.nextToken ?? null);
        clock += 10_000;
        const page = Number(body.nextToken || 0);
        return { status: 200, data: { ads: [sbAd(`g${page}`, ["B0PRODUCTA"])], ...(page < 5 ? { nextToken: String(page + 1) } : {}) } };
      },
      async createReport(profile, spec) { return `report-${spec.startDate}`; },
      async getReport() { events.push("collect"); return { status: "COMPLETED", url: "u" }; },
      async downloadReport() { return []; },
    };
    await db.execute({
      sql: "INSERT INTO ads_report_requests (report_id, profile_id, ad_product, start_date, end_date, status, requested_at, updated_at) VALUES ('earlier', ?, 'SB_SEARCH', ?, ?, 'PENDING', ?, ?)",
      args: [profileId, to, to, new Date(clock).toISOString(), new Date(clock).toISOString()],
    });
    const run = () => syncAds({ db, ads, profileId, products: ["SB_SEARCH"], now: () => clock, budgetMs: 45_000, sleep: async ms => { clock += ms; } });
    const mapReady = async () => (await zeroSales(db, { profileId, from, to })).coverage.SB_SEARCH.mapReady;

    const first = await run();
    expect(events[0]).toBe("collect");
    expect(first).toMatchObject({ stored: 3, pending: 0, errors: [] });
    expect(tokens).toEqual([null, "1", "2"]);
    expect(await mapReady()).toBe(false);
    await run();
    expect(tokens).toEqual([null, "1", "2", "3", "4", "5"]);
    expect(await mapReady()).toBe(true);
    expect(Number((await db.execute("SELECT COUNT(*) AS n FROM ads_search_product_history")).rows[0].n)).toBe(6);
  });

  it("keeps a saved page token through a temporary failure, and starts over when Amazon refuses it", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    let clock = at("2026-11-22");
    const tokens = [];
    const ads = status => ({ request: async (method, path, { body }) => {
      tokens.push(body.nextToken ?? null);
      clock += 10_000;
      return { status, data: { ads: [], nextToken: "next" } };
    } });
    // Stops after one page, keeping its token for later.
    expect(await refreshSbProducts(db, ads(200), profileId, { now: () => clock, deadline: clock + 1 })).toBe(false);
    await expect(refreshSbProducts(db, ads(503), profileId, { now: () => clock })).rejects.toThrow(/HTTP 503/);
    await expect(refreshSbProducts(db, ads(400), profileId, { now: () => clock })).rejects.toThrow(/HTTP 400/);
    await refreshSbProducts(db, ads(200), profileId, { now: () => clock, deadline: clock + 1 });
    expect(tokens).toEqual([null, "next", "next", null]);
  });

  it("stops a page request still running at the deadline, keeping the last saved token", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    let clock = at("2026-11-22");
    const tokens = [];
    const quick = { request: async (method, path, { body }) => {
      tokens.push(body.nextToken ?? null);
      clock += 10_000;
      return { status: 200, data: { ads: [], nextToken: "next" } };
    } };
    // Answers only by failing once its signal aborts.
    const stuck = { request: (method, path, { body, signal }) => {
      tokens.push(body.nextToken ?? null);
      return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    } };
    expect(await refreshSbProducts(db, quick, profileId, { now: () => clock, deadline: clock + 1 })).toBe(false);
    expect(await refreshSbProducts(db, stuck, profileId, { deadline: Date.now() + 50 })).toBe(false);
    await refreshSbProducts(db, quick, profileId, { now: () => clock, deadline: clock + 1 });
    expect(tokens).toEqual([null, "next", "next"]);
  });

  it("records a finished list from its saved pages when recording failed, without listing again", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    let failRecording = true;
    const flaky = new Proxy(db, {
      get(target, key) {
        if (key === "batch") {
          return async (stmts, mode) => {
            if (failRecording && stmts.some(s => /^UPDATE ads_product_map_status SET ready_at/.test(s.sql ?? ""))) {
              failRecording = false;
              throw new Error("write failed");
            }
            return target.batch(stmts, mode);
          };
        }
        const value = target[key];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const request = vi.fn(async () => ({ status: 200, data: { ads: [sbAd("2", ["B0PRODUCTA"])] } }));
    const now = () => at("2026-11-22");
    await expect(refreshSbProducts(flaky, { request }, profileId, { now })).rejects.toThrow("write failed");
    expect(await refreshSbProducts(flaky, { request }, profileId, { now })).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    const { rows } = await db.execute("SELECT asins, valid_from, valid_to FROM ads_search_product_history");
    expect(rows.map(r => [r.asins, r.valid_from, r.valid_to])).toEqual([["B0PRODUCTA", "2026-09-01", "2026-11-21"]]);
  });

  it("lets only one sync list a profile's Sponsored Brands ads at a time", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const now = () => at("2026-11-22");
    let calls = 0;
    const ads = { request: async (method, path, { body }) => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 5)); // the other sync runs meanwhile
      const page = Number(body.nextToken || 0);
      return { status: 200, data: { ads: [sbAd(`g${page}`, ["B0PRODUCTA"])], ...(page < 2 ? { nextToken: String(page + 1) } : {}) } };
    } };
    const results = await Promise.all([refreshSbProducts(db, ads, profileId, { now }), refreshSbProducts(db, ads, profileId, { now })]);
    expect(results.sort()).toEqual([false, true]);
    expect(calls).toBe(3);
    expect(Number((await db.execute("SELECT COUNT(*) AS n FROM ads_search_product_history")).rows[0].n)).toBe(3);
    // The lease is given up afterwards, so the next sync can list again.
    expect(await refreshSbProducts(db, ads, profileId, { now })).toBe(true);
  });

  it("ignores a stalled sync's late page once another sync has taken over its lease", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    let clock = at("2026-11-22"), release;
    const gate = new Promise(resolve => { release = resolve; });
    const tokens = [];
    const page = n => ({ status: 200, data: { ads: [sbAd(`g${n}`, ["B0PRODUCTA"])], nextToken: String(n + 1) } });
    // The first sync stalls on its second page; only its request waits on the gate.
    const stalled = { request: async (method, path, { body }) => {
      tokens.push(["first", body.nextToken ?? null]);
      if (body.nextToken !== "1") return page(0);
      await gate;
      return { status: 200, data: { ads: [sbAd("late", ["B0PRODUCTZ"])], nextToken: "late" } };
    } };
    const second = { request: async (method, path, { body }) => {
      tokens.push(["second", body.nextToken ?? null]);
      clock += 1000;
      return page(Number(body.nextToken || 0));
    } };
    const state = async () => ({
      status: (await db.execute("SELECT next_token, scan_started_at, ready_through FROM ads_product_map_status")).rows.map(r => ({ ...r })),
      scan: (await db.execute("SELECT ad_group_id FROM ads_sb_ads_scan ORDER BY ad_group_id")).rows.map(r => r.ad_group_id),
      history: (await db.execute("SELECT * FROM ads_search_product_history")).rows.map(r => ({ ...r })),
    });

    const first = refreshSbProducts(db, stalled, profileId, { now: () => clock });
    await vi.waitFor(() => expect(tokens).toContainEqual(["first", "1"]));
    // Past the lease, a second sync takes over, carries on from the saved token and stops at its deadline.
    clock += 2 * 60_000 + 1;
    expect(await refreshSbProducts(db, second, profileId, { now: () => clock, deadline: clock + 1 })).toBe(false);
    expect(tokens).toEqual([["first", null], ["first", "1"], ["second", "1"]]);
    const before = await state();
    expect(before).toMatchObject({ status: [{ next_token: "2", ready_through: null }], scan: ["g0", "g1"], history: [] });

    release();
    expect(await first).toBe(false);
    expect(await state()).toEqual(before);
  });

  it("drops a product map built before it had dates, so the next sync rebuilds it", async () => {
    const db = createClient({ url: ":memory:" });
    await db.batch([
      "CREATE TABLE ads_search_product_map (profile_id TEXT NOT NULL, ad_product TEXT NOT NULL, campaign_id TEXT NOT NULL, ad_group_id TEXT NOT NULL, asin TEXT NOT NULL, PRIMARY KEY (profile_id, ad_product, campaign_id, ad_group_id, asin))",
      "CREATE TABLE ads_product_map_status (profile_id TEXT NOT NULL, ad_product TEXT NOT NULL, ready_at TEXT, error TEXT, PRIMARY KEY (profile_id, ad_product))",
      `INSERT INTO ads_product_map_status VALUES ('${profileId}', 'SB_SEARCH', 't', NULL)`,
    ], "write");
    await migrate(db);
    expect((await zeroSales(db, { profileId, from, to })).coverage.SB_SEARCH.mapReady).toBe(false);
    expect((await db.execute("SELECT name FROM sqlite_master WHERE name = 'ads_search_product_map'")).rows).toEqual([]);
  });
});
