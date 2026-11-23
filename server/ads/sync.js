import { randomUUID } from "node:crypto";
import { migrate } from "../db.js";
import { addDays, todayIn } from "../http.js";
import { refreshProducts } from "./products.js";

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
    historyDays: 90,
    adProduct: "SPONSORED_PRODUCTS",
    reportTypeId: "spSearchTerm",
    groupBy: ["searchTerm"],
    columns: ["date", "campaignId", "adGroupId", "searchTerm", "impressions", "clicks", "cost", "purchases7d", "unitsSoldClicks7d", "sales7d"],
    row: r => ({ campaignId: r.campaignId, adGroupId: r.adGroupId, term: r.searchTerm, orders: r.purchases7d, units: r.unitsSoldClicks7d, sales: r.sales7d }),
  },
  SB_SEARCH: {
    historyDays: 60,
    adProduct: "SPONSORED_BRANDS",
    reportTypeId: "sbSearchTerm",
    groupBy: ["searchTerm"],
    columns: ["date", "campaignId", "adGroupId", "searchTerm", "impressions", "clicks", "cost", "purchases", "unitsSold", "sales"],
    row: r => ({ campaignId: r.campaignId, adGroupId: r.adGroupId, term: r.searchTerm, orders: r.purchases, units: r.unitsSold, sales: r.sales }),
  },
};

export const SEARCH_PRODUCTS = ["SP_SEARCH", "SB_SEARCH"];

const SB_ADS = "application/vnd.sbadresource.v4+json";
const LEASE_MS = 2 * 60_000; // How long a sync may go without saving a page before another may take over.

/**
 * Lists Sponsored Brands ads, without changing any, to record which ASINs each ad group advertised
 * on which dates (ads_search_product_history). Each page is saved as it arrives, so a list still
 * going at `deadline` stops (returning false) and the next call carries on from there. Returns
 * true once the whole list has been read and the history updated, and false when it stopped
 * before that, or another sync is listing the profile's ads.
 */
