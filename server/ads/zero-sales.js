import { migrate } from "../db.js";
import { addDays } from "../http.js";
import { REPORTS } from "./sync.js";

const cents = value => Math.round(Number(value || 0) * 100) / 100;
const asinPattern = /^B0[A-Z0-9]{8}$/i;
const dayCount = (start, end) => (start <= end ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1 : 0);

/**
 * One search term per ad type/campaign/ad group, aggregated across the chosen dates. `today`
 * (the profile's date) marks which of those dates Amazon can provide: from `historyDays` back,
 * through yesterday.
 */
export async function zeroSales(db, { profileId, from, to, today, page = 0, pageSize = 7, minSpend = 10, maxOrders = 0, hideAsins = true }) {
  await migrate(db);
  const results = await db.batch([
    {
      sql: `SELECT ad_product, campaign_id, ad_group_id, search_term,
                   SUM(impressions) AS impressions, SUM(clicks) AS clicks,
                   SUM(cost) AS cost, SUM(orders) AS orders, SUM(sales) AS sales
            FROM ads_search_terms_daily
            WHERE profile_id = ? AND date BETWEEN ? AND ?
            GROUP BY ad_product, campaign_id, ad_group_id, search_term`,
      args: [profileId, from, to],
    },
    {
      sql: "SELECT ad_product, date FROM ads_synced_days WHERE profile_id = ? AND ad_product IN ('SP_SEARCH', 'SB_SEARCH') AND date BETWEEN ? AND ?",
      args: [profileId, from, to],
    },
    { sql: "SELECT ad_product FROM ads_report_requests WHERE profile_id = ? AND ad_product IN ('SP_SEARCH', 'SB_SEARCH') AND status IN ('PENDING', 'PROCESSING') GROUP BY ad_product", args: [profileId] },
    { sql: "SELECT campaign_id, ad_group_id, COUNT(DISTINCT asin) AS products, MIN(asin) AS asin FROM ads_daily WHERE profile_id = ? AND ad_product = 'SP' AND date BETWEEN ? AND ? GROUP BY campaign_id, ad_group_id", args: [profileId, from, to] },
    { sql: "SELECT campaign_id, ad_group_id, COUNT(DISTINCT asin) AS products, MIN(asin) AS asin FROM ads_search_product_map WHERE profile_id = ? AND ad_product = 'SB_SEARCH' GROUP BY campaign_id, ad_group_id", args: [profileId] },
    { sql: "SELECT ready_at FROM ads_product_map_status WHERE profile_id = ? AND ad_product = 'SB_SEARCH'", args: [profileId] },
    { sql: "SELECT asin, title, image_url FROM ads_products WHERE profile_id = ?", args: [profileId] },
  ], "read");
  const [raw, synced, pending, spProducts, sbProducts, sbMap, productRows] = results;
  const products = new Map(productRows.rows.map(r => [String(r.asin), r]));
  const map = new Map();
  for (const [product, result] of [["SP_SEARCH", spProducts], ["SB_SEARCH", sbProducts]]) {
    for (const r of result.rows) if (Number(r.products) === 1) map.set(`${product}|${r.campaign_id}|${r.ad_group_id}`, r.asin);
  }
  const grouped = new Map();
  for (const r of raw.rows) {
    // A search report has no advertised ASIN. Ambiguous ad groups cannot be assigned to a
    // product honestly, so leave them out of this product-level insight.
    const asin = map.get(`${r.ad_product}|${r.campaign_id}|${r.ad_group_id}`);
    if (!asin) continue;
    const key = `${r.ad_product}|${asin}|${r.search_term}`;
    const row = grouped.get(key) || { adProduct: r.ad_product, asin, term: r.search_term, impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 };
    row.impressions += Number(r.impressions);
    row.clicks += Number(r.clicks);
    row.cost += Number(r.cost);
    row.orders += Number(r.orders);
    row.sales += Number(r.sales);
    grouped.set(key, row);
  }
  const all = [...grouped.values()].map(r => ({ ...r, cost: cents(r.cost), sales: cents(r.sales) }));
  const matched = all.filter(r => r.orders <= maxOrders && r.cost + 0.000001 >= minSpend && (!hideAsins || !asinPattern.test(r.term)));
  matched.sort((a, b) => b.cost - a.cost || a.term.localeCompare(b.term) || a.adProduct.localeCompare(b.adProduct) || a.asin.localeCompare(b.asin));
  const total = matched.length;
  const shown = matched.slice(page * pageSize, (page + 1) * pageSize);
  // Images are served by /api/ads/product-image, which fetches them from Amazon on the server.
  const rows = shown.map(r => {
    const product = products.get(r.asin);
    return {
      ...r, sponsored: r.adProduct === "SP_SEARCH" ? "Products" : "Brands", pl: r.adProduct === "SP_SEARCH" ? cents(-r.cost) : null,
      title: product?.title || "", image: product?.image_url ? `/api/ads/product-image?asin=${encodeURIComponent(r.asin)}` : null,
    };
  });
  // The source table's footer totals the current page, including rows outside a screenshot crop.
  const totals = shown.reduce((s, r) => ({ impressions: s.impressions + r.impressions, clicks: s.clicks + r.clicks, pl: s.pl - (r.adProduct === "SP_SEARCH" ? r.cost : 0) }), { impressions: 0, clicks: 0, pl: 0 });
  totals.pl = cents(totals.pl);
  const waiting = new Set(pending.rows.map(r => r.ad_product));
  // Sponsored Brands rows need the ad group -> ASIN map; until one has been built they are all
  // left out, so that coverage isn't complete however many days have synced.
  const sbMapReady = Boolean(sbMap.rows[0]?.ready_at);
  const coverage = {};
  for (const k of ["SP_SEARCH", "SB_SEARCH"]) {
    // Only the dates Amazon can provide are expected to sync; older ones and today aren't.
    const availableFrom = today ? addDays(today, -REPORTS[k].historyDays) : from;
    const reportedThrough = today ? addDays(today, -1) : to;
    const start = from > availableFrom ? from : availableFrom, end = to < reportedThrough ? to : reportedThrough;
    const days = synced.rows.filter(r => r.ad_product === k && r.date >= start && r.date <= end).length;
    coverage[k] = { days, expectedDays: dayCount(start, end), pending: waiting.has(k), availableFrom, reportedThrough, ...(k === "SB_SEARCH" ? { mapReady: sbMapReady } : {}) };
  }
  return { from, to, page, pageSize, total, totals, rows, coverage };
}
