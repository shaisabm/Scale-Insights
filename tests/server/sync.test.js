import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { normalizeRows, planWindows, reportSpec, storeWindow, syncAds } from "../../server/ads/sync.js";
import { migrate } from "../../server/db.js";
import { addDays } from "../../server/http.js";

const PROFILE = "111";
const LAST = "2026-11-21"; // yesterday in Los Angeles at NOW
const NOW = Date.UTC(2026, 10, 22, 15); // 07:00 in Los Angeles
const HOUR = 3_600_000;

const datesBetween = (start, end) => {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
};

// A fake Amazon Ads client: every report has one row per day, and reports finish with `status`.
function fakeAds({ status = "COMPLETED", sales = 20 } = {}) {
  const specs = new Map();
  return {
    created: [],
    async createReport(profileId, spec) {
      const id = `report-${specs.size + 1}`;
      specs.set(id, spec);
      this.created.push(spec);
      return id;
    },
    async getReport(profileId, id) {
      return { status: typeof status === "function" ? status(id) : status, url: `https://s3.test/${id}`, failureReason: "Amazon said no" };
    },
    async downloadReport(url) {
      const spec = specs.get(url.split("/").pop());
      const sp = spec.configuration.reportTypeId === "spAdvertisedProduct";
      return datesBetween(spec.startDate, spec.endDate).map(date =>
        sp
          ? { date, campaignId: 1, adGroupId: 2, advertisedAsin: "B0TESTASIN", impressions: 100, clicks: 5, cost: 2.5, purchases7d: 1, unitsSoldClicks7d: 2, sales7d: sales }
          : { date, campaignId: 7, impressions: 50, clicks: 2, cost: 1, purchases: 0, unitsSold: 0, sales: 0 },
      );
    },
  };
}

function clock(start = NOW) {
  let t = start;
  return { now: () => t, sleep: async ms => { t += ms; }, advance: ms => { t += ms; } };
}

const count = async (db, sql, args = []) => Number((await db.execute({ sql, args })).rows[0].n);

describe("planWindows", () => {
  it("covers every missing day in windows of at most 31 days", () => {
    expect(planWindows({ lastDate: LAST, synced: new Map(), now: NOW, historyDays: 90 })).toEqual([
      { start: addDays(LAST, -89), end: addDays(LAST, -59) },
      { start: addDays(LAST, -58), end: addDays(LAST, -28) },
      { start: addDays(LAST, -27), end: LAST },
    ]);
    expect(planWindows({ lastDate: LAST, synced: new Map(), now: NOW, historyDays: 60 })).toEqual([
      { start: addDays(LAST, -59), end: addDays(LAST, -29) },
      { start: addDays(LAST, -28), end: LAST },
    ]);
  });

  it("asks for nothing when every day is stored and fresh", () => {
    const synced = new Map(datesBetween(addDays(LAST, -89), LAST).map(d => [d, new Date(NOW - HOUR).toISOString()]));
    expect(planWindows({ lastDate: LAST, synced, now: NOW, historyDays: 90 })).toEqual([]);
  });

  it("refreshes only the last 14 days once they are a day old", () => {
    const synced = new Map(datesBetween(addDays(LAST, -89), LAST).map(d => [d, new Date(NOW - 2 * 24 * HOUR).toISOString()]));
    expect(planWindows({ lastDate: LAST, synced, now: NOW, historyDays: 90 })).toEqual([{ start: addDays(LAST, -13), end: LAST }]);
  });

  it("fills a gap on its own", () => {
    const fresh = new Date(NOW).toISOString();
    const synced = new Map(datesBetween(addDays(LAST, -89), LAST).map(d => [d, fresh]));
    synced.delete(addDays(LAST, -50));
    synced.delete(addDays(LAST, -49));
    expect(planWindows({ lastDate: LAST, synced, now: NOW, historyDays: 90 })).toEqual([{ start: addDays(LAST, -50), end: addDays(LAST, -49) }]);
  });
});

