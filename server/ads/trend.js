import { migrate } from "../db.js";

const money = v => Math.round(Number(v) * 100) / 100;

/** Daily Amazon Ads totals per ad product between two dates, and how far each product is synced. */
export async function adsTrend(db, { profileId, from, to }) {
  await migrate(db);
  const days = await db.execute({
    sql: `SELECT ad_product, date, SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(cost) AS cost,
            SUM(orders) AS orders, SUM(units) AS units, SUM(sales) AS sales
          FROM ads_daily WHERE profile_id = ? AND date BETWEEN ? AND ?
          GROUP BY ad_product, date ORDER BY date, ad_product`,
    args: [profileId, from, to],
  });
  const synced = await db.execute({
    sql: "SELECT ad_product, MIN(date) AS first, MAX(date) AS last, MAX(synced_at) AS synced_at FROM ads_synced_days WHERE profile_id = ? GROUP BY ad_product",
    args: [profileId],
  });
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
    synced: Object.fromEntries(synced.rows.map(r => [r.ad_product, { first: r.first, last: r.last, syncedAt: r.synced_at }])),
  };
}
