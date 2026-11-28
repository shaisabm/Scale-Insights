import { migrate } from "../db.js";
import { addDays } from "../http.js";
import { KEYWORD_ZERO_DEFAULTS } from "./insight-settings.js";
import { REPORTS, TARGETING_PRODUCTS } from "./sync.js";
import { cents, dayCount, metrics, productList, within } from "./zero-sales.js";

const SPONSORED = { SP_TARGETING: "Products", SB_TARGETING: "Brands", SD_TARGETING: "Display" };
// ads_keyword_states keeps Sponsored Products and Brands entities under their search report's name.
const STATE_PRODUCT = { SP_TARGETING: "SP_SEARCH", SB_TARGETING: "SB_SEARCH", SD_TARGETING: "SD" };
const inList = TARGETING_PRODUCTS.map(() => "?").join(", ");

/** Whether a keyword card's settings leave out a row (with its kind, match type and state). */
export function hiddenKeyword(settings, r) {
  const target = r.kind !== "keyword";
  return Boolean((settings.hideProductTargets && r.kind === "target") || (settings.hideKeywordTargets && r.kind === "keyword") || (settings.hideAutoTargets && r.kind === "auto")
    || (settings.hideExact && r.matchType === "exact") || (settings.hidePhrase && r.matchType === "phrase") || (settings.hideBroad && r.matchType === "broad")
    || (r.state === "paused" && (target ? settings.hidePausedTargets : settings.hidePausedKeywords)));
}

/** Every metric a keyword card can filter, sort or show, from summed counts. Null means unknown. */
function keywordMetrics(r) {
  const m = metrics(r);
  return {
    ...m,
    // Without product costs, P&L is only known when nothing sold: the spend, lost.
    pl: r.orders === 0 ? 0 - m.spend : null,
    // Amazon reports the share per day; over several days it's weighted by each day's impressions.
    topShare: r.shareImpressions ? r.shareSum / r.shareImpressions : null,
  };
}

/**
 * One row per keyword or target (with its ad type, campaign and ad group) for a keyword insight
 * card. Counts are summed over the chosen dates before the card's filters, sort and pagination.
 * Keywords in ad groups advertising several products are listed like any other. `today` marks
 * Amazon's available dates.
 */
