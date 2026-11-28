import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { GET } from "../../api/ads/search-terms.js";
import { PUT as saveRoute } from "../../api/ads/[settings].js";
import { MISSING_TITLE_DEFAULTS, UNIQUE_WORD_ZERO_DEFAULTS, cleanInsightSettings } from "../../server/ads/insight-settings.js";
import { normalizeRows, storeWindow } from "../../server/ads/sync.js";
import { ALL_WORDS, mainWords, wordInsight, wordsOf } from "../../server/ads/words.js";
import { SESSION_COOKIE, createSessionToken } from "../../server/auth.js";
import { migrate } from "../../server/db.js";

const profileId = "words-test", from = "2026-10-27", to = "2026-11-25";
const term = (searchTerm, { date = to, adGroupId = "group-a", impressions = 10, clicks = 2, cost = 2, orders = 1, sales = 25 } = {}) => ({
  date, campaignId: "campaign-a", adGroupId, searchTerm, impressions, clicks, cost, purchases7d: orders, unitsSoldClicks7d: orders, sales7d: sales,
  purchases: orders, unitsSold: orders, sales,
});
const everything = { ...ALL_WORDS, pageSize: 50 };

async function seed() {
  const db = await migrate(createClient({ url: ":memory:" }));
  await storeWindow(db, { profileId, product: "SP_SEARCH", start: from, end: to, syncedAt: "now", rows: normalizeRows("SP_SEARCH", [
    term("jump rope with counter", { date: "2026-11-20", impressions: 20, clicks: 4, cost: 4.004, orders: 2, sales: 50 }),
    term("counter jump rope", { impressions: 10, clicks: 2, cost: 2.003 }),
    // Spaces separate words, so "counter," is a word of its own.
    term("smart rope with counter, cordless", { impressions: 5, clicks: 1, cost: 1 }),
    // A word appears once per search term however often it's typed.
    term("rope rope", { impressions: 4, clicks: 1, cost: 1, orders: 0, sales: 0 }),
    term("b0abcdefgh", { clicks: 3, cost: 3, orders: 3, sales: 60 }),
    // An ad group advertising both products.
    term("counter jump rope", { adGroupId: "group-b", impressions: 8, clicks: 4, cost: 3, orders: 3, sales: 75 }),
  ]) });
  await storeWindow(db, { profileId, product: "SB_SEARCH", start: from, end: to, syncedAt: "now", rows: normalizeRows("SB_SEARCH", [term("rope counter", { clicks: 5, cost: 5, orders: 1, sales: 25 })]) });
  await storeWindow(db, { profileId, product: "SP", start: from, end: to, syncedAt: "now", rows: [["group-a", "B0PRODUCTA"], ["group-b", "B0PRODUCTA"], ["group-b", "B0PRODUCTB"]].map(([adGroupId, asin]) => ({ date: to, campaignId: "campaign-a", adGroupId, asin, impressions: 1, clicks: 1, cost: 1, orders: 0, units: 0, sales: 0 })) });
  await db.batch([
    { sql: "INSERT INTO ads_search_product_history VALUES (?, 'SB_SEARCH', 'campaign-a', 'group-a', 'B0PRODUCTA', ?, ?, 'now')", args: [profileId, from, to] },
    { sql: "INSERT INTO ads_products VALUES (?, 'B0PRODUCTA', 'Jump Rope for Home Gym, Weighted', 'https://m.media-amazon.com/images/I/a.jpg', 'now')", args: [profileId] },
    { sql: "INSERT INTO ads_products VALUES (?, 'B0PRODUCTB', 'Counter Jump Rope', '', 'now')", args: [profileId] },
  ], "write");
  return db;
}
const find = (rows, sponsored, asin, word) => rows.find(r => r.sponsored === sponsored && r.asin === asin && r.word === word);

