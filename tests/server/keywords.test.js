import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { GET as keywordsRoute } from "../../api/ads/keywords.js";
import { PUT as saveRoute } from "../../api/ads/[settings].js";
import { KEYWORD_ZERO_DEFAULTS, cleanInsightSettings } from "../../server/ads/insight-settings.js";
import { hiddenKeyword, keywordInsight } from "../../server/ads/keywords.js";
import { normalizeTargets, reportSpec, storeWindow, syncAds } from "../../server/ads/sync.js";
import { SESSION_COOKIE, createSessionToken } from "../../server/auth.js";
import { migrate } from "../../server/db.js";

const profileId = "test-profile";
const from = "2026-10-28", to = "2026-11-26";
const defaults = () => structuredClone(KEYWORD_ZERO_DEFAULTS);

// One stored targeting row: a keyword (or target) on a date with its counts.
const target = (targetId, cost, { date = to, campaignId = "c1", adGroupId = "g1", campaignName = `Campaign ${targetId}`, adGroupName = "Exact", text = `keyword ${targetId}`, kind = "keyword", matchType = kind === "keyword" ? "exact" : "", bid = 1, topShare = null, impressions = 100, clicks = 10, orders = 0, sales = 0 } = {}) => ({
  date, campaignId, adGroupId, targetId, campaignName, adGroupName, target: text, kind, matchType, bid, topShare, impressions, clicks, cost, orders, units: orders, sales,
});
const store = (db, product, rows, start = to, end = to) => storeWindow(db, { profileId, product, start, end, rows, syncedAt: "now" });
const state = (db, product, kind, campaignId, adGroupId, id, value, bid) => db.batch([
  { sql: "INSERT INTO ads_keyword_states VALUES (?, ?, ?, ?, ?, ?, ?, 'now')", args: [profileId, product, kind, campaignId, adGroupId, id, value] },
  { sql: "INSERT INTO ads_keyword_bids VALUES (?, ?, ?, ?, ?, ?, ?, 'now')", args: [profileId, product, kind, campaignId, adGroupId, id, bid] },
], "write");
const signedIn = url => new Request(url, { headers: { cookie: `${SESSION_COOKIE}=${createSessionToken("secret")}` } });