describe("reportSpec and normalizeRows", () => {
  it("builds a daily GZIP_JSON report request", () => {
    const spec = reportSpec("SP", { start: "2026-11-01", end: "2026-11-21" });
    expect(spec).toMatchObject({ startDate: "2026-11-01", endDate: "2026-11-21", configuration: { adProduct: "SPONSORED_PRODUCTS", reportTypeId: "spAdvertisedProduct", timeUnit: "DAILY", format: "GZIP_JSON" } });
    expect(reportSpec("SB", { start: "2026-11-01", end: "2026-11-02" }).configuration.reportTypeId).toBe("sbCampaigns");
    expect(reportSpec("SD", { start: "2026-11-01", end: "2026-11-02" }).configuration).toMatchObject({ adProduct: "SPONSORED_DISPLAY", reportTypeId: "sdCampaigns", groupBy: ["campaign"] });
  });

  it("maps Sponsored Products columns and sums duplicate keys", () => {
    const raw = { date: "2026-11-01", campaignId: 1, adGroupId: 2, advertisedAsin: "B0A", impressions: "10", clicks: 2, cost: 1.25, purchases7d: 1, unitsSoldClicks7d: 3, sales7d: 30 };
    expect(normalizeRows("SP", [raw, raw])).toEqual([
      { date: "2026-11-01", campaignId: "1", adGroupId: "2", asin: "B0A", impressions: 20, clicks: 4, cost: 2.5, orders: 2, units: 6, sales: 60 },
    ]);
  });

  it("maps Sponsored Display columns like Sponsored Brands", () => {
    expect(normalizeRows("SD", [{ date: "2026-11-01", campaignId: 9, impressions: 40, clicks: 3, cost: 1.2, purchases: 2, unitsSold: 2, sales: 30 }])).toEqual([
      { date: "2026-11-01", campaignId: "9", adGroupId: "", asin: "", impressions: 40, clicks: 3, cost: 1.2, orders: 2, units: 2, sales: 30 },
    ]);
  });

  it("maps Sponsored Brands columns with no ad group or ASIN", () => {
    expect(normalizeRows("SB", [{ date: "2026-11-01", campaignId: 7, impressions: 5, clicks: 1, cost: 0.5, purchases: 1, unitsSold: 1, sales: 12, extra: "ignored" }])).toEqual([
      { date: "2026-11-01", campaignId: "7", adGroupId: "", asin: "", impressions: 5, clicks: 1, cost: 0.5, orders: 1, units: 1, sales: 12 },
    ]);
  });
});

describe("storeWindow", () => {
  it("replaces a window's rows instead of adding to them", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const row = { date: "2026-11-01", campaignId: "1", adGroupId: "2", asin: "B0A", impressions: 1, clicks: 1, cost: 1, orders: 1, units: 1, sales: 10 };
    await storeWindow(db, { profileId: PROFILE, product: "SP", start: "2026-11-01", end: "2026-11-02", rows: [row], syncedAt: "t1" });
    await storeWindow(db, { profileId: PROFILE, product: "SP", start: "2026-11-01", end: "2026-11-02", rows: [{ ...row, sales: 15 }, { ...row, date: "2026-12-30" }], syncedAt: "t2" });
    const { rows } = await db.execute("SELECT date, sales FROM ads_daily");
    expect(rows.map(r => [r.date, r.sales])).toEqual([["2026-11-01", 15]]);
    expect(await count(db, "SELECT COUNT(*) AS n FROM ads_synced_days WHERE synced_at = 't2'")).toBe(2);
  });
});