describe("words of search terms", () => {
  it("splits search terms on spaces, lowercased, each word once", () => {
    expect(wordsOf("Smart  Rope with Counter, counter")).toEqual(["smart", "rope", "with", "counter,", "counter"]);
  });

  it("adds up each word's search terms per ad type and product set, with when it last had activity", async () => {
    const db = await seed();
    const { rows, total } = await wordInsight(db, { profileId, from, to, settings: everything });
    expect(find(rows, "Products", "B0PRODUCTA", "counter")).toMatchObject({ terms: 2, impressions: 30, clicks: 6, orders: 3, units: 3, spend: 6.01, sales: 75,
      ctr: 20, cpc: 6.007 / 6, conversion: 50, acos: (6.007 / 75) * 100, roas: 75 / 6.007, lastSeen: to, inTitle: false, title: "Jump Rope for Home Gym, Weighted", image: "/api/ads/product-image?asin=B0PRODUCTA" });
    expect(find(rows, "Products", "B0PRODUCTA", "counter,")).toMatchObject({ terms: 1, clicks: 1 });
    expect(find(rows, "Products", "B0PRODUCTA", "rope")).toMatchObject({ terms: 4, clicks: 8, inTitle: true });
    expect(find(rows, "Products", "B0PRODUCTA", "with")).toMatchObject({ terms: 2, lastSeen: to, inTitle: false });
    // The Sponsored Brands search terms and the two-product ad group's are words of their own.
    expect(find(rows, "Brands", "B0PRODUCTA", "counter")).toMatchObject({ terms: 1, clicks: 5 });
    // In the title only when every product's title has it: B's does, A's doesn't.
    expect(find(rows, "Products", "B0PRODUCTA,B0PRODUCTB", "counter")).toMatchObject({ terms: 1, orders: 3, inTitle: false, products: [expect.objectContaining({ asin: "B0PRODUCTA" }), expect.objectContaining({ asin: "B0PRODUCTB" })] });
    expect(find(rows, "Products", "B0PRODUCTA,B0PRODUCTB", "jump")).toMatchObject({ inTitle: true });
    expect(rows.find(r => r.word === "b0abcdefgh")).toBeTruthy();
    expect(total).toBe(rows.length);
    // The summed counts, search term list and P&L stay out of the JSON.
    for (const key of ["counts", "searchTerms", "pl", "breakEvenBid"]) expect(JSON.parse(JSON.stringify(rows[0]))).not.toHaveProperty(key);
  });

  it("ignores the punctuation around a title's words", async () => {
    const db = await seed();
    await storeWindow(db, { profileId, product: "SP_SEARCH", start: "2026-10-27", end: "2026-10-27", syncedAt: "now", rows: normalizeRows("SP_SEARCH", [term("home gym", { date: "2026-10-27" })]) });
    const { rows } = await wordInsight(db, { profileId, from, to, settings: everything });
    expect(find(rows, "Products", "B0PRODUCTA", "gym")).toMatchObject({ inTitle: true, lastSeen: "2026-10-27" });
  });

  it("keeps, by default, words with 3 or more orders and 8% conversion that the title doesn't have, most orders first, without ASINs", async () => {
    const db = await seed();
    const report = await wordInsight(db, { profileId, from, to, settings: structuredClone(MISSING_TITLE_DEFAULTS) });
    // "jump" and "rope" are in the titles, and the ASIN is left out; ties go by word.
    expect(report.rows.map(r => [r.sponsored, r.asin, r.word, r.orders])).toEqual([
      ["Products", "B0PRODUCTA", "counter", 3], ["Products", "B0PRODUCTA,B0PRODUCTB", "counter", 3], ["Products", "B0PRODUCTA", "with", 3],
    ]);
    expect(report).toMatchObject({ page: 0, pageSize: 7, total: 3, settings: MISSING_TITLE_DEFAULTS });
    expect(report.totals).toMatchObject({ clicks: 15, orders: 9, conversion: 60 });
    expect(Object.keys(report.coverage)).toEqual(["SP_SEARCH", "SB_SEARCH"]);
    // Showing words in the title and ASINs too brings them back.
    const more = await wordInsight(db, { profileId, from, to, settings: { ...structuredClone(MISSING_TITLE_DEFAULTS), hideInTitle: false, hideAsins: false } });
    expect(more.rows.map(r => r.word)).toEqual(expect.arrayContaining(["b0abcdefgh", "jump", "rope"]));
    // A page past the end gives the last page.
    expect((await wordInsight(db, { profileId, from, to, page: 5, pageSize: 7, settings: structuredClone(MISSING_TITLE_DEFAULTS) })).page).toBe(0);
  });

  it("groups the words by product set for the Main words page, each with its search terms, most orders first", async () => {
    const db = await seed();
    const page = await mainWords(db, { profileId, from, to, settings: structuredClone(MISSING_TITLE_DEFAULTS) });
    expect(page.products.map(p => [p.asin, p.words.map(w => w.word)])).toEqual([["B0PRODUCTA", ["counter", "with"]], ["B0PRODUCTA,B0PRODUCTB", ["counter"]]]);
    expect(page.products[0]).toMatchObject({ title: "Jump Rope for Home Gym, Weighted", products: [expect.objectContaining({ asin: "B0PRODUCTA" })] });
    expect(page.products[0].words[0].searchTerms).toEqual([
      expect.objectContaining({ term: "jump rope with counter", impressions: 20, clicks: 4, orders: 2, sales: 50, spend: 4, conversion: 50, lastSeen: "2026-11-20" }),
      expect.objectContaining({ term: "counter jump rope", orders: 1, lastSeen: to }),
    ]);
    const all = await mainWords(db, { profileId, from, to, settings: ALL_WORDS });
    expect(all.products.flatMap(p => p.words).length).toBeGreaterThan(page.products.flatMap(p => p.words).length);
  });
});