export async function refreshSbProducts(db, ads, profileId, { timeZone = "America/Los_Angeles", now = Date.now, deadline = Infinity } = {}) {
  // One list per profile at a time. A call takes the lease, renews it with each write and gives it
  // up when it stops. Every write checks the lease in the same batch, so a call that lost it (it
  // stalled past lease_until, say, and another took over) changes nothing, and two syncs can't mix
  // their pages.
  const owner = randomUUID();
  const owns = "EXISTS (SELECT 1 FROM ads_product_map_status WHERE profile_id = ? AND ad_product = 'SB_SEARCH' AND lease_owner = ?)";
  const renew = () => ({ sql: "UPDATE ads_product_map_status SET lease_until = ? WHERE profile_id = ? AND ad_product = 'SB_SEARCH' AND lease_owner = ?", args: [now() + LEASE_MS, profileId, owner] });
  const [, claim, status] = await db.batch([
    { sql: "INSERT INTO ads_product_map_status (profile_id, ad_product) VALUES (?, 'SB_SEARCH') ON CONFLICT (profile_id, ad_product) DO NOTHING", args: [profileId] },
    { sql: "UPDATE ads_product_map_status SET lease_owner = ?, lease_until = ? WHERE profile_id = ? AND ad_product = 'SB_SEARCH' AND (lease_owner IS NULL OR lease_until <= ?)", args: [owner, now() + LEASE_MS, profileId, now()] },
    { sql: "SELECT next_token, scan_started_at FROM ads_product_map_status WHERE profile_id = ? AND ad_product = 'SB_SEARCH'", args: [profileId] },
  ], "write");
  if (!claim.rowsAffected) return false;
  try {
    return await listAndRecord(status.rows[0]);
  } finally {
    // If giving the lease up fails, it runs out at lease_until instead.
    await db.execute({ sql: "UPDATE ads_product_map_status SET lease_owner = NULL, lease_until = NULL WHERE profile_id = ? AND ad_product = 'SB_SEARCH' AND lease_owner = ?", args: [profileId, owner] }).catch(() => {});
  }

  async function listAndRecord(saved) {
    // A list under way has scan_started_at. With a next_token it carries on from that page; without
    // one every page was read and saved, and only recording them is left.
    let nextToken = saved?.next_token || null;
    const startedAt = saved?.scan_started_at || new Date(now()).toISOString();
    if (!saved?.scan_started_at) await db.execute({ sql: `DELETE FROM ads_sb_ads_scan WHERE profile_id = ? AND ${owns}`, args: [profileId, profileId, owner] });
    if (!saved?.scan_started_at || nextToken) do {
      const left = deadline - now();
      if (left <= 0) return false;
      // A page still loading at the deadline is dropped; the next call asks for it again.
      const signal = Number.isFinite(left) ? AbortSignal.timeout(Math.ceil(left)) : undefined;
      let res;
      try {
        res = await ads.request("POST", "/sb/v4/ads/list", {
          profileId,
          // Archived ads too: archiving one changes what its ad group advertises.
          body: { maxResults: 100, stateFilter: { include: ["ENABLED", "PAUSED", "ARCHIVED"] }, ...(nextToken ? { nextToken } : {}) },
          contentType: SB_ADS,
          accept: SB_ADS,
          signal,
        });
      } catch (err) {
        if (signal?.aborted) return false;
        throw err;
      }
      const { status, data } = res;
      if (status !== 200) {
        // Only the token changes between pages, so HTTP 400 means Amazon refused it (it expired, say)
        // and the next call starts the list over. Other failures keep it, to carry on from.
        if (status === 400 && nextToken) await db.execute({ sql: "UPDATE ads_product_map_status SET next_token = NULL, scan_started_at = NULL WHERE profile_id = ? AND ad_product = 'SB_SEARCH' AND lease_owner = ?", args: [profileId, owner] });
        throw new Error(`Sponsored Brands ad list failed: HTTP ${status}`);
      }
      nextToken = data.nextToken || null;
      const [kept] = await db.batch([
        renew(),
        ...(data.ads || []).map(ad => ({
          sql: `INSERT OR REPLACE INTO ads_sb_ads_scan (profile_id, ad_id, campaign_id, ad_group_id, state, asins, created_ms, updated_ms) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${owns}`,
          args: [profileId, String(ad.adId), String(ad.campaignId), String(ad.adGroupId), String(ad.state || ""), (ad.creative?.asins || []).map(String).join(","), ad.extendedData?.creationDate ?? null, ad.extendedData?.lastUpdateDate ?? null, profileId, owner],
        })),
        { sql: "UPDATE ads_product_map_status SET next_token = ?, scan_started_at = ? WHERE profile_id = ? AND ad_product = 'SB_SEARCH' AND lease_owner = ?", args: [nextToken, startedAt, profileId, owner] },
      ], "write");
      if (!kept.rowsAffected) return false;
    } while (nextToken);

    const startedMs = Date.parse(startedAt), dayOf = ms => todayIn(timeZone, ms);
    // Ads can still change later on the day the list began, so it confirms them through the day before.
    const through = addDays(dayOf(startedMs), -1);
    const [listed, known] = await db.batch([
      { sql: "SELECT * FROM ads_sb_ads_scan WHERE profile_id = ?", args: [profileId] },
      { sql: "SELECT * FROM ads_search_product_history WHERE profile_id = ? AND ad_product = 'SB_SEARCH' ORDER BY valid_to", args: [profileId] },
    ], "read");
    const latest = new Map(known.rows.map(r => [`${r.campaign_id}|${r.ad_group_id}`, r]));
    const groups = new Map();
    for (const ad of listed.rows) {
      const key = `${ad.campaign_id}|${ad.ad_group_id}`;
      const g = groups.get(key) || { campaignId: ad.campaign_id, adGroupId: ad.ad_group_id, asins: new Set(), changed: 0, created: Infinity };
      // Only enabled ads serve, but any ad's change can change what the group advertises. An ad
      // without dates counts as changed when the list began, and an enabled one listing no ASINs
      // leaves the group's products unknown.
      if (ad.state === "ENABLED") {
        const asins = String(ad.asins).split(",").filter(Boolean);
        if (!asins.length) g.unknown = true;
        for (const asin of asins) g.asins.add(asin);
      }
      g.changed = Math.max(g.changed, Number(ad.updated_ms) || startedMs);
      g.created = Math.min(g.created, Number(ad.created_ms) || startedMs);
      groups.set(key, g);
    }
    const stmts = [];
    for (const [key, g] of groups) {
      if (g.unknown || !g.asins.size) continue;
      const asins = [...g.asins].sort().join(","), prev = latest.get(key);
      if (prev && prev.asins === asins && g.changed < Date.parse(prev.observed_at)) {
        // Unchanged since the list that last confirmed it.
        stmts.push({ sql: `UPDATE ads_search_product_history SET valid_to = ?, observed_at = ? WHERE profile_id = ? AND ad_product = 'SB_SEARCH' AND campaign_id = ? AND ad_group_id = ? AND valid_from = ? AND ${owns}`, args: [through, startedAt, profileId, g.campaignId, g.adGroupId, prev.valid_from, profileId, owner] });
        continue;
      }
      // The day of a change may mix products, unless it's the day the group's ads were all made.
      const changedOn = dayOf(g.changed);
      let start = changedOn === dayOf(g.created) ? changedOn : addDays(changedOn, 1);
      if (prev && start <= prev.valid_to) start = addDays(prev.valid_to, 1);
      if (start > through) continue;
      stmts.push({ sql: `INSERT OR REPLACE INTO ads_search_product_history (profile_id, ad_product, campaign_id, ad_group_id, asins, valid_from, valid_to, observed_at) SELECT ?, 'SB_SEARCH', ?, ?, ?, ?, ?, ? WHERE ${owns}`, args: [profileId, g.campaignId, g.adGroupId, asins, start, through, startedAt, profileId, owner] });
    }
    // The status update comes last: it gives up the lease, which the statements before it check.
    const [kept] = await db.batch([
      renew(),
      ...stmts,
      { sql: `DELETE FROM ads_sb_ads_scan WHERE profile_id = ? AND ${owns}`, args: [profileId, profileId, owner] },
      { sql: "UPDATE ads_product_map_status SET ready_at = ?, ready_through = ?, error = NULL, next_token = NULL, scan_started_at = NULL, lease_owner = NULL, lease_until = NULL WHERE profile_id = ? AND ad_product = 'SB_SEARCH' AND lease_owner = ?", args: [new Date(now()).toISOString(), through, profileId, owner] },
    ], "write");
    return kept.rowsAffected > 0;
  }
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
      sql: "INSERT INTO ads_search_terms_daily (profile_id, ad_product, date, campaign_id, ad_group_id, search_term, impressions, clicks, cost, orders, units, sales) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [profileId, product, r.date, r.campaignId, r.adGroupId, r.term, r.impressions, r.clicks, r.cost, r.orders, r.units, r.sales],
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
export async function syncAds({ db, ads, profileId, timeZone = "America/Los_Angeles", products = ["SP", "SB", "SD"], budgetMs = 45_000, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  await migrate(db);
  const started = now();
  const iso = () => new Date(now()).toISOString();
  const summary = { requested: 0, stored: 0, failed: 0, pending: 0, rows: 0, errors: [] };

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

  // Once reports are collected and requested, listing Sponsored Brands ads may use up to half the
  // budget; a longer list carries on in the next run.
  if (products.includes("SB_SEARCH") && typeof ads.request === "function") {
    try { await refreshSbProducts(db, ads, profileId, { timeZone, now, deadline: started + budgetMs / 2 }); }
    catch (err) {
      summary.errors.push(`SB product map: ${err.message}`);
      // Record why, but keep ready_at (and the history) from the last refresh that worked.
      await db.execute({
        sql: "INSERT INTO ads_product_map_status (profile_id, ad_product, ready_at, error) VALUES (?, 'SB_SEARCH', NULL, ?) ON CONFLICT (profile_id, ad_product) DO UPDATE SET error = excluded.error",
        args: [profileId, err.message],
      });
    }
  }

  while ((await pendingRequests()).length && now() - started + POLL_MS < budgetMs) {
    await sleep(POLL_MS);
    await collect();
  }
  summary.pending = (await pendingRequests()).length;

  // The search term insight shows each product's title and image.
  if (products.some(p => SEARCH_PRODUCTS.includes(p)) && typeof ads.request === "function") {
    try { await refreshProducts(db, ads, profileId, iso()); }
    catch (err) { summary.errors.push(`Product details: ${err.message}`); }
  }
  return summary;
}
