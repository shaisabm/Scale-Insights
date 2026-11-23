import { migrate } from "../db.js";
import { addDays, todayIn } from "../http.js";

// Sponsored Products per advertised ASIN (7-day attribution); Sponsored Brands and Sponsored
// Display per campaign (14-day). These match the Amazon Ads console's columns for each ad type.
// `historyDays` is how far back Amazon keeps each report type.
export const REPORTS = {
  SP: {
    historyDays: 90,
    adProduct: "SPONSORED_PRODUCTS",
    reportTypeId: "spAdvertisedProduct",
    groupBy: ["advertiser"],
    columns: ["date", "campaignId", "adGroupId", "advertisedAsin", "impressions", "clicks", "cost", "purchases7d", "unitsSoldClicks7d", "sales7d"],
    row: r => ({ campaignId: r.campaignId, adGroupId: r.adGroupId, asin: r.advertisedAsin, orders: r.purchases7d, units: r.unitsSoldClicks7d, sales: r.sales7d }),
  },
  SB: {
    historyDays: 60,
    adProduct: "SPONSORED_BRANDS",
    reportTypeId: "sbCampaigns",
    groupBy: ["campaign"],
    columns: ["date", "campaignId", "impressions", "clicks", "cost", "purchases", "unitsSold", "sales"],
    row: r => ({ campaignId: r.campaignId, orders: r.purchases, units: r.unitsSold, sales: r.sales }),
  },
  SD: {
    historyDays: 60,
    adProduct: "SPONSORED_DISPLAY",
    reportTypeId: "sdCampaigns",
    groupBy: ["campaign"],
    columns: ["date", "campaignId", "impressions", "clicks", "cost", "purchases", "unitsSold", "sales"],
    row: r => ({ campaignId: r.campaignId, orders: r.purchases, units: r.unitsSold, sales: r.sales }),
  },
  SP_SEARCH: {
    historyDays: 30,
    adProduct: "SPONSORED_PRODUCTS",
    reportTypeId: "spSearchTerm",
    groupBy: ["searchTerm"],
    columns: ["date", "campaignId", "adGroupId", "searchTerm", "impressions", "clicks", "cost", "purchases7d", "sales7d"],
    row: r => ({ campaignId: r.campaignId, adGroupId: r.adGroupId, term: r.searchTerm, orders: r.purchases7d, sales: r.sales7d }),
  },
  SB_SEARCH: {
    historyDays: 30,
    adProduct: "SPONSORED_BRANDS",
    reportTypeId: "sbSearchTerm",
    groupBy: ["searchTerm"],
    columns: ["date", "campaignId", "adGroupId", "searchTerm", "impressions", "clicks", "cost", "purchases", "sales"],
    row: r => ({ campaignId: r.campaignId, adGroupId: r.adGroupId, term: r.searchTerm, orders: r.purchases, sales: r.sales }),
  },
};

export const SEARCH_PRODUCTS = ["SP_SEARCH", "SB_SEARCH"];

/** Map Sponsored Brands ad groups to their advertised ASINs without changing any ads. */
export async function refreshSbProducts(db, ads, profileId) {
  const rows = [];
  let nextToken;
  do {
    const { status, data } = await ads.request("POST", "/sb/v4/ads/list", {
      profileId,
      body: { maxResults: 100, ...(nextToken ? { nextToken } : {}) },
      contentType: "application/vnd.sbadresource.v4+json",
      accept: "application/vnd.sbadresource.v4+json",
    });
    if (status !== 200) throw new Error(`Sponsored Brands ad list failed: HTTP ${status}`);
    for (const ad of data.ads || []) {
      for (const asin of ad.creative?.asins || []) rows.push({ campaignId: String(ad.campaignId), adGroupId: String(ad.adGroupId), asin: String(asin) });
    }
    nextToken = data.nextToken;
  } while (nextToken);
  await db.batch([
    { sql: "DELETE FROM ads_search_product_map WHERE profile_id = ? AND ad_product = 'SB_SEARCH'", args: [profileId] },
    ...rows.map(r => ({ sql: "INSERT OR IGNORE INTO ads_search_product_map (profile_id, ad_product, campaign_id, ad_group_id, asin) VALUES (?, 'SB_SEARCH', ?, ?, ?)", args: [profileId, r.campaignId, r.adGroupId, r.asin] })),
  ], "write");
  return rows.length;
}

const FRESH_DAYS = 14; // Attribution can still change numbers this recent, so refresh them daily.
const STALE_MS = 20 * 3600 * 1000;
const MAX_WINDOW = 31; // Longest date range a daily report may cover.
const GIVE_UP_MS = 24 * 3600 * 1000;
const POLL_MS = 10_000;