describe("word card settings", () => {
  it("accepts the word card's own options and refuses other cards' metrics and options", () => {
    expect(cleanInsightSettings(structuredClone(MISSING_TITLE_DEFAULTS), MISSING_TITLE_DEFAULTS).settings).toEqual(MISSING_TITLE_DEFAULTS);
    const valid = changes => ({ ...structuredClone(MISSING_TITLE_DEFAULTS), ...changes });
    expect(cleanInsightSettings(valid({ order: ["word", "p", "sp", "clicks"] }), MISSING_TITLE_DEFAULTS).settings.order).toEqual(["word", "p", "sp", "clicks"]);
    for (const [changes, message] of [[{ hideInTitle: undefined }, /hideInTitle/], [{ sort: "pl" }, /sort/], [{ track: ["currentBid"] }, /tracked/], [{ order: ["term"] }, /column order/]]) {
      expect(cleanInsightSettings(valid(changes), MISSING_TITLE_DEFAULTS).error).toMatch(message);
    }
  });
});

describe("/api/ads/search-terms words views", () => {
  const signedIn = url => new Request(url, { headers: { cookie: `${SESSION_COOKIE}=${createSessionToken("secret")}` } });
  const env = () => {
    vi.stubEnv("SESSION_SECRET", "secret");
    vi.stubEnv("TURSO_DATABASE_URL", ":memory:");
    vi.stubEnv("AMAZON_ADS_PROFILE_ID", profileId);
  };

  it("serves a word card's page and the Main words page, with the filter's saved settings", async () => {
    env();
    try {
      const get = async query => GET(signedIn(`https://app.test/api/ads/search-terms?days=30&${query}`));
      expect((await GET(new Request("https://app.test/api/ads/search-terms?view=words"))).status).toBe(401);
      for (const query of ["view=word-insight", "view=nope", "view=words&filterId=zero-sales", "view=word-insight&filterId=zero-sales-keywords", "filterId=missing-title-words"]) {
        expect((await get(query)).status).toBe(400);
      }
      expect(await (await get("view=word-insight&filterId=missing-title-words&page=0&pageSize=10")).json()).toMatchObject({ filterId: "missing-title-words", page: 0, pageSize: 10, total: 0, rows: [], settings: MISSING_TITLE_DEFAULTS });
      expect(await (await get("view=word-insight&filterId=unique-word-zero-sales&page=0&pageSize=10")).json()).toMatchObject({ filterId: "unique-word-zero-sales", page: 0, pageSize: 10, total: 0, rows: [], settings: UNIQUE_WORD_ZERO_DEFAULTS });
      expect(await (await get("view=words")).json()).toMatchObject({ filterId: "", products: [], settings: ALL_WORDS });
      const saved = await saveRoute(new Request("https://app.test/api/ads/missing-title-words-settings", {
        method: "PUT", body: JSON.stringify({ ...structuredClone(MISSING_TITLE_DEFAULTS), filters: { orders: { min: 5 } } }), headers: { "Content-Type": "application/json", cookie: `${SESSION_COOKIE}=${createSessionToken("secret")}` },
      }));
      expect(saved.status).toBe(200);
      expect((await (await get("view=words&filterId=missing-title-words")).json()).settings.filters).toEqual({ orders: { min: 5 } });
      // The Search terms page is unchanged.
      expect(await (await get("filterId=zero-sales")).json()).toMatchObject({ filterId: "zero-sales", products: [], rows: [] });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