describe("targeting reports", () => {
  it("requests each ad type's targeting report by day", () => {
    expect(reportSpec("SP_TARGETING", { start: from, end: to }).configuration).toMatchObject({ adProduct: "SPONSORED_PRODUCTS", reportTypeId: "spTargeting", groupBy: ["targeting"], timeUnit: "DAILY" });
    expect(reportSpec("SB_TARGETING", { start: from, end: to }).configuration).toMatchObject({ adProduct: "SPONSORED_BRANDS", reportTypeId: "sbTargeting", groupBy: ["targeting"] });
    expect(reportSpec("SD_TARGETING", { start: from, end: to }).configuration).toMatchObject({ adProduct: "SPONSORED_DISPLAY", reportTypeId: "sdTargeting", groupBy: ["targeting"] });
    expect(reportSpec("SP_TARGETING", { start: from, end: to }).configuration.columns).toEqual(expect.arrayContaining(["keywordBid", "topOfSearchImpressionShare", "campaignName", "adGroupName"]));
  });

  it("tells keywords, auto targets and other targets apart, with their bid and top-of-search share", () => {
    const sp = normalizeTargets("SP_TARGETING", [
      { date: to, campaignId: 1, adGroupId: 2, campaignName: "SP-EXACT", adGroupName: "Exact", keywordId: 3, keyword: "jump rope", targeting: "jump rope", keywordType: "EXACT", matchType: "EXACT", keywordBid: 1.32, topOfSearchImpressionShare: 2.5, impressions: 7, clicks: 1, cost: 1.02, purchases7d: 0, unitsSoldClicks7d: 0, sales7d: 0 },
      { date: to, campaignId: 1, adGroupId: 4, keywordId: 5, targeting: "close-match", keywordType: "TARGETING_EXPRESSION_PREDEFINED", matchType: "TARGETING_EXPRESSION_PREDEFINED", keywordBid: 0.75, impressions: 9, clicks: 2, cost: 1.5, purchases7d: 1, unitsSoldClicks7d: 2, sales7d: 24.99 },
      { date: to, campaignId: 1, adGroupId: 6, keywordId: 7, targeting: "asin=\"B0ABCDEFGH\"", keywordType: "TARGETING_EXPRESSION", impressions: 1, clicks: 0, cost: 0 },
    ]);
    expect(sp).toEqual([
      { date: to, campaignId: "1", adGroupId: "2", targetId: "3", campaignName: "SP-EXACT", adGroupName: "Exact", target: "jump rope", kind: "keyword", matchType: "exact", bid: 1.32, topShare: 2.5, impressions: 7, clicks: 1, cost: 1.02, orders: 0, units: 0, sales: 0 },
      expect.objectContaining({ targetId: "5", target: "close-match", kind: "auto", matchType: "", bid: 0.75, topShare: null, orders: 1, units: 2, sales: 24.99 }),
      expect.objectContaining({ targetId: "7", target: "asin=\"B0ABCDEFGH\"", kind: "target", matchType: "", bid: null }),
    ]);
    const [sb] = normalizeTargets("SB_TARGETING", [{ date: to, campaignId: 8, adGroupId: 9, keywordId: 10, targetingId: 10, keywordText: "battle ropes", targetingText: "battle ropes", keywordType: "BROAD", targetingType: "BROAD", keywordBid: 1, topOfSearchImpressionShare: 25, impressions: 2, clicks: 0, cost: 0, purchases: 0, unitsSold: 0, sales: 0 }]);
    expect(sb).toMatchObject({ targetId: "10", target: "battle ropes", kind: "keyword", matchType: "broad", bid: 1, topShare: 25 });
    const [sd] = normalizeTargets("SD_TARGETING", [{ date: to, campaignId: 11, adGroupId: 12, targetingId: 13, targetingExpression: "audiences-likely-interested-in-ad", targetingText: "audiences-likely-interested-in-ad", impressions: 50, clicks: 3, cost: 1.1, purchases: 0, unitsSold: 0, sales: 0 }]);
    expect(sd).toMatchObject({ targetId: "13", target: "audiences-likely-interested-in-ad", kind: "target", bid: null, topShare: null, clicks: 3 });
  });

  it("collects targeting reports into their own table and lists Sponsored Display targets for their bids", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const listed = [];
    const ads = {
      async request(method, path) {
        listed.push(path.split("?")[0]);
        if (path === "/sp/keywords/list") return { status: 200, data: { keywords: [] } };
        if (path === "/sp/targets/list") return { status: 200, data: { targetingClauses: [] } };
        if (path.startsWith("/sd/targets?")) return { status: 200, data: [{ campaignId: "11", adGroupId: "12", targetId: "13", state: "enabled", bid: 0.2 }] };
        return { status: 200, data: [] };
      },
      async createReport(profile, spec) { return `report-${spec.configuration.reportTypeId}-${spec.startDate}`; },
      async getReport(profile, id) { return { status: "COMPLETED", url: id }; },
      async downloadReport(url) {
        return url.startsWith("report-sdTargeting") ? [{ date: "2026-11-21", campaignId: 11, adGroupId: 12, campaignName: "SD-BROAD-VIDEO", adGroupName: "Video", targetingId: 13, targetingText: "audiences-likely-interested-in-ad", impressions: 50, clicks: 3, cost: 1.1, purchases: 0, unitsSold: 0, sales: 0 }] : [];
      },
    };
    const summary = await syncAds({ db, ads, profileId, products: ["SD_TARGETING"], now: () => Date.UTC(2026, 10, 22, 15), budgetMs: 30_000, sleep: async () => {} });
    expect(summary.errors).toEqual([]);
    expect(listed).toContain("/sd/targets");
    const { rows, coverage } = await keywordInsight(db, { profileId, from: "2026-11-21", to: "2026-11-21", settings: { ...defaults(), filters: {} } });
    expect(rows).toEqual([expect.objectContaining({ sponsored: "Display", campaign: "SD-BROAD-VIDEO", keyword: "audiences-likely-interested-in-ad", kind: "target", clicks: 3, spend: 1.1, currentBid: 0.2, state: "enabled", pl: -1.1 })]);
    expect(coverage.SD_TARGETING).toMatchObject({ days: 1, expectedDays: 1, pending: false });
    expect((await db.execute("SELECT COUNT(*) AS n FROM ads_daily")).rows[0].n).toBe(0);
  });

  it("lists Sponsored Brands product targets for their targeting report, for their state and current bid", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const ads = {
      async request(method, path) {
        if (path === "/sp/keywords/list") return { status: 200, data: { keywords: [] } };
        if (path === "/sp/targets/list") return { status: 200, data: { targetingClauses: [] } };
        if (path === "/sb/targets/list") return { status: 200, data: { targets: [{ campaignId: 8, adGroupId: 9, targetId: 13, state: "paused", bid: 1.4 }, { campaignId: 8, adGroupId: 9, targetId: 14, state: "enabled", bid: 0.65 }] } };
        return { status: 200, data: [] };
      },
      async createReport(profile, spec) { return `report-${spec.configuration.reportTypeId}-${spec.startDate}`; },
      async getReport(profile, id) { return { status: "COMPLETED", url: id }; },
      async downloadReport(url) {
        const row = (targetingId, text) => ({ date: "2026-11-21", campaignId: 8, adGroupId: 9, campaignName: "SB-PRODUCT", adGroupName: "Competitors", targetingId, targetingText: text, targetingType: "TARGETING_EXPRESSION", keywordBid: 1, impressions: 50, clicks: 3, cost: 21, purchases: 0, unitsSold: 0, sales: 0 });
        return url.startsWith("report-sbTargeting") ? [row(13, "asin=\"B0ABCDEFGH\""), row(14, "asin=\"B0ABCDEFGJ\"")] : [];
      },
    };
    const summary = await syncAds({ db, ads, profileId, products: ["SB_TARGETING"], now: () => Date.UTC(2026, 10, 22, 15), budgetMs: 30_000, sleep: async () => {} });
    expect(summary.errors).toEqual([]);
    const report = async changes => (await keywordInsight(db, { profileId, from: "2026-11-21", to: "2026-11-21", settings: { ...defaults(), ...changes } })).rows;
    expect((await report({})).map(r => [r.keywordId, r.sponsored, r.kind, r.state, r.currentBid])).toEqual([["13", "Brands", "target", "paused", 1.4], ["14", "Brands", "target", "enabled", 0.65]]);
    expect((await report({ hidePausedTargets: true })).map(r => r.keywordId)).toEqual(["14"]);
  });
});

