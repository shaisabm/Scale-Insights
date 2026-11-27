import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { migrate, getDb } from "../../server/db.js";
import { normalizeRows, normalizeSearchDetails, storeWindow, reportSpec } from "../../server/ads/sync.js";
import { searchTerms } from "../../server/ads/search-terms.js";
import { zeroSales } from "../../server/ads/zero-sales.js";
import { ZERO_DEFAULTS, ACOS_DEFAULTS, PERFORMING_DEFAULTS, saveZeroSettings } from "../../server/ads/insight-settings.js";
import { GET } from "../../api/ads/search-terms.js";
import { SESSION_COOKIE, createSessionToken } from "../../server/auth.js";

const profileId = "search-test", from = "2026-10-27", to = "2026-11-25";
const raw = (overrides = {}) => ({ date: to, campaignId: "campaign-a", campaignName: "Campaign A", adGroupId: "group-a", adGroupName: "Group A", searchTerm: "rope", keywordId: "kw-1", keyword: "jump rope", matchType: "BROAD", impressions: 20, clicks: 2, cost: 2, purchases7d: 1, unitsSoldClicks7d: 1, sales7d: 25, ...overrides });
async function seed(db, raws, { profile = profileId, product = "SP_SEARCH", details = true, start = from, end = to } = {}) {
  await storeWindow(db, { profileId: profile, product, start, end, rows: normalizeRows(product, raws),
    detailRows: details ? normalizeSearchDetails(product, raws) : undefined, syncedAt: "now" });
}
async function mapProducts(db, groups, profile = profileId) {
  await storeWindow(db, { profileId: profile, product: "SP", start: from, end: to, syncedAt: "now", rows: groups.flatMap(([campaignId, adGroupId, asins]) => asins.map(asin => ({ date: to, campaignId, adGroupId, asin, impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 }))) });
}

