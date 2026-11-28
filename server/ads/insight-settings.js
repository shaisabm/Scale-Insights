import { migrate } from "../db.js";

// Settings for the insight cards ("Search Terms with 0 Sales", "Search Terms with High ACOS",
// "Keywords with 0 Sales", "Keywords with High ACOS", "Missing good Word In Title", "Unique Word with 0 Sales"): their name and tip, which search terms or keywords they list, how
// they're sorted, and which metric columns they show. Saved per profile and per card.
export const ZERO_METRICS = ["impressions", "clicks", "orders", "units", "cpc", "ctr", "conversion", "acos", "roas", "spend", "sales", "pl", "breakEvenBid"];
// Break even bid needs product costs, which aren't connected yet, so it can't filter, sort or show.
export const UNAVAILABLE_METRICS = ["breakEvenBid"];
// The card's column keys (product, ad type, search term, campaign, ad group, then metrics).
export const ZERO_COLUMNS = ["p", "sp", "term", "campaignId", "adGroupId", ...ZERO_METRICS];

// The rows-per-page choices every search term card offers.
export const PAGE_SIZES = [7, 10, 20, 30, 50];

export const ZERO_DEFAULTS = Object.freeze({
  name: "Search Terms with 0 Sales",
  description: "[Tip]: You can automatically remove poor performing search terms using Automation.",
  showTracked: true,
  hideAsins: true,
  hideKeywords: false,
  sort: "spend",
  dir: "desc",
  filters: { spend: { min: 10 }, orders: { max: 0 } },
  track: ["impressions", "clicks", "pl"],
  // Column keys in the order the headers were dragged into; empty keeps the default order.
  order: [],
  // Rows per page in the card's table.
  pageSize: 7,
});

// The High ACOS card has the same dialog and columns; its default filter is ACOS at 50% and up,
// with the worst ACOS first.
export const ACOS_DEFAULTS = Object.freeze({
  name: "Search Terms with High ACOS",
  description: "[Tip]: Use [Automation] strategies to improve your advertising results.",
  showTracked: true,
  hideAsins: true,
  hideKeywords: false,
  sort: "acos",
  dir: "desc",
  filters: { acos: { min: 50 } },
  track: ["impressions", "clicks", "sales", "acos"],
  // Column keys in the order the headers were dragged into; empty keeps the default order.
  order: [],
  // Rows per page in the card's table.
  pageSize: 7,
});

// The Performing Search Terms card has the same dialog and columns; its default filter is
// conversion at 15% and up, with the best converting terms first.
export const PERFORMING_DEFAULTS = Object.freeze({
  name: "Performing Search Terms",
  description: "[Tip]: Use [Mass Campaigns] to give each keyword its own campaign, then add automation to scale sales.",
  showTracked: true,
  hideAsins: true,
  hideKeywords: false,
  sort: "conversion",
  dir: "desc",
  filters: { conversion: { min: 15 } },
  track: ["impressions", "clicks", "orders", "sales", "conversion"],
  // Column keys in the order the headers were dragged into; empty keeps the default order.
  order: [],
  // Rows per page in the card's table.
  pageSize: 7,
});

// The keyword insight cards ("Keywords with 0 Sales") list keywords and targets instead. They add
// top-of-search impression share and the current bid to the metrics, in the dialog's order.
export const KEYWORD_METRICS = ["impressions", "clicks", "orders", "units", "cpc", "ctr", "conversion", "acos", "topShare", "roas", "spend", "sales", "pl", "breakEvenBid", "currentBid"];
// The card's column keys (product, campaign, ad group, keyword or target, then metrics).
export const KEYWORD_COLUMNS = ["p", "campaign", "adGroup", "keyword", ...KEYWORD_METRICS];
// What a keyword card can leave out: product, keyword and auto targets, each keyword match type,
// and paused keywords or targets.
export const KEYWORD_HIDES = ["hideProductTargets", "hideKeywordTargets", "hideAutoTargets", "hideExact", "hidePhrase", "hideBroad", "hidePausedKeywords", "hidePausedTargets"];