describe("Keywords with 0 Sales", () => {
  it("lists every keyword or target with spend and no orders, costliest first, seven a page", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    // The defaults: no orders, at least $20 spent, auto targets left out.
    await store(db, "SP_TARGETING", [
      ...Array.from({ length: 8 }, (_, i) => target(`k${i}`, 40 - i)),
      target("sold", 60, { orders: 1, sales: 24.99 }),
      target("cheap", 19.99),
      target("auto", 50, { kind: "auto", text: "close-match" }),
    ]);
    await store(db, "SB_TARGETING", [target("brand", 45, { campaignName: "SBV | JUMP ROPE.MOV", adGroupName: "JUMP ROPE.MOV", text: "jump rope with counter", matchType: "broad" })]);
    const first = await keywordInsight(db, { profileId, from, to });
    expect(first.total).toBe(9);
    expect(first.rows.map(r => r.keyword)).toEqual(["jump rope with counter", "keyword k0", "keyword k1", "keyword k2", "keyword k3", "keyword k4", "keyword k5"]);
    expect(first.rows[0]).toMatchObject({ sponsored: "Brands", campaign: "SBV | JUMP ROPE.MOV", adGroup: "JUMP ROPE.MOV", matchType: "broad", kind: "keyword", clicks: 10, cpc: 4.5, pl: -45, currentBid: 1 });
    expect(first.totals).toMatchObject({ clicks: 70, spend: 270, cpc: 270 / 70, pl: -270, currentBid: null });
    const second = await keywordInsight(db, { profileId, from, to, page: 1 });
    expect(second.rows.map(r => r.keyword)).toEqual(["keyword k6", "keyword k7"]);
    expect(first.settings).toEqual(KEYWORD_ZERO_DEFAULTS);
  });

  it("lists keywords from ad groups advertising several products like any other", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await store(db, "SP", [
      { date: to, campaignId: "c1", adGroupId: "shared", asin: "B0PRODUCTA", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 },
      { date: to, campaignId: "c1", adGroupId: "shared", asin: "B0PRODUCTB", impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 },
    ]);
    await store(db, "SP_TARGETING", [target("bundle", 25, { adGroupId: "shared", text: "battle ropes for home gym" })]);
    expect((await keywordInsight(db, { profileId, from, to })).rows.map(r => r.keyword)).toEqual(["battle ropes for home gym"]);
  });

  it("names the products each keyword's ad group advertised in the dates, with their titles and images", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const ad = (adGroupId, asin, date = to) => ({ date, campaignId: "c1", adGroupId, asin, impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 });
    await store(db, "SP", [ad("one", "B0PRODUCTA"), ad("shared", "B0PRODUCTB"), ad("shared", "B0PRODUCTA"), ad("old", "B0PRODUCTC", "2026-10-01")], "2026-10-01", to);
    await store(db, "SP_TARGETING", [target("single", 50, { adGroupId: "one" }), target("bundle", 40, { adGroupId: "shared" }), target("old", 35, { adGroupId: "old" })]);
    await store(db, "SB_TARGETING", [target("brand", 30, { campaignId: "sb", adGroupId: "sbg" }), target("unmapped", 25, { campaignId: "sb", adGroupId: "new" })]);
    await store(db, "SD_TARGETING", [target("display", 20, { kind: "target" })]);
    await db.batch([
      // The Sponsored Brands group's ads changed within the dates, so it names both sets.
      { sql: "INSERT INTO ads_search_product_history VALUES (?, 'SB_SEARCH', 'sb', 'sbg', 'B0PRODUCTB', '2026-10-01', '2026-11-10', 'now')", args: [profileId] },
      { sql: "INSERT INTO ads_search_product_history VALUES (?, 'SB_SEARCH', 'sb', 'sbg', 'B0PRODUCTA,B0PRODUCTB', '2026-11-11', '2026-11-26', 'now')", args: [profileId] },
      { sql: "INSERT INTO ads_search_product_history VALUES (?, 'SB_SEARCH', 'sb', 'new', 'B0PRODUCTC', '2026-09-01', '2026-10-27', 'now')", args: [profileId] },
      { sql: "INSERT INTO ads_products VALUES (?, 'B0PRODUCTA', 'Weighted Jump Rope', 'https://m.media-amazon.com/images/I/a.jpg', 'now')", args: [profileId] },
      { sql: "INSERT INTO ads_products VALUES (?, 'B0PRODUCTB', 'Battle Rope', '', 'now')", args: [profileId] },
    ], "write");
    const rows = (await keywordInsight(db, { profileId, from, to })).rows;
    const a = { asin: "B0PRODUCTA", title: "Weighted Jump Rope", image: "/api/ads/product-image?asin=B0PRODUCTA" }, b = { asin: "B0PRODUCTB", title: "Battle Rope", image: null };
    const none = { asin: "", title: "", image: null, products: [] };
    expect(rows.map(r => [r.keywordId, { asin: r.asin, title: r.title, image: r.image, products: r.products }])).toEqual([
      ["single", { ...a, products: [a] }],
      ["bundle", { asin: "B0PRODUCTA,B0PRODUCTB", title: a.title, image: a.image, products: [a, b] }],
      // Its only ad reported before the dates.
      ["old", none],
      ["brand", { asin: "B0PRODUCTA,B0PRODUCTB", title: a.title, image: a.image, products: [a, b] }],
      // Its history ends the day before the dates.
      ["unmapped", none],
      ["display", none],
    ]);
  });

  it("adds up the dates, naming each keyword and its bid as last reported, and weights top-of-search share by impressions", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await store(db, "SP_TARGETING", [
      target("k", 12, { date: "2026-11-20", campaignName: "Old name", bid: 0.9, topShare: 10, impressions: 100 }),
      target("k", 13, { date: "2026-11-21", campaignName: "New name", bid: 1.1, topShare: 40, impressions: 300 }),
    ], "2026-11-20", "2026-11-21");
    const [row] = (await keywordInsight(db, { profileId, from, to })).rows;
    expect(row).toMatchObject({ campaign: "New name", impressions: 400, clicks: 20, spend: 25, currentBid: 1.1, topShare: 32.5 });
  });

  it("shows the current bid from the ads lists, falling back to the reported one when the list has none", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await store(db, "SP_TARGETING", [target("listed", 30, { bid: 0.5 }), target("default", 25, { kind: "target", bid: 0.6 })]);
    await state(db, "SP_SEARCH", "keyword", "c1", "g1", "listed", "enabled", 1.85);
    await state(db, "SP_SEARCH", "target", "c1", "g1", "default", "enabled", null);
    const rows = (await keywordInsight(db, { profileId, from, to })).rows;
    expect(rows.map(r => [r.keywordId, r.currentBid])).toEqual([["listed", 1.85], ["default", 0.6]]);
  });

  it("hides each kind of target, match type and paused status the settings name", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await store(db, "SP_TARGETING", [
      target("exact", 50), target("phrase", 49, { matchType: "phrase" }), target("broad", 48, { matchType: "broad" }),
      target("paused keyword", 47), target("product", 46, { kind: "target" }), target("paused target", 45, { kind: "target" }), target("auto", 44, { kind: "auto" }),
    ]);
    await state(db, "SP_SEARCH", "keyword", "c1", "g1", "paused keyword", "paused", 1);
    await state(db, "SP_SEARCH", "target", "c1", "g1", "paused target", "paused", 1);
    const ids = async changes => (await keywordInsight(db, { profileId, from, to, pageSize: 50, settings: { ...defaults(), ...changes } })).rows.map(r => r.keywordId);
    expect(await ids({})).toEqual(["exact", "phrase", "broad", "paused keyword", "product", "paused target"]);
    expect(await ids({ hideAutoTargets: false })).toContain("auto");
    expect(await ids({ hideProductTargets: true })).toEqual(["exact", "phrase", "broad", "paused keyword"]);
    expect(await ids({ hideKeywordTargets: true })).toEqual(["product", "paused target"]);
    expect(await ids({ hideExact: true, hidePhrase: true })).toEqual(["broad", "product", "paused target"]);
    expect(await ids({ hideBroad: true })).not.toContain("broad");
    expect(await ids({ hidePausedKeywords: true })).toEqual(["exact", "phrase", "broad", "product", "paused target"]);
    expect(await ids({ hidePausedTargets: true })).toEqual(["exact", "phrase", "broad", "paused keyword", "product"]);
    expect(hiddenKeyword({ hidePausedTargets: true }, { kind: "auto", state: "paused" })).toBe(true);
  });

  it("sorts, filters and shows the bid and top-of-search share like any metric", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await store(db, "SP_TARGETING", [target("a", 30, { bid: 2, topShare: 5 }), target("b", 25, { bid: 0.5, topShare: 50 }), target("c", 21, { bid: 1, topShare: null })]);
    const ids = async changes => (await keywordInsight(db, { profileId, from, to, settings: { ...defaults(), ...changes } })).rows.map(r => r.keywordId);
    expect(await ids({ sort: "currentBid", dir: "asc" })).toEqual(["b", "c", "a"]);
    expect(await ids({ sort: "topShare", dir: "desc" })).toEqual(["b", "a", "c"]);
    expect(await ids({ filters: { currentBid: { max: 1 } } })).toEqual(["b", "c"]);
    expect(await ids({ filters: { topShare: { min: 10 } } })).toEqual(["b"]);
  });

  it("expects only the dates Amazon can provide, and leaves out ad types Amazon refused", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await store(db, "SP_TARGETING", [], "2026-08-24", "2026-11-21");
    await db.execute({ sql: "INSERT INTO ads_unsupported VALUES (?, 'SD_TARGETING', 'HTTP 403', 'now')", args: [profileId] });
    await db.execute({ sql: "INSERT INTO ads_report_requests (report_id, profile_id, ad_product, start_date, end_date, status, requested_at, updated_at) VALUES ('r', ?, 'SB_TARGETING', ?, ?, 'PENDING', 'now', 'now')", args: [profileId, "2026-11-20", "2026-11-21"] });
    const { coverage } = await keywordInsight(db, { profileId, from: "2026-01-01", to: "2026-11-22", today: "2026-11-22" });
    expect(coverage).toEqual({
      SP_TARGETING: { days: 90, expectedDays: 90, pending: false, availableFrom: "2026-08-24", reportedThrough: "2026-11-21" },
      SB_TARGETING: { days: 0, expectedDays: 60, pending: true, availableFrom: "2026-09-23", reportedThrough: "2026-11-21" },
    });
  });
});