export function reportSpec(product, { start, end }) {
  const r = REPORTS[product];
  return {
    name: `scale-insights ${product} ${start}..${end}`,
    startDate: start,
    endDate: end,
    configuration: { adProduct: r.adProduct, groupBy: r.groupBy, columns: r.columns, reportTypeId: r.reportTypeId, timeUnit: "DAILY", format: "GZIP_JSON" },
  };
}

/**
 * Date windows to request, oldest first: days never stored, plus recent days last stored more
 * than STALE_MS ago. Consecutive days share a window of up to `maxWindow` days.
 * `synced` maps "YYYY-MM-DD" to the ISO time that day was stored.
 */
export function planWindows({ lastDate, synced, now, historyDays, freshDays = FRESH_DAYS, maxWindow = MAX_WINDOW }) {
  const windows = [];
  let current = null;
  for (let i = historyDays - 1; i >= 0; i--) {
    const date = addDays(lastDate, -i);
    const at = synced.get(date);
    const due = !at || (i < freshDays && now - Date.parse(at) > STALE_MS);
    if (!due) current = null;
    else if (current && current.days < maxWindow) Object.assign(current, { end: date, days: current.days + 1 });
    else windows.push((current = { start: date, end: date, days: 1 }));
  }
  return windows.map(({ start, end }) => ({ start, end }));
}

const num = v => Number(v) || 0;

/** Report rows -> one row per date/campaign/ad group/ASIN with summed metrics. */
export function normalizeRows(product, rows) {
  const pick = REPORTS[product].row;
  const out = new Map();
  for (const raw of rows || []) {
    const r = pick(raw);
    const search = SEARCH_PRODUCTS.includes(product);
    const row = { date: raw.date, campaignId: String(r.campaignId ?? ""), adGroupId: String(r.adGroupId ?? ""), ...(search ? { term: String(r.term ?? "") } : { asin: String(r.asin ?? "") }) };
    const key = [row.date, row.campaignId, row.adGroupId, search ? row.term : row.asin].join("|");
    const acc = out.get(key) || { ...row, impressions: 0, clicks: 0, cost: 0, orders: 0, units: 0, sales: 0 };
    acc.impressions += num(raw.impressions);
    acc.clicks += num(raw.clicks);
    acc.cost += num(raw.cost);
    acc.orders += num(r.orders);
    acc.units += num(r.units);
    acc.sales += num(r.sales);
    out.set(key, acc);
  }
  return [...out.values()];
}

/**
 * Requests one window's report. When Amazon answers that the report type doesn't go back that
 * far, the window starts at the earliest date Amazon gives instead, or is skipped (null).
 */
async function requestReport(ads, profileId, product, w) {
  try {
    return { ...w, reportId: await ads.createReport(profileId, reportSpec(product, w)) };
  } catch (err) {
    const retention = /retention start date \((\d{4}-\d{2}-\d{2})\)/.exec(err.message);
    if (!retention) throw err;
    if (retention[1] > w.end) return null;
    const clamped = { start: retention[1], end: w.end };
    return { ...clamped, reportId: await ads.createReport(profileId, reportSpec(product, clamped)) };
  }
}

/** Replaces one window's rows and marks its days as stored, in one transaction. */
export async function storeWindow(db, { profileId, product, start, end, rows, syncedAt }) {
  const search = SEARCH_PRODUCTS.includes(product);
  const table = search ? "ads_search_terms_daily" : "ads_daily";
  const stmts = [{ sql: `DELETE FROM ${table} WHERE profile_id = ? AND ad_product = ? AND date BETWEEN ? AND ?`, args: [profileId, product, start, end] }];
  for (const r of rows) {
    if (r.date < start || r.date > end) continue;
    stmts.push(search ? {
      sql: "INSERT INTO ads_search_terms_daily (profile_id, ad_product, date, campaign_id, ad_group_id, search_term, impressions, clicks, cost, orders, sales) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [profileId, product, r.date, r.campaignId, r.adGroupId, r.term, r.impressions, r.clicks, r.cost, r.orders, r.sales],
    } : {
      sql: "INSERT INTO ads_daily (profile_id, ad_product, date, campaign_id, ad_group_id, asin, impressions, clicks, cost, orders, units, sales) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [profileId, product, r.date, r.campaignId, r.adGroupId, r.asin, r.impressions, r.clicks, r.cost, r.orders, r.units, r.sales],
    });
  }
  for (let d = start; d <= end; d = addDays(d, 1)) {
    stmts.push({ sql: "INSERT OR REPLACE INTO ads_synced_days (profile_id, ad_product, date, synced_at) VALUES (?, ?, ?, ?)", args: [profileId, product, d, syncedAt] });
  }
  await db.batch(stmts, "write");
}