// Keywords and targets that spent $20 or more without an order, costliest first, leaving out auto
// targets.
export const KEYWORD_ZERO_DEFAULTS = Object.freeze({
  name: "Keywords with 0 Sales",
  description: "[Tip]: You can automatically reduce poor keyword bids using Automation.",
  showTracked: true,
  hideProductTargets: false,
  hideKeywordTargets: false,
  hideAutoTargets: true,
  hideExact: false,
  hidePhrase: false,
  hideBroad: false,
  hidePausedKeywords: false,
  hidePausedTargets: false,
  sort: "spend",
  dir: "desc",
  filters: { orders: { max: 0 }, spend: { min: 20 } },
  track: ["clicks", "cpc", "pl", "currentBid"],
  // The current bid sits next to the clicks, as in the original card.
  order: ["p", "campaign", "adGroup", "keyword", "clicks", "currentBid"],
  pageSize: 7,
});

// Keywords and targets that spent $20 or more at an ACOS of 60% or more, worst ACOS first, leaving out
// auto targets. P&L needs product costs once anything sold, so its column stays blank for now.
export const KEYWORD_HIGH_ACOS_DEFAULTS = Object.freeze({
  ...KEYWORD_ZERO_DEFAULTS,
  name: "Keywords with High ACOS",
  description: "[Tip]: You can automatically lower the bids of keywords with high ACOS using Automation.",
  sort: "acos",
  filters: { acos: { min: 60 }, spend: { min: 20 } },
  track: ["clicks", "units", "cpc", "conversion", "acos", "spend", "pl", "currentBid"],
  order: ["p", "campaign", "adGroup", "keyword", "clicks", "units", "conversion", "spend", "currentBid", "cpc", "acos", "pl"],
});

// The word insight cards ("Missing good Word In Title") list the words of search terms, per product
// and ad type. Their metrics leave out P&L and break even bid.
export const WORD_METRICS = ZERO_METRICS.filter(k => !["pl", "breakEvenBid"].includes(k));
// The card's column keys (product, ad type, word, then metrics).
export const WORD_COLUMNS = ["p", "sp", "word", ...WORD_METRICS];

// Words with 3 or more orders and 8% conversion or more that the product's title doesn't have, most
// orders first, leaving out ASINs.
export const MISSING_TITLE_DEFAULTS = Object.freeze({
  name: "Missing good Word In Title",
  description: "[Tip]: Consider adding relevant keyword with high traffic and conversion to your product title for boosting their organic ranking.",
  showTracked: true,
  hideAsins: true,
  hideInTitle: true,
  sort: "orders",
  dir: "desc",
  filters: { orders: { min: 3 }, conversion: { min: 8 } },
  track: ["clicks", "orders", "conversion"],
  order: [],
  pageSize: 7,
});

// Words with 25 or more clicks and no orders, most clicks first, leaving out ASINs.
export const UNIQUE_WORD_ZERO_DEFAULTS = Object.freeze({
  name: "Unique Word with 0 Sales",
  description: "[Tip]: You can save advertising cost by automatically reducing bids on words with no sales using Automation.",
  showTracked: true,
  hideAsins: true,
  hideInTitle: false,
  sort: "clicks",
  dir: "desc",
  filters: { clicks: { min: 25 }, orders: { max: 0 } },
  track: ["impressions", "clicks", "spend"],
  order: [],
  pageSize: 7,
});

// Each card starts from its own defaults until its settings are saved.
export const SEARCH_INSIGHT_DEFAULTS = { "zero-sales": ZERO_DEFAULTS, "high-acos": ACOS_DEFAULTS, performing: PERFORMING_DEFAULTS };
export const KEYWORD_INSIGHT_DEFAULTS = { "zero-sales-keywords": KEYWORD_ZERO_DEFAULTS, "high-acos-keywords": KEYWORD_HIGH_ACOS_DEFAULTS };
export const WORD_INSIGHT_DEFAULTS = { "missing-title-words": MISSING_TITLE_DEFAULTS, "unique-word-zero-sales": UNIQUE_WORD_ZERO_DEFAULTS };
export const INSIGHT_DEFAULTS = { ...SEARCH_INSIGHT_DEFAULTS, ...KEYWORD_INSIGHT_DEFAULTS, ...WORD_INSIGHT_DEFAULTS };

// What a card's settings may name: search term, keyword and word cards differ in metrics, columns
// and what they can hide.
const SEARCH_SPEC = { metrics: ZERO_METRICS, columns: ZERO_COLUMNS, hides: ["hideAsins", "hideKeywords"] };
const KEYWORD_SPEC = { metrics: KEYWORD_METRICS, columns: KEYWORD_COLUMNS, hides: KEYWORD_HIDES };
const WORD_SPEC = { metrics: WORD_METRICS, columns: WORD_COLUMNS, hides: ["hideAsins", "hideInTitle"] };
const specOf = defaults => (Object.values(KEYWORD_INSIGHT_DEFAULTS).includes(defaults) ? KEYWORD_SPEC
  : Object.values(WORD_INSIGHT_DEFAULTS).includes(defaults) ? WORD_SPEC : SEARCH_SPEC);

