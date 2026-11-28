import { migrate } from "../db.js";
import { addDays, isoDate, todayIn } from "../http.js";
import { PAGE_SIZES, ZERO_DEFAULTS } from "./insight-settings.js";
import { REPORTS } from "./sync.js";

// The shared query for the search term insight cards: from/to dates (or days=7|14|30, ending
// yesterday; the default is the last 30 days), page, and optionally pageSize (one of PAGE_SIZES;
// without it the card's saved rows per page apply). `today` is the profile's date.
export function insightQuery(params, timeZone = process.env.AMAZON_ADS_TIME_ZONE || "America/Los_Angeles") {
  const today = todayIn(timeZone);
  const days = Number(params.get("days") || 30);
  const to = params.has("to") ? isoDate(params.get("to")) : addDays(today, -1);
  const from = params.has("from") ? isoDate(params.get("from")) : to && [7, 14, 30].includes(days) ? isoDate(addDays(to, -days + 1)) : null;
  const page = Number(params.get("page") || 0);
  // At most 400 dates, counting both ends.
  const badRange = !from || !to || from > to || to > today || to > addDays(from, 399);
  const pageSize = params.has("pageSize") ? Number(params.get("pageSize")) : null;
  if (badRange || !Number.isSafeInteger(page) || page < 0 || page > 10000 || (pageSize !== null && !PAGE_SIZES.includes(pageSize))) return null;
  return { from, to, today, page, ...(pageSize ? { pageSize } : {}) };
}

export const cents = value => Math.round(Number(value || 0) * 100) / 100;
const asinPattern = /^B0[A-Z0-9]{8}$/i;
export const dayCount = (start, end) => (start <= end ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1 : 0);
// The first date Amazon still provides for a report type: historyDays before today, or the later
// retention start Amazon gave when it refused an older one (`retained`, by report type).
export const firstAvailable = (today, product, retained) => {
  const kept = addDays(today, -REPORTS[product].historyDays), said = retained.get(product);
  return said && said > kept ? said : kept;
};
export const retentionQuery = profileId => ({ sql: "SELECT ad_product, start_date FROM ads_report_retention WHERE profile_id = ?", args: [profileId] });

/** Every metric the card can filter, sort or show, from summed counts. Null means unknown. */
export function metrics(r) {
  const ratio = (a, b, k = 1) => (b ? (a / b) * k : null);
  return {
    impressions: r.impressions, clicks: r.clicks, orders: r.orders, units: r.units, spend: cents(r.cost), sales: cents(r.sales),
    costPerOrder: ratio(r.cost, r.orders), cpc: ratio(r.cost, r.clicks), ctr: ratio(r.clicks, r.impressions, 100), conversion: ratio(r.orders, r.clicks, 100),
    acos: ratio(r.cost, r.sales, 100), roas: ratio(r.sales, r.cost),
    // Without product costs, P&L is only known when nothing sold: the spend, lost. Sponsored Brands
    // spend isn't tied to one product's profit, so it stays blank, as in the source report.
    pl: r.adProduct === "SP_SEARCH" && r.orders === 0 ? cents(-r.cost) : null,
    breakEvenBid: null,
  };
}

export const within = (v, f) => v != null && (f.min == null || v + 0.000001 >= f.min) && (f.max == null || v - 0.000001 <= f.max);

/**
 * The products a row names (sorted, comma-separated ASINs), each with its title and image, from
 * `products` (ads_products rows by ASIN). Images are served by /api/ads/product-image, which
 * fetches them from Amazon on the server.
 */
export const productList = (products, asins) => asins.split(",").map(asin => {
  const product = products.get(asin);
  return { asin, title: product?.title || "", image: product?.image_url ? `/api/ads/product-image?asin=${encodeURIComponent(asin)}` : null };
});

/**
 * One search term per ad type and advertised product set for every insight card. Counts are aggregated over the chosen dates before the
 * card's filters, sort and pagination. `today` marks Amazon's available dates. `withCounts` keeps
 * each row's summed counts (`counts`, unrounded) and its last date with activity (`lastSeen`).
 */
