import { migrate } from "../db.js";
import { addDays } from "../http.js";
import { REPORTS } from "./sync.js";

const money = v => Math.round(Number(v) * 100) / 100;

/**
 * Daily Amazon Ads totals per ad product between two dates, which days each product has synced
 * (as contiguous ranges, so a window that hasn't synced stays a gap), and a state for every ad
 * type the sync covers: "ok" (has synced days), "pending" (waiting on Amazon), "missing" (never
 * synced) or "unsupported" (Amazon refused it for this account).
 */
export async function adsTrend(db, { profileId, from, to }) {
  await migrate(db);
  // One read-only transaction, so the totals and the sync info come from the same moment even if
  // a sync stores a window in between.
  const [days, stored, pending, refused] = await db.batch(
    [
      {
        sql: `SELECT ad_product, date, SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(cost) AS cost,
                SUM(orders) AS orders, SUM(units) AS units, SUM(sales) AS sales
              FROM ads_daily WHERE profile_id = ? AND date BETWEEN ? AND ?
              GROUP BY ad_product, date ORDER BY date, ad_product`,
        args: [profileId, from, to],
      },
      { sql: "SELECT ad_product, date, synced_at FROM ads_synced_days WHERE profile_id = ? ORDER BY ad_product, date", args: [profileId] },
      { sql: "SELECT DISTINCT ad_product FROM ads_report_requests WHERE profile_id = ? AND status IN ('PENDING', 'PROCESSING')", args: [profileId] },
      { sql: "SELECT ad_product FROM ads_unsupported WHERE profile_id = ?", args: [profileId] },
    ],
    "read",
  );

  const synced = {};
  for (const r of stored.rows) {
    const s = (synced[r.ad_product] ||= { first: r.date, last: r.date, syncedAt: r.synced_at, ranges: [] });
    const run = s.ranges[s.ranges.length - 1];
    if (run && addDays(run[1], 1) === r.date) run[1] = r.date;
    else s.ranges.push([r.date, r.date]);
    s.last = r.date;
    if (r.synced_at > s.syncedAt) s.syncedAt = r.synced_at;
  }
  const waiting = new Set(pending.rows.map(r => r.ad_product));
  const unsupported = new Set(refused.rows.map(r => r.ad_product));
  const state = k => (unsupported.has(k) ? "unsupported" : synced[k] ? "ok" : waiting.has(k) ? "pending" : "missing");

  return {
    from,
    to,
    days: days.rows.map(r => ({
      adProduct: r.ad_product,
      date: r.date,
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      cost: money(r.cost),
      orders: Number(r.orders),
      units: Number(r.units),
      sales: money(r.sales),
    })),
    synced,
    adTypes: Object.fromEntries(Object.keys(REPORTS).map(k => [k, { state: state(k) }])),
  };
}