describe("keyword card settings", () => {
  const valid = (changes = {}) => ({ ...defaults(), ...changes });

  it("accepts the keyword card's own options, metrics and columns", () => {
    expect(cleanInsightSettings(valid(), KEYWORD_ZERO_DEFAULTS).settings).toEqual(KEYWORD_ZERO_DEFAULTS);
    const { settings } = cleanInsightSettings(valid({ hideBroad: true, sort: "topShare", filters: { currentBid: { min: "0.5" } }, track: ["currentBid", "topShare"], order: ["keyword", "p", "campaign"] }), KEYWORD_ZERO_DEFAULTS);
    expect(settings).toMatchObject({ hideBroad: true, sort: "topShare", filters: { currentBid: { min: 0.5 } }, track: ["topShare", "currentBid"], order: ["keyword", "p", "campaign"] });
    expect(settings).not.toHaveProperty("hideAsins");
  });

  it("refuses search term options and columns, and missing keyword options", () => {
    for (const [changes, message] of [
      [{ hidePausedTargets: undefined }, /hidePausedTargets/],
      [{ hideExact: "yes" }, /hideExact/],
      [{ order: ["term"] }, /column order/],
      [{ track: ["breakEvenBid"] }, /tracked/],
    ]) expect(cleanInsightSettings(valid(changes), KEYWORD_ZERO_DEFAULTS).error).toMatch(message);
    // Search term cards don't know the keyword metrics.
    expect(cleanInsightSettings({ ...valid(), hideAsins: true, hideKeywords: false, sort: "currentBid" }).error).toMatch(/sort/);
  });
});