/**
 * One sync run: store reports requested earlier, request missing or stale windows, then wait
 * for them while `budgetMs` allows. Unfinished reports are picked up by the next run.
 */
export async function syncAds({ db, ads, profileId, timeZone = "America/Los_Angeles", products = ["SP", "SB", "SD", ...SEARCH_PRODUCTS], budgetMs = 45_000, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  await migrate(db);
  const started = now();
  const iso = () => new Date(now()).toISOString();
  const summary = { requested: 0, stored: 0, failed: 0, pending: 0, rows: 0, errors: [] };

  if (products.includes("SB_SEARCH") && typeof ads.request === "function") {
    try { await refreshSbProducts(db, ads, profileId); }
    catch (err) { summary.errors.push(`SB product map: ${err.message}`); }
  }

  const pendingRequests = async () =>
    (await db.execute({ sql: "SELECT * FROM ads_report_requests WHERE profile_id = ? AND status IN ('PENDING', 'PROCESSING') ORDER BY requested_at", args: [profileId] })).rows;
  const setStatus = (id, status, error = null) =>
    db.execute({ sql: "UPDATE ads_report_requests SET status = ?, updated_at = ?, error = ? WHERE report_id = ?", args: [status, iso(), error, id] });

  async function collect() {
    for (const req of await pendingRequests()) {
      const expired = now() - Date.parse(req.requested_at) > GIVE_UP_MS;
      try {
        const report = await ads.getReport(profileId, req.report_id);
        if (report.status === "COMPLETED" && report.url) {
          const rows = normalizeRows(req.ad_product, await ads.downloadReport(report.url));
          await storeWindow(db, { profileId, product: req.ad_product, start: req.start_date, end: req.end_date, rows, syncedAt: iso() });
          await setStatus(req.report_id, "STORED");
          summary.stored++;
          summary.rows += rows.length;
        } else if (report.status === "FAILED" || expired) {
          await setStatus(req.report_id, "FAILED", report.failureReason || "Not ready after 24 hours");
          summary.failed++;
        } else {
          await setStatus(req.report_id, report.status || req.status);
        }
      } catch (err) {
        // A failed status check or download doesn't stop the other reports. The request stays
        // pending for the next run, unless it's too old to finish.
        const message = `${req.ad_product}: ${err.message}`;
        if (!summary.errors.includes(message)) summary.errors.push(message);
        if (expired) {
          await setStatus(req.report_id, "FAILED", err.message);
          summary.failed++;
        }
      }
    }
  }

  await collect();

  const lastDate = addDays(todayIn(timeZone, now()), -1);
  const pending = await pendingRequests();
  for (const product of products) {
    const stored = await db.execute({ sql: "SELECT date, synced_at FROM ads_synced_days WHERE profile_id = ? AND ad_product = ?", args: [profileId, product] });
    const synced = new Map(stored.rows.map(r => [r.date, r.synced_at]));
    try {
      let accepted = false;
      for (const w of planWindows({ lastDate, synced, now: now(), historyDays: REPORTS[product].historyDays })) {
        if (pending.some(p => p.ad_product === product && p.start_date <= w.end && p.end_date >= w.start)) continue;
        const req = await requestReport(ads, profileId, product, w);
        if (!req) continue;
        if (!accepted) {
          accepted = true;
          await db.execute({ sql: "DELETE FROM ads_unsupported WHERE profile_id = ? AND ad_product = ?", args: [profileId, product] });
        }
        await db.execute({
          sql: "INSERT OR REPLACE INTO ads_report_requests (report_id, profile_id, ad_product, start_date, end_date, status, requested_at, updated_at) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)",
          args: [req.reportId, profileId, product, req.start, req.end, iso(), iso()],
        });
        summary.requested++;
      }
    } catch (err) {
      // One ad product failing (say, an account with no Sponsored Brands) shouldn't stop the others.
      // Amazon refusing access (401/403) means the account doesn't have this ad type: remember it,
      // so combined totals leave it out rather than wait for it.
      if (/^Report request failed: HTTP 40[13]\b/.test(err.message)) {
        await db.execute({
          sql: "INSERT OR REPLACE INTO ads_unsupported (profile_id, ad_product, reason, checked_at) VALUES (?, ?, ?, ?)",
          args: [profileId, product, err.message, iso()],
        });
      }
      summary.errors.push(`${product}: ${err.message}`);
    }
  }

  while ((await pendingRequests()).length && now() - started + POLL_MS < budgetMs) {
    await sleep(POLL_MS);
    await collect();
  }
  summary.pending = (await pendingRequests()).length;
  return summary;
}