/**
 * { settings } with everything checked and normalized, or { error } for the first problem.
 * `defaults` says which card they're for.
 */
export function cleanInsightSettings(input, defaults = ZERO_DEFAULTS) {
  const spec = specOf(defaults);
  const usable = k => spec.metrics.includes(k) && !UNAVAILABLE_METRICS.includes(k);
  if (!input || typeof input !== "object") return { error: "Settings must be an object." };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80) return { error: "The name must be 1 to 80 characters." };
  const description = typeof input.description === "string" ? input.description.trim() : null;
  if (description === null || description.length > 300) return { error: "The description must be at most 300 characters." };
  for (const k of ["showTracked", ...spec.hides]) if (typeof input[k] !== "boolean") return { error: `${k} must be true or false.` };
  if (!usable(input.sort) || !["asc", "desc"].includes(input.dir)) return { error: "Choose a sort order from the list." };
  const filters = {};
  for (const [k, f] of Object.entries(input.filters || {})) {
    if (!usable(k) || !f || typeof f !== "object") return { error: `${k} can't be filtered.` };
    const limits = {};
    for (const side of ["min", "max"]) {
      if (f[side] == null || f[side] === "") continue;
      // Only numbers and numeric strings: Number() would also turn [5] into 5 and true into 1.
      const n = ["number", "string"].includes(typeof f[side]) ? Number(f[side]) : NaN;
      if (!Number.isFinite(n)) return { error: `The ${side} for ${k} must be a number.` };
      limits[side] = n;
    }
    if (limits.min != null && limits.max != null && limits.min > limits.max) return { error: `The min for ${k} is above its max.` };
    if (Object.keys(limits).length) filters[k] = limits;
  }
  if (!Array.isArray(input.track) || input.track.some(k => !usable(k))) return { error: "Only available metrics can be tracked." };
  const track = spec.metrics.filter(k => input.track.includes(k));
  // Settings saved before columns could be moved have no order.
  const order = input.order ?? [];
  if (!Array.isArray(order) || order.some(k => !spec.columns.includes(k)) || new Set(order).size !== order.length) return { error: "The column order can only list the card's columns, each once." };
  // Settings saved before the rows per page could be chosen show 7.
  const pageSize = input.pageSize ?? 7;
  if (!PAGE_SIZES.includes(pageSize)) return { error: "Choose 7, 10, 20, 30 or 50 rows per page." };
  const hides = Object.fromEntries(spec.hides.map(k => [k, input[k]]));
  return { settings: { name, description, showTracked: input.showTracked, ...hides, sort: input.sort, dir: input.dir, filters, track, order, pageSize } };
}

// The insight key a defaults object belongs to, which settings are stored under.
const insightOf = defaults => Object.entries(INSIGHT_DEFAULTS).find(([, d]) => d === defaults)?.[0];

// The old name the zero-sales card's callers know.
export const cleanZeroSettings = input => cleanInsightSettings(input);

/** The profile's saved settings for one insight, or its defaults when none are saved (or they no
 * longer validate). */
export async function loadZeroSettings(db, profileId, defaults = ZERO_DEFAULTS) {
  await migrate(db);
  const { rows } = await db.execute({ sql: "SELECT settings FROM ads_insight_settings WHERE profile_id = ? AND insight = ?", args: [profileId, insightOf(defaults)] });
  if (!rows.length) return structuredClone(defaults);
  try {
    return cleanInsightSettings(JSON.parse(rows[0].settings), defaults).settings || structuredClone(defaults);
  } catch {
    return structuredClone(defaults);
  }
}

export async function saveZeroSettings(db, profileId, settings, at = new Date().toISOString(), defaults = ZERO_DEFAULTS) {
  await migrate(db);
  await db.execute({
    sql: "INSERT OR REPLACE INTO ads_insight_settings (profile_id, insight, settings, updated_at) VALUES (?, ?, ?, ?)",
    args: [profileId, insightOf(defaults), JSON.stringify(settings), at],
  });
}