export async function zeroSales(db, { profileId, from, to, today, page = 0, pageSize: asked, settings = ZERO_DEFAULTS, includeDetails = false, withCounts = false }) {
  // Rows per page: as asked, else the card's saved choice, else 7.
  const pageSize = asked ?? settings.pageSize ?? 7;
  await migrate(db);
  // Prefer keyword detail on dates already backfilled. Older dates retain their complete ad-group
  // totals, explicitly marked as lacking keyword detail, until their reports are refreshed.
  const source = includeDetails ? `(
    SELECT profile_id, ad_product, date, campaign_id, ad_group_id, search_term,
      impressions, clicks, cost, orders, units, sales, keyword_id, keyword, match_type, campaign_name, ad_group_name, 1 AS detailed
    FROM ads_search_term_details_daily t WHERE EXISTS (
      SELECT 1 FROM ads_search_detail_days d JOIN ads_synced_days s
      ON s.profile_id = d.profile_id AND s.ad_product = d.ad_product AND s.date = d.date AND s.synced_at = d.synced_at
      WHERE d.profile_id = t.profile_id AND d.ad_product = t.ad_product AND d.date = t.date)
    UNION ALL
    SELECT s.profile_id, s.ad_product, s.date, s.campaign_id, s.ad_group_id, s.search_term,
      s.impressions, s.clicks, s.cost, s.orders, s.units, s.sales, '', '', '', '', '', 0
    FROM ads_search_terms_daily s WHERE NOT EXISTS (
      SELECT 1 FROM ads_search_detail_days d JOIN ads_synced_days synced
      ON synced.profile_id = d.profile_id AND synced.ad_product = d.ad_product AND synced.date = d.date AND synced.synced_at = d.synced_at
      WHERE d.profile_id = s.profile_id AND d.ad_product = s.ad_product AND d.date = s.date)
  )` : "ads_search_terms_daily";
  const results = await db.batch([
    {
      // Sponsored Brands days take the ASINs their ad group is known to have advertised that day.
      sql: `SELECT t.ad_product, t.campaign_id, t.ad_group_id, t.search_term, h.asins,
                   ${includeDetails ? "t.keyword_id, t.keyword, t.match_type, t.detailed, MAX(t.campaign_name) AS campaign_name, MAX(t.ad_group_name) AS ad_group_name, MAX(t.date) AS last_seen," : ""}
                   SUM(t.impressions) AS impressions, SUM(t.clicks) AS clicks,
                   SUM(t.cost) AS cost, SUM(t.orders) AS orders, SUM(t.units) AS units, SUM(t.sales) AS sales, MAX(t.date) AS last_date
            FROM ${source} t
            LEFT JOIN ads_search_product_history h ON h.profile_id = t.profile_id AND h.ad_product = t.ad_product
              AND h.campaign_id = t.campaign_id AND h.ad_group_id = t.ad_group_id AND t.date BETWEEN h.valid_from AND h.valid_to
            WHERE t.profile_id = ? AND t.date BETWEEN ? AND ?
            GROUP BY t.ad_product, t.campaign_id, t.ad_group_id, t.search_term, h.asins ${includeDetails ? ", t.keyword_id, t.keyword, t.match_type, t.detailed" : ""}`,
      args: [profileId, from, to],
    },
    {
      sql: "SELECT ad_product, date FROM ads_synced_days WHERE profile_id = ? AND ad_product IN ('SP_SEARCH', 'SB_SEARCH') AND date BETWEEN ? AND ?",
      args: [profileId, from, to],
    },
    { sql: "SELECT ad_product FROM ads_report_requests WHERE profile_id = ? AND ad_product IN ('SP_SEARCH', 'SB_SEARCH') AND status IN ('PENDING', 'PROCESSING') GROUP BY ad_product", args: [profileId] },
    { sql: "SELECT campaign_id, ad_group_id, GROUP_CONCAT(DISTINCT asin) AS asins FROM ads_daily WHERE profile_id = ? AND ad_product = 'SP' AND date BETWEEN ? AND ? GROUP BY campaign_id, ad_group_id", args: [profileId, from, to] },
    { sql: "SELECT ready_through FROM ads_product_map_status WHERE profile_id = ? AND ad_product = 'SB_SEARCH'", args: [profileId] },
    { sql: "SELECT asin, title, image_url FROM ads_products WHERE profile_id = ?", args: [profileId] },
    retentionQuery(profileId),
  ], "read");
  const [raw, synced, pending, spProducts, sbMap, productRows, retention] = results;
  const retained = new Map(retention.rows.map(r => [String(r.ad_product), String(r.start_date)]));
  const products = new Map(productRows.rows.map(r => [String(r.asin), r]));
  const spAsins = new Map();
  for (const r of spProducts.rows) spAsins.set(`${r.campaign_id}|${r.ad_group_id}`, String(r.asins).split(",").sort().join(","));
  const grouped = new Map(), unattributed = { SP_SEARCH: 0, SB_SEARCH: 0 };
  for (const r of raw.rows) {
    // A search report has no advertised ASIN: Sponsored Products ad groups are matched through the
    // ads they reported in these dates, Sponsored Brands ones through what they advertised each day.
    // An ad group advertising several products gives one row naming all of them, since the report
    // can't say which of them a search was for. Rows whose products aren't known are left out of
    // this insight and their spend is reported instead.
    const sb = r.ad_product === "SB_SEARCH";
    // Sorted, comma-separated ASINs.
    const asin = sb ? (r.asins ? [...new Set(String(r.asins).split(","))].sort().join(",") : null) : spAsins.get(`${r.campaign_id}|${r.ad_group_id}`);
    if (!asin) {
      unattributed[r.ad_product] += Number(r.cost);
      continue;
    }
    const key = JSON.stringify([r.ad_product, asin, r.search_term]);
    const row = grouped.get(key) || { adProduct: r.ad_product, ...(includeDetails ? { details: [] } : {}), asin, term: r.search_term, impressions: 0, clicks: 0, cost: 0, orders: 0, units: 0, sales: 0 };
    for (const k of ["impressions", "clicks", "cost", "orders", "units", "sales"]) row[k] += Number(r[k]);
    if (!row.lastDate || r.last_date > row.lastDate) row.lastDate = r.last_date;
    if (includeDetails) row.details.push({ campaignId: String(r.campaign_id), adGroupId: String(r.ad_group_id),
      campaignName: r.campaign_name, adGroupName: r.ad_group_name, keywordId: r.keyword_id,
      keyword: r.keyword, matchType: r.match_type, lastSeen: r.last_seen, detailed: Boolean(r.detailed),
      ...metrics({ ...r, adProduct: r.ad_product }) });
    grouped.set(key, row);
  }
  const all = [...grouped.values()].map(r => ({ adProduct: r.adProduct, ...(includeDetails ? { details: r.details } : {}), asin: r.asin, term: r.term, counts: r, ...metrics(r) }));
  const matched = all.filter(r => Object.entries(settings.filters).every(([k, f]) => within(r[k], f))
    && !(settings.hideAsins && asinPattern.test(r.term)) && !(settings.hideKeywords && !asinPattern.test(r.term)));
  // Unknown values sort last either way.
  const sign = settings.dir === "asc" ? 1 : -1;
  const byMetric = (a, b) => {
    const x = a[settings.sort], y = b[settings.sort];
    return x == null || y == null ? (x == null) - (y == null) : (x - y) * sign;
  };
  matched.sort((a, b) => byMetric(a, b) || a.term.localeCompare(b.term) || a.adProduct.localeCompare(b.adProduct) || (a.campaignId || "").localeCompare(b.campaignId || "") || (a.adGroupId || "").localeCompare(b.adGroupId || "") || a.asin.localeCompare(b.asin));
  const total = matched.length;
  // A page past the end (the results shrank since it was asked for, after a sync say) gives the
  // last page instead, so the card keeps its rows and pager.
  const at = Math.min(page, Math.max(0, Math.ceil(total / pageSize) - 1));
  const shown = matched.slice(at * pageSize, (at + 1) * pageSize);
  // title and image are the first product's; `products` lists every product the row names.
  const rows = shown.map(r => {
    const list = productList(products, r.asin);
    // counts stays server-side unless asked for; an undefined property is left out of the JSON.
    return { ...r, counts: withCounts ? r.counts : undefined, lastSeen: withCounts ? r.counts.lastDate : undefined, sponsored: r.adProduct === "SP_SEARCH" ? "Products" : "Brands", title: list[0].title, image: list[0].image, products: list };
  });
  // The source table's footer totals the current page; its ratios come from the page's sums.
  const sum = { impressions: 0, clicks: 0, cost: 0, orders: 0, units: 0, sales: 0 };
  for (const r of shown) for (const k of Object.keys(sum)) sum[k] += r.counts[k];
  // P&L adds up the rows that have one, and stays unknown when none on the page do.
  const known = shown.filter(r => r.pl != null);
  const totals = { ...metrics(sum), pl: known.length ? cents(known.reduce((n, r) => n + r.pl, 0)) : null };
  const waiting = new Set(pending.rows.map(r => r.ad_product));
  // Sponsored Brands rows need the ad group -> ASIN history, which reaches as far as the latest
  // finished ads list confirms (ready_through). Until it covers the expected dates, their rows are
  // left out, so coverage isn't complete however many days have synced.
  const sbThrough = sbMap.rows[0]?.ready_through || null;
  const coverage = {};
  for (const k of ["SP_SEARCH", "SB_SEARCH"]) {
    // Only the dates Amazon can provide are expected to sync; older ones and today aren't.
    const availableFrom = today ? firstAvailable(today, k, retained) : from;
    const reportedThrough = today ? addDays(today, -1) : to;
    const start = from > availableFrom ? from : availableFrom, end = to < reportedThrough ? to : reportedThrough;
    const days = synced.rows.filter(r => r.ad_product === k && r.date >= start && r.date <= end).length;
    coverage[k] = { days, expectedDays: dayCount(start, end), pending: waiting.has(k), availableFrom, reportedThrough, unattributedSpend: cents(unattributed[k]), ...(k === "SB_SEARCH" ? { mapReady: Boolean(sbThrough) && (start > end || sbThrough >= end) } : {}) };
  }
  return { from, to, page: at, pageSize, total, totals, rows, coverage, settings };
}