describe("syncAds", () => {
  it("requests 90 days of Sponsored Products and 60 of Sponsored Brands and Display, and stores them once Amazon finishes", async () => {
    const db = createClient({ url: ":memory:" });
    const ads = fakeAds();
    const c = clock();
    const summary = await syncAds({ db, ads, profileId: PROFILE, now: c.now, sleep: c.sleep });
    expect(summary).toEqual({ requested: 7, stored: 7, failed: 0, pending: 0, rows: 210, errors: [] });
    expect(ads.created.map(s => s.configuration.reportTypeId)).toEqual(["spAdvertisedProduct", "spAdvertisedProduct", "spAdvertisedProduct", "sbCampaigns", "sbCampaigns", "sdCampaigns", "sdCampaigns"]);
    expect(await count(db, "SELECT COUNT(*) AS n FROM ads_daily WHERE ad_product = 'SP'")).toBe(90);
    expect(await count(db, "SELECT COUNT(*) AS n FROM ads_synced_days")).toBe(210);
    expect(await count(db, "SELECT COUNT(*) AS n FROM ads_daily WHERE date > ?", [LAST])).toBe(0);
  });

  it("starts at the earliest date Amazon keeps when a window reaches back further", async () => {
    const db = createClient({ url: ":memory:" });
    const ads = fakeAds();
    const earliest = addDays(LAST, -40);
    const create = ads.createReport.bind(ads);
    ads.createReport = async (profileId, spec) => {
      if (spec.startDate < earliest) throw new Error(`Report request failed: HTTP 400 {"detail":"startDate (${spec.startDate}) must be equal to or after report type data retention start date (${earliest})"}`);
      return create(profileId, spec);
    };
    const c = clock();
    const summary = await syncAds({ db, ads, profileId: PROFILE, products: ["SP"], now: c.now, sleep: c.sleep });
    expect(summary).toMatchObject({ requested: 2, stored: 2, errors: [] });
    expect(ads.created.map(s => [s.startDate, s.endDate])).toEqual([[earliest, addDays(LAST, -28)], [addDays(LAST, -27), LAST]]);
    expect(await count(db, "SELECT COUNT(*) AS n FROM ads_daily WHERE date < ?", [earliest])).toBe(0);
  });

  it("keeps syncing the other ad products when one fails", async () => {
    const db = createClient({ url: ":memory:" });
    const ads = fakeAds();
    const create = ads.createReport.bind(ads);
    ads.createReport = async (profileId, spec) => {
      if (spec.configuration.reportTypeId === "sbCampaigns") throw new Error("Report request failed: HTTP 401 not authorized for Sponsored Brands");
      return create(profileId, spec);
    };
    const c = clock();
    const summary = await syncAds({ db, ads, profileId: PROFILE, now: c.now, sleep: c.sleep });
    expect(summary).toEqual({ requested: 5, stored: 5, failed: 0, pending: 0, rows: 150, errors: ["SB: Report request failed: HTTP 401 not authorized for Sponsored Brands"] });
  });

  it("requests nothing new on a run soon after", async () => {
    const db = createClient({ url: ":memory:" });
    const c = clock();
    await syncAds({ db, ads: fakeAds(), profileId: PROFILE, now: c.now, sleep: c.sleep });
    c.advance(HOUR);
    const again = fakeAds();
    expect(await syncAds({ db, ads: again, profileId: PROFILE, now: c.now, sleep: c.sleep })).toMatchObject({ requested: 0, stored: 0 });
    expect(again.created).toEqual([]);
  });

  it("leaves unfinished reports for the next run, which stores them without asking again", async () => {
    const db = createClient({ url: ":memory:" });
    const c = clock();
    const slow = fakeAds({ status: "PROCESSING" });
    expect(await syncAds({ db, ads: slow, profileId: PROFILE, now: c.now, sleep: c.sleep, budgetMs: 30_000 })).toEqual({ requested: 7, stored: 0, failed: 0, pending: 7, rows: 0, errors: [] });
    slow.getReport = async (profileId, id) => ({ status: "COMPLETED", url: `https://s3.test/${id}` });
    c.advance(HOUR);
    expect(await syncAds({ db, ads: slow, profileId: PROFILE, now: c.now, sleep: c.sleep })).toEqual({ requested: 0, stored: 7, failed: 0, pending: 0, rows: 210, errors: [] });
  });

  it("marks failed reports and asks for those days again next time", async () => {
    const db = createClient({ url: ":memory:" });
    const c = clock();
    const failing = fakeAds({ status: id => (id === "report-1" ? "FAILED" : "COMPLETED") });
    expect(await syncAds({ db, ads: failing, profileId: PROFILE, now: c.now, sleep: c.sleep })).toMatchObject({ requested: 7, stored: 6, failed: 1 });
    const { rows } = await db.execute("SELECT error FROM ads_report_requests WHERE report_id = 'report-1'");
    expect(rows[0].error).toBe("Amazon said no");
    c.advance(HOUR);
    const retry = fakeAds();
    await syncAds({ db, ads: retry, profileId: PROFILE, now: c.now, sleep: c.sleep });
    expect(retry.created.map(s => [s.configuration.reportTypeId, s.startDate])).toEqual([["spAdvertisedProduct", addDays(LAST, -89)]]);
  });
});