export async function keywordInsight(db, { profileId, from, to, today, page = 0, pageSize: asked, settings = KEYWORD_ZERO_DEFAULTS }) {
  // Rows per page: as asked, else the card's saved choice, else 7.
  const pageSize = asked ?? settings.pageSize ?? 7;
  await migrate(db);
  const [raw, entities, synced, pending, refused, spProducts, sbProducts, sdProducts, productRows] = await db.batch([
    {
      // With exactly one MAX(), SQLite takes the other plain columns (names, text, kind, bid) from
      // the row it picks: the latest day in the range, so renamed campaigns show their new name.
      sql: `SELECT ad_product, campaign_id, ad_group_id, target_id, MAX(date) AS last_date, campaign_name, ad_group_name, target, match_type, kind, bid,
                   SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(cost) AS cost, SUM(orders) AS orders, SUM(units) AS units, SUM(sales) AS sales,
                   SUM(CASE WHEN top_share IS NULL THEN 0 ELSE impressions END) AS share_impressions, SUM(COALESCE(top_share, 0) * impressions) AS share_sum
            FROM ads_targets_daily WHERE profile_id = ? AND date BETWEEN ? AND ?
            GROUP BY ad_product, campaign_id, ad_group_id, target_id`,
      args: [profileId, from, to],
    },
    {
      sql: `SELECT s.ad_product, s.campaign_id, s.ad_group_id, s.keyword_id, s.state, b.bid FROM ads_keyword_states s
            LEFT JOIN ads_keyword_bids b ON b.profile_id = s.profile_id AND b.ad_product = s.ad_product AND b.kind = s.kind
              AND b.campaign_id = s.campaign_id AND b.ad_group_id = s.ad_group_id AND b.keyword_id = s.keyword_id
            WHERE s.profile_id = ?`,
      args: [profileId],
    },
    { sql: `SELECT ad_product, date FROM ads_synced_days WHERE profile_id = ? AND ad_product IN (${inList}) AND date BETWEEN ? AND ?`, args: [profileId, ...TARGETING_PRODUCTS, from, to] },
    { sql: `SELECT ad_product FROM ads_report_requests WHERE profile_id = ? AND ad_product IN (${inList}) AND status IN ('PENDING', 'PROCESSING') GROUP BY ad_product`, args: [profileId, ...TARGETING_PRODUCTS] },
    { sql: `SELECT ad_product FROM ads_unsupported WHERE profile_id = ? AND ad_product IN (${inList})`, args: [profileId, ...TARGETING_PRODUCTS] },
    // The products each ad group advertised in these dates: Sponsored Products through the ads that
    // reported, Sponsored Brands through the history of what its ads listed. Sponsored Display
    // reports name no product and its ads list has no history, so its ad groups take the product
    // ads they have enabled now, or, with none enabled, the ones they have.
    { sql: "SELECT campaign_id, ad_group_id, asin FROM ads_daily WHERE profile_id = ? AND ad_product = 'SP' AND asin <> '' AND date BETWEEN ? AND ? GROUP BY campaign_id, ad_group_id, asin", args: [profileId, from, to] },
    { sql: "SELECT campaign_id, ad_group_id, asins FROM ads_search_product_history WHERE profile_id = ? AND ad_product = 'SB_SEARCH' AND valid_from <= ? AND valid_to >= ?", args: [profileId, to, from] },
    {
      sql: `SELECT campaign_id, ad_group_id, asin FROM ads_sd_product_ads a WHERE profile_id = ? AND (state = 'enabled' OR NOT EXISTS (
              SELECT 1 FROM ads_sd_product_ads e WHERE e.profile_id = a.profile_id AND e.campaign_id = a.campaign_id AND e.ad_group_id = a.ad_group_id AND e.state = 'enabled'))`,
      args: [profileId],
    },
    { sql: "SELECT asin, title, image_url FROM ads_products WHERE profile_id = ?", args: [profileId] },
  ], "read");
  const advertised = new Map();
  const advertise = (product, r, asins) => {
    const k = JSON.stringify([product, String(r.campaign_id), String(r.ad_group_id)]);
    const set = advertised.get(k) || new Set();
    for (const asin of asins) set.add(asin);
    advertised.set(k, set);
  };
  for (const r of spProducts.rows) advertise("SP_TARGETING", r, [String(r.asin)]);
  for (const r of sbProducts.rows) advertise("SB_TARGETING", r, String(r.asins).split(","));
  for (const r of sdProducts.rows) advertise("SD_TARGETING", r, [String(r.asin)]);
  const products = new Map(productRows.rows.map(r => [String(r.asin), r]));
  const key = (product, campaignId, adGroupId, id) => JSON.stringify([product, String(campaignId), String(adGroupId), String(id)]);
  const current = new Map(entities.rows.map(r => [key(r.ad_product, r.campaign_id, r.ad_group_id, r.keyword_id), r]));
  const all = raw.rows.map(r => {
    const entity = current.get(key(STATE_PRODUCT[r.ad_product], r.campaign_id, r.ad_group_id, r.target_id));
    const counts = { impressions: Number(r.impressions), clicks: Number(r.clicks), cost: Number(r.cost), orders: Number(r.orders), units: Number(r.units), sales: Number(r.sales),
      shareImpressions: Number(r.share_impressions), shareSum: Number(r.share_sum) };
    return {
      adProduct: r.ad_product, sponsored: SPONSORED[r.ad_product], campaignId: String(r.campaign_id), adGroupId: String(r.ad_group_id), keywordId: String(r.target_id),
      campaign: r.campaign_name, adGroup: r.ad_group_name, keyword: r.target, matchType: r.match_type, kind: r.kind, state: entity?.state || "unknown", counts,
      ...keywordMetrics(counts),
      // The bid the ads list gives now, else (for a target using its ad group's default bid, or one
      // not listed yet) the bid last reported in the range.
      currentBid: entity?.bid ?? (r.bid == null ? null : Number(r.bid)),
    };
  });
  const matched = all.filter(r => Object.entries(settings.filters).every(([k, f]) => within(r[k], f)) && !hiddenKeyword(settings, r));
  // Unknown values sort last either way.
  const sign = settings.dir === "asc" ? 1 : -1;
  const byMetric = (a, b) => {
    const x = a[settings.sort], y = b[settings.sort];
    return x == null || y == null ? (x == null) - (y == null) : (x - y) * sign;
  };
  matched.sort((a, b) => byMetric(a, b) || a.keyword.localeCompare(b.keyword) || a.campaign.localeCompare(b.campaign) || a.adGroup.localeCompare(b.adGroup)
    || a.adProduct.localeCompare(b.adProduct) || a.campaignId.localeCompare(b.campaignId) || a.adGroupId.localeCompare(b.adGroupId) || a.keywordId.localeCompare(b.keywordId));
  const total = matched.length;
  // A page past the end (the results shrank since it was asked for, after a sync say) gives the
  // last page instead, so the card keeps its rows and pager.
  const at = Math.min(page, Math.max(0, Math.ceil(total / pageSize) - 1));
  const shown = matched.slice(at * pageSize, (at + 1) * pageSize);
  // The footer totals the current page; its ratios come from the page's sums. P&L adds up the rows
  // that have one, and a current bid doesn't add up.
  const sum = { impressions: 0, clicks: 0, cost: 0, orders: 0, units: 0, sales: 0, shareImpressions: 0, shareSum: 0 };
  for (const r of shown) for (const k of Object.keys(sum)) sum[k] += r.counts[k];
  const known = shown.filter(r => r.pl != null);
  const totals = { ...keywordMetrics(sum), pl: known.length ? cents(known.reduce((n, r) => n + r.pl, 0)) : null, currentBid: null };
  const waiting = new Set(pending.rows.map(r => r.ad_product)), unsupported = new Set(refused.rows.map(r => r.ad_product));
  const coverage = {};
  for (const k of TARGETING_PRODUCTS) {
    // An ad type Amazon refused for this account has no reports to wait for.
    if (unsupported.has(k)) continue;
    // Only the dates Amazon can provide are expected to sync; older ones and today aren't.
    const availableFrom = today ? addDays(today, -REPORTS[k].historyDays) : from;
    const reportedThrough = today ? addDays(today, -1) : to;
    const start = from > availableFrom ? from : availableFrom, end = to < reportedThrough ? to : reportedThrough;
    const days = synced.rows.filter(r => r.ad_product === k && r.date >= start && r.date <= end).length;
    coverage[k] = { days, expectedDays: dayCount(start, end), pending: waiting.has(k), availableFrom, reportedThrough };
  }
  // As on the search term cards, title and image are the first product's and `products` lists every
  // product the row's ad group advertised. counts stays server-side; an undefined property is left
  // out of the JSON.
  const rows = shown.map(r => {
    const asin = [...(advertised.get(JSON.stringify([r.adProduct, r.campaignId, r.adGroupId])) || [])].sort().join(",");
    const list = asin ? productList(products, asin) : [];
    return { ...r, counts: undefined, asin, title: list[0]?.title || "", image: list[0]?.image || null, products: list };
  });
  return { from, to, page: at, pageSize, total, totals, rows, coverage, settings };
}
