import { metrics, within, zeroSales } from "./zero-sales.js";

const asinWord = /^B0[A-Z0-9]{8}$/i;
const COUNTS = ["impressions", "clicks", "cost", "orders", "units", "sales"];
// Every search term, unfiltered, which the words are made from.
const EVERY_TERM = { filters: {}, hideAsins: false, hideKeywords: false, sort: "clicks", dir: "desc", order: [], track: [] };
// The Main words page without a filter lists every word.
export const ALL_WORDS = { name: "All words", filters: {}, hideAsins: false, hideInTitle: false, sort: "clicks", dir: "desc", track: [], order: [], showTracked: true };

/** The words of a search term: what spaces separate, lowercased, each once ("counter," stays as typed). */
export const wordsOf = text => [...new Set(String(text || "").toLowerCase().split(/\s+/u).filter(Boolean))];
const edges = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
// A title's words with the punctuation around them trimmed ("Gym," is "gym"), and the letters and
// digits inside them ("3-in-1" also gives "3", "in" and "1").
const titleWordsOf = title => new Set(String(title).toLowerCase().split(/\s+/u).flatMap(w => [w.replace(edges, ""), ...w.split(/[^\p{L}\p{N}]+/u)]).filter(Boolean));
const inTitleWords = (set, word) => set.has(word) || set.has(word.replace(edges, ""));

// Metrics from summed counts. P&L and break even bid need product costs, so words don't have them.
const wordMetrics = counts => ({ ...metrics({ ...counts, adProduct: "" }), pl: undefined, breakEvenBid: undefined });
const sum = rows => {
  const total = Object.fromEntries(COUNTS.map(k => [k, 0]));
  for (const r of rows) for (const k of COUNTS) total[k] += r.counts[k];
  return total;
};

/**
 * Every word of the search terms in the dates, per ad type and advertised product set, with the
 * search terms it's in (each counted once however often the word appears in it). A word is in the
 * title when every product the row names has it in its title, and unknown (null) when a title is.
 */
async function everyWord(db, options) {
  const all = await zeroSales(db, { ...options, settings: EVERY_TERM, page: 0, pageSize: Number.MAX_SAFE_INTEGER, withCounts: true });
  const titles = new Map(), titleWords = p => {
    if (!titles.has(p.asin)) titles.set(p.asin, p.title ? titleWordsOf(p.title) : null);
    return titles.get(p.asin);
  };
  const words = new Map();
  for (const r of all.rows) {
    for (const word of wordsOf(r.term)) {
      const key = JSON.stringify([r.adProduct, r.asin, word]);
      const w = words.get(key) || { adProduct: r.adProduct, sponsored: r.sponsored, asin: r.asin, title: r.title, image: r.image, products: r.products, word, searchTerms: [], lastSeen: null };
      w.searchTerms.push(r);
      if (!w.lastSeen || r.lastSeen > w.lastSeen) w.lastSeen = r.lastSeen;
      words.set(key, w);
    }
  }
  const rows = [...words.values()].map(w => {
    const sets = w.products.map(titleWords), counts = sum(w.searchTerms);
    return { ...w, counts, terms: w.searchTerms.length, inTitle: sets.includes(null) ? null : sets.every(s => inTitleWords(s, w.word)), ...wordMetrics(counts) };
  });
  return { all, rows };
}

// The words a card's settings keep, sorted by them. Unknown values sort last either way.
function keep(rows, settings) {
  const sign = settings.dir === "asc" ? 1 : -1;
  return rows
    .filter(r => Object.entries(settings.filters).every(([k, f]) => within(r[k], f))
      && !(settings.hideAsins && asinWord.test(r.word)) && !(settings.hideInTitle && r.inTitle === true))
    .sort((a, b) => {
      const x = a[settings.sort], y = b[settings.sort];
      return (x == null || y == null ? (x == null) - (y == null) : (x - y) * sign)
        || a.word.localeCompare(b.word) || a.adProduct.localeCompare(b.adProduct) || a.asin.localeCompare(b.asin);
    });
}

// A search term as the Main words page lists it under a word.
const termRow = r => ({ term: r.term, impressions: r.impressions, clicks: r.clicks, orders: r.orders, units: r.units, sales: r.sales, spend: r.spend,
  ctr: r.ctr, cpc: r.cpc, conversion: r.conversion, acos: r.acos, roas: r.roas, lastSeen: r.lastSeen });
// counts and the search terms stay server-side; an undefined property is left out of the JSON.
const wordRow = r => ({ ...r, counts: undefined, searchTerms: undefined });

/**
 * One page of a word insight card ("Missing good Word In Title"), shaped like the search term
 * cards' responses: the words its settings keep, their page's totals and the search reports'
 * coverage.
 */
export async function wordInsight(db, { profileId, from, to, today, page = 0, pageSize: asked, settings }) {
  const pageSize = asked ?? settings.pageSize ?? 7;
  const { all, rows } = await everyWord(db, { profileId, from, to, today });
  const matched = keep(rows, settings), total = matched.length;
  // A page past the end (the results shrank since it was asked for) gives the last page instead.
  const at = Math.min(page, Math.max(0, Math.ceil(total / pageSize) - 1));
  const shown = matched.slice(at * pageSize, (at + 1) * pageSize);
  return { from, to, page: at, pageSize, total, totals: wordMetrics(sum(shown)), rows: shown.map(wordRow), coverage: all.coverage, settings };
}

/**
 * The Main words page: the words the settings keep, grouped by advertised product set, each with
 * the search terms it's in, most orders first.
 */
export async function mainWords(db, { profileId, from, to, today, settings }) {
  const { all, rows } = await everyWord(db, { profileId, from, to, today });
  const products = new Map();
  for (const r of keep(rows, settings)) {
    const p = products.get(r.asin) || { asin: r.asin, title: r.title, image: r.image, products: r.products, words: [] };
    p.words.push({ ...wordRow(r), searchTerms: r.searchTerms.map(termRow).sort((a, b) => b.orders - a.orders || b.clicks - a.clicks || a.term.localeCompare(b.term)) });
    products.set(r.asin, p);
  }
  return { from, to, settings, coverage: all.coverage, products: [...products.values()] };
}