describe("Search terms hierarchy", () => {
  it("keeps three product sets and preserves keyword/match details without double counting", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const raws = [raw(), raw({ keywordId: "kw-2", matchType: "PHRASE", purchases7d: 0, unitsSoldClicks7d: 0, sales7d: 0 }),
      raw({ campaignId: "campaign-b", adGroupId: "group-b", campaignName: "Campaign B", adGroupName: "Group B" }),
      raw({ campaignId: "campaign-c", adGroupId: "group-c" }), raw({ campaignId: "campaign-d", adGroupId: "group-d" })];
    await seed(db, raws);
    await mapProducts(db, [["campaign-a", "group-a", ["B0PRODUCTA"]], ["campaign-b", "group-b", ["B0PRODUCTA"]],
      ["campaign-c", "group-c", ["B0PRODUCTB"]], ["campaign-d", "group-d", ["B0PRODUCTB", "B0PRODUCTA"]]]);
    const report = await searchTerms(db, { profileId, from, to });
    expect(report.products.map(p => p.asin).sort()).toEqual(["B0PRODUCTA", "B0PRODUCTA,B0PRODUCTB", "B0PRODUCTB"]);
    const term = report.rows.find(r => r.asin === "B0PRODUCTA");
    expect(term).toMatchObject({ clicks: 6, orders: 2, spend: 6, sales: 50 });
    expect(term.details).toHaveLength(3);
    expect(term.details.map(d => [d.campaignName, d.adGroupName, d.keyword, d.matchType])).toEqual([
      ["Campaign A", "Group A", "jump rope", "BROAD"], ["Campaign A", "Group A", "jump rope", "PHRASE"], ["Campaign B", "Group B", "jump rope", "BROAD"],
    ]);
    expect(report.totals.clicks).toBe(10);
    expect(report.detailComplete).toBe(true);
    expect(report.rows.reduce((n, r) => n + r.details.reduce((m, d) => m + d.spend, 0), 0)).toBe(report.totals.spend);
  });

  it("all three filters match their cards, after grouping; product totals retain filtered-out terms", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await seed(db, [raw({ searchTerm: "strong", cost: 20 }), raw({ searchTerm: "strong", campaignId: "campaign-b", adGroupId: "group-b", purchases7d: 0, unitsSoldClicks7d: 0, sales7d: 0 }),
      raw({ searchTerm: "weak", clicks: 20, cost: 20 }), raw({ searchTerm: "waste", clicks: 10, cost: 15, purchases7d: 0, unitsSoldClicks7d: 0, sales7d: 0 })]);
    await mapProducts(db, [["campaign-a", "group-a", ["B0PRODUCTA"]], ["campaign-b", "group-b", ["B0PRODUCTA"]]]);
    for (const settings of [ZERO_DEFAULTS, ACOS_DEFAULTS, PERFORMING_DEFAULTS]) {
      const report = await searchTerms(db, { profileId, from, to, settings });
      const card = await zeroSales(db, { profileId, from, to, settings });
      expect(report.rows.map(r => [r.term, r.clicks, r.orders, r.spend, r.conversion])).toEqual(card.rows.map(r => [r.term, r.clicks, r.orders, r.spend, r.conversion]));
      expect(report.products[0].clicks).toBe(34);
    }
    const report = await searchTerms(db, { profileId, from, to, settings: PERFORMING_DEFAULTS });
    expect(report.rows.map(r => r.term)).toEqual(["strong"]);
    expect(report.rows[0].details.some(r => r.orders === 0)).toBe(true);
    expect(report.totals.conversion).toBe(25);
  });

  it("keeps ad types and exact search text separate", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await seed(db, [raw(), raw({ searchTerm: "Rope" })]);
    await seed(db, [raw({ keyword: undefined, keywordText: "SB keyword", purchases: 1, unitsSold: 1, sales: 25 })], { product: "SB_SEARCH" });
    await mapProducts(db, [["campaign-a", "group-a", ["B0PRODUCTA"]]]);
    await db.execute({ sql: "INSERT INTO ads_search_product_history VALUES (?, 'SB_SEARCH', 'campaign-a', 'group-a', 'B0PRODUCTA', ?, ?, 'now')", args: [profileId, from, to] });
    const report = await searchTerms(db, { profileId, from, to });
    expect(report.rows).toHaveLength(3);
    expect(report.rows.find(r => r.sponsored === "Brands").details[0].keyword).toBe("SB keyword");
  });

  it("includes legacy dates as unknown keyword detail until a replacement report arrives", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const previous = "2026-11-24";
    await seed(db, [raw({ date: previous })], { details: false, start: previous, end: previous });
    await seed(db, [raw()], { start: to, end: to });
    await mapProducts(db, [["campaign-a", "group-a", ["B0PRODUCTA"]]]);
    const before = await searchTerms(db, { profileId, from, to });
    expect(before.rows[0].clicks).toBe(4);
    expect(before.rows[0].details).toHaveLength(2);
    expect(before.detailComplete).toBe(false);
    await seed(db, [raw({ date: previous })], { start: previous, end: previous });
    const after = await searchTerms(db, { profileId, from, to });
    expect(after.rows[0].clicks).toBe(4);
    expect(after.rows[0].details).toHaveLength(1);
    expect(after.detailComplete).toBe(true);
  });

  it("replaces detail windows atomically and distinguishes keyword IDs and match types", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const raws = [raw(), raw(), raw({ matchType: "EXACT" }), raw({ keywordId: "kw-2" })];
    const details = normalizeSearchDetails("SP_SEARCH", raws);
    expect(details).toHaveLength(3);
    expect(details[0].clicks).toBe(4);
    await seed(db, raws);
    await seed(db, [raw()]);
    expect((await db.execute("SELECT * FROM ads_search_term_details_daily")).rows).toHaveLength(1);
    expect((await db.execute("SELECT * FROM ads_search_terms_daily")).rows[0].clicks).toBe(2);
    expect(reportSpec("SP_SEARCH", { start: from, end: to }).configuration.columns).toContain("keyword");
    expect(reportSpec("SB_SEARCH", { start: from, end: to }).configuration.columns).toContain("keywordText");
  });

  it("uses refreshed summary totals when an older deployment leaves stale keyword details", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await seed(db, [raw()]);
    await mapProducts(db, [["campaign-a", "group-a", ["B0PRODUCTA"]]]);
    await db.execute("UPDATE ads_search_terms_daily SET clicks = 9");
    await db.execute("UPDATE ads_synced_days SET synced_at = 'newer-sync'");
    const report = await searchTerms(db, { profileId, from, to });
    expect(report.rows[0].clicks).toBe(9);
    expect(report.rows[0].details).toHaveLength(1);
    expect(report.rows[0].details[0].clicks).toBe(9);
    expect(report.detailComplete).toBe(false);
  });
});

describe("Search terms API", () => {
  it("requires sign-in, validates range/filter, and reuses saved insight settings for this profile only", async () => {
    vi.stubEnv("SESSION_SECRET", "secret"); vi.stubEnv("TURSO_DATABASE_URL", ":memory:"); vi.stubEnv("AMAZON_ADS_PROFILE_ID", profileId);
    try {
      const request = query => new Request(`https://app.test/api/ads/search-terms?from=${from}&to=${to}${query}`, { headers: { cookie: `${SESSION_COOKIE}=${createSessionToken("secret")}` } });
      expect((await GET(new Request("https://app.test/api/ads/search-terms"))).status).toBe(401);
      expect((await GET(request("&filterId=unknown"))).status).toBe(400);
      expect((await GET(request("&filterId=__proto__"))).status).toBe(400);
      expect((await GET(new Request("https://app.test/api/ads/search-terms?from=bad", request("")).clone())).status).toBe(400);
      const db = await migrate(getDb());
      await seed(db, [raw()]); await mapProducts(db, [["campaign-a", "group-a", ["B0PRODUCTA"]]]);
      await seed(db, [raw({ cost: 999 })], { profile: "other" });
      await saveZeroSettings(db, profileId, { ...PERFORMING_DEFAULTS, filters: { conversion: { min: 60 } } }, "now", PERFORMING_DEFAULTS);
      const report = await (await GET(request("&filterId=performing"))).json();
      expect(report.rows).toEqual([]);
      expect(report.settings.filters).toEqual({ conversion: { min: 60 } });
      const all = await (await GET(request(""))).json();
      expect(all.rows[0].spend).toBe(2);
    } finally { vi.unstubAllEnvs(); }
  });
});