describe("/api/ads/keywords", () => {
  const env = () => {
    vi.stubEnv("SESSION_SECRET", "secret");
    vi.stubEnv("TURSO_DATABASE_URL", ":memory:");
    vi.stubEnv("AMAZON_ADS_PROFILE_ID", profileId);
  };

  it("needs sign-in and a keyword filter", async () => {
    env();
    try {
      expect((await keywordsRoute(new Request("https://app.test/api/ads/keywords"))).status).toBe(401);
      expect((await keywordsRoute(signedIn("https://app.test/api/ads/keywords?filterId=zero-sales"))).status).toBe(400);
      expect((await keywordsRoute(signedIn("https://app.test/api/ads/keywords?from=2026-11-30&to=2026-11-01"))).status).toBe(400);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns the filter's rows with its saved settings, which its own settings URL saves", async () => {
    env();
    try {
      const put = body => saveRoute(new Request("https://app.test/api/ads/zero-sales-keywords-settings", {
        method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json", cookie: `${SESSION_COOKIE}=${createSessionToken("secret")}` },
      }));
      const report = async () => (await keywordsRoute(signedIn("https://app.test/api/ads/keywords?filterId=zero-sales-keywords&days=30"))).json();
      expect(await report()).toMatchObject({ filterId: "zero-sales-keywords", total: 0, settings: KEYWORD_ZERO_DEFAULTS });
      // Search term settings aren't keyword settings.
      expect((await put({ ...structuredClone(KEYWORD_ZERO_DEFAULTS), hideAsins: true, hideKeywords: false, hideProductTargets: undefined })).status).toBe(400);
      const ok = await put({ ...structuredClone(KEYWORD_ZERO_DEFAULTS), name: "Wasted keywords", hideBroad: true });
      expect(ok.status).toBe(200);
      expect((await report()).settings).toMatchObject({ name: "Wasted keywords", hideBroad: true });
      // The search term card's settings are separate.
      expect((await saveRoute(new Request("https://app.test/api/ads/nope-settings", { method: "PUT", body: "{}", headers: { cookie: `${SESSION_COOKIE}=${createSessionToken("secret")}` } }))).status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
