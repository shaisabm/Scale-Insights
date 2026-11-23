// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { openApp, stubFetch, stubNavigation } from "./load-app.js";

const day = (adProduct, date, n = 1) => ({ adProduct, date, impressions: 1000 * n, clicks: 20 * n, cost: 10 * n, orders: 2 * n, units: 3 * n, sales: 40 * n });

// Every day of the default 8 x 7-day view (it ends on SP.lastDate, two days ago).
function lastDays(SP, count) {
  return Array.from({ length: count }, (_, i) => SP.iso(SP.addDays(SP.lastDate, -i)));
}

// Synced range ending on SP.lastDate and going `back` days, as /api/ads/trend reports it.
const covered = (SP, back = 89) => ({ first: SP.iso(SP.addDays(SP.lastDate, -back)), last: SP.iso(SP.lastDate), syncedAt: "2026-11-22T14:00:00.000Z", ranges: [[SP.iso(SP.addDays(SP.lastDate, -back)), SP.iso(SP.lastDate)]] });
// Synced ranges given as [daysBack, daysBack] pairs relative to SP.lastDate.
const coveredRanges = (SP, pairs) => ({ ...covered(SP), ranges: pairs.map(([from, to]) => [SP.iso(SP.addDays(SP.lastDate, -from)), SP.iso(SP.addDays(SP.lastDate, -to))]) });

async function openTrend(days, { cover = SP => ({ SP: covered(SP), SB: covered(SP), SD: covered(SP) }), adTypes, sync = { requested: 1, stored: 1, failed: 0, pending: 0, rows: 5, errors: [] } } = {}) {
  stubNavigation();
  const fetch = stubFetch({
    "GET /api/ads/trend": () => {
      const SP = window.SP;
      return { from: SP.iso(SP.addDays(SP.lastDate, -119)), to: SP.iso(SP.lastDate), days: days(SP), synced: cover(SP), ...(adTypes ? { adTypes } : {}) };
    },
    "POST /api/sync/ads": sync,
  });
  openApp("/Ads/AdvertisingTrend");
  await vi.waitFor(() => expect(document.querySelector("#adt")).not.toBeNull());
  return fetch;
}

const rowValues = (table, metric) => [...table.querySelectorAll(`tr[data-metric="${metric}"] td`)].map(td => td.textContent.trim());

describe("SP.adTotals", () => {
  it("sums one ad product between two dates and works out the ratios", () => {
    stubFetch({});
    const SP = openApp("/");
    const days = [day("SP", "2026-11-01"), day("SP", "2026-11-02", 2), day("SB", "2026-11-01", 5), day("SP", "2026-11-03", 9)];
    expect(SP.adTotals(days, "SP", "2026-11-01", "2026-11-02")).toEqual({
      ppcSales: 120, ppcCost: 30, ppcOrders: 6, ppcUnits: 9, impressions: 3000, clicks: 60,
      acos: 25, ppcConversion: 10, cpc: 0.5, ctr: 2, costPerOrder: 5, asp: 120 / 9,
    });
  });

  it("adds up every ad type for ALL", () => {
    stubFetch({});
    const SP = openApp("/");
    const days = [day("SP", "2026-11-01"), day("SB", "2026-11-01", 2), day("SD", "2026-11-02", 3), day("SP", "2026-11-03", 9)];
    expect(SP.adTotals(days, "ALL", "2026-11-01", "2026-11-02")).toMatchObject({ ppcSales: 240, ppcCost: 60, impressions: 6000, clicks: 120, acos: 25 });
  });

  it("returns zeros, not NaN, when there is no data", () => {
    stubFetch({});
    const SP = openApp("/");
    const t = SP.adTotals([], "SP", "2026-11-01", "2026-11-02");
    expect(Object.values(t).every(v => v === 0)).toBe(true);
  });
});

describe("Advertising trend page", () => {
  it("draws all campaign types first, then each ad type, from the API data", async () => {
    await openTrend(SP => [...lastDays(SP, 56).map(d => day("SP", d)), day("SB", SP.iso(SP.lastDate), 2)]);
    const [all, sp, sb] = document.querySelectorAll("table.trend");
    expect([...document.querySelectorAll("#adt h4")].map(h => h.textContent)).toEqual([
      "Advertising trend for all campaign types",
      "Advertising trend for Sponsored Products",
      "Advertising trend for Sponsored Brands",
    ]);
    // Summary, then 8 weekly columns of 7 days each.
    expect(rowValues(sp, "ppcSales")).toEqual(["$2,240.00", ...Array(8).fill("$280.00")]);
    expect(rowValues(sp, "acos")).toEqual(Array(9).fill("25.00%"));
    expect(rowValues(sb, "ppcSales")).toEqual(["$80.00", ...Array(7).fill("$0.00"), "$80.00"]);
    expect(rowValues(all, "ppcSales")).toEqual(["$2,320.00", ...Array(7).fill("$280.00"), "$360.00"]);
    expect(rowValues(all, "ppcCost")).toEqual(["$580.00", ...Array(7).fill("$70.00"), "$90.00"]);
    expect(document.querySelector(".meta").textContent).toContain("last synced");
  });

  it("adds a Sponsored Display table only when there is Sponsored Display data", async () => {
    await openTrend(SP => [day("SP", SP.iso(SP.lastDate)), day("SD", SP.iso(SP.lastDate), 3)]);
    const headings = [...document.querySelectorAll("#adt h4")].map(h => h.textContent);
    expect(headings).toEqual(["Advertising trend for all campaign types", "Advertising trend for Sponsored Products", "Advertising trend for Sponsored Display"]);
    expect(rowValues(document.querySelector("table.trend"), "impressions")[0]).toBe("4,000");
  });

  it("leaves out profit rows, which need product costs", async () => {
    await openTrend(SP => [day("SP", SP.iso(SP.lastDate))]);
    const metrics = [...document.querySelectorAll("table.trend tr[data-metric]")].map(tr => tr.dataset.metric);
    expect(metrics).not.toContain("profits");
    expect(metrics).not.toContain("margin");
    expect(metrics).toContain("ppcCost");
  });

  it("regroups the columns when the filter changes", async () => {
    await openTrend(SP => lastDays(SP, 56).map(d => day("SP", d)));
    document.querySelector("[data-k=cols]").value = "2";
    document.querySelector("[data-k=days]").value = "14";
    document.querySelector("[data-apply]").click();
    expect(rowValues(document.querySelector("table.trend"), "ppcSales")).toEqual(["$1,120.00", "$560.00", "$560.00"]);
  });

  it("redraws as soon as a control changes, without Apply", async () => {
    await openTrend(SP => lastDays(SP, 56).map(d => day("SP", d)));
    const SP = window.SP;
    const change = (key, value) => {
      const input = document.querySelector(`[data-k=${key}]`);
      input.value = value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    change("cols", "2");
    expect(rowValues(document.querySelector("table.trend"), "ppcSales")).toHaveLength(3);
    const weekEarlier = SP.addDays(SP.lastDate, -7);
    change("last", SP.iso(weekEarlier));
    expect(document.querySelector("table.trend thead th.dh:last-child").textContent).toContain(SP.dd(weekEarlier));
    change("days", "1");
    expect(rowValues(document.querySelector("table.trend"), "ppcSales")).toEqual(["$80.00", "$40.00", "$40.00"]);
  });

  it("explains when there is no data yet", async () => {
    await openTrend(() => []);
    expect(document.querySelector("table.trend")).toBeNull();
    expect(document.querySelector("#adt").textContent).toContain("No Amazon Ads data yet");
  });

  it("Sync now runs a sync and redraws", async () => {
    const fetch = await openTrend(() => []);
    document.querySelector("[data-sync]").click();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/sync/ads", expect.objectContaining({ method: "POST" })));
    await vi.waitFor(() => expect(document.querySelector("#toast").textContent).toBe("Amazon Ads data is up to date."));
    expect(fetch.mock.calls.filter(([url]) => url === "/api/ads/trend")).toHaveLength(2);
  });

  it.each([
    [{ requested: 2, stored: 1, failed: 1, pending: 0, rows: 5, errors: [] }, "1 report failed"],
    [{ requested: 1, stored: 1, failed: 0, pending: 0, rows: 5, errors: ["SB: Report request failed: HTTP 401"] }, "SB: Report request failed: HTTP 401"],
    [{ requested: 3, stored: 1, failed: 1, pending: 1, rows: 5, errors: [] }, "still being prepared"],
  ])("Sync now reports problems instead of up to date (%#)", async (summary, text) => {
    await openTrend(() => [], { sync: summary });
    document.querySelector("[data-sync]").click();
    await vi.waitFor(() => expect(document.querySelector("#toast").textContent).toContain(text));
    expect(document.querySelector("#toast").textContent).toContain("problems");
  });

  it("still says when reports are only pending", async () => {
    await openTrend(() => [], { sync: { requested: 2, stored: 0, failed: 0, pending: 2, rows: 0, errors: [] } });
    document.querySelector("[data-sync]").click();
    await vi.waitFor(() => expect(document.querySelector("#toast").textContent).toBe("Amazon is still preparing some reports. Check back in a few minutes."));
  });

  it("shows dates without synced data as unavailable, not zero", async () => {
    // Data is stored for the last 21 days only.
    await openTrend(SP => lastDays(SP, 56).map(d => day("SP", d)), { cover: SP => ({ SP: covered(SP, 20) }) });
    const SP = window.SP;
    const sales = () => rowValues(document.querySelector("table.trend"), "ppcSales");
    expect(sales()).toEqual(["$840.00", ...Array(5).fill("—"), "$280.00", "$280.00", "$280.00"]);
    const last = document.querySelector("[data-k=last]");
    last.value = SP.iso(SP.addDays(SP.lastDate, 7));
    last.dispatchEvent(new Event("change", { bubbles: true }));
    // The week after the last synced day is unknown too; the summary only counts known weeks.
    expect(sales()).toEqual(["$840.00", ...Array(4).fill("—"), "$280.00", "$280.00", "$280.00", "—"]);
  });

  it("keeps a gap inside the synced range unavailable", async () => {
    // Synced: 55 to 28 days back and the last 13 days; 27 to 14 days back is still missing.
    const cover = SP => ({ SP: coveredRanges(SP, [[55, 28], [13, 0]]) });
    await openTrend(SP => lastDays(SP, 56).map(d => day("SP", d)), { cover });
    expect(rowValues(document.querySelector("table.trend"), "ppcSales")).toEqual(["$1,680.00", ...Array(4).fill("$280.00"), "—", "—", "$280.00", "$280.00"]);
  });

  it("leaves the combined totals unavailable while an ad type hasn't synced", async () => {
    await openTrend(SP => lastDays(SP, 56).map(d => day("SP", d)), {
      cover: SP => ({ SP: covered(SP), SD: covered(SP) }),
      adTypes: { SP: { state: "ok" }, SB: { state: "pending" }, SD: { state: "ok" } },
    });
    const [all, sp] = document.querySelectorAll("table.trend");
    expect(rowValues(all, "ppcSales")).toEqual(Array(9).fill("—"));
    expect(rowValues(sp, "ppcSales")[0]).toBe("$2,240.00");
    expect(document.querySelector("#adt").textContent).toContain("Sponsored Brands hasn't finished syncing");
  });

  it("leaves out an ad type Amazon doesn't offer the account, and says so", async () => {
    await openTrend(SP => lastDays(SP, 56).map(d => day("SP", d)), {
      cover: SP => ({ SP: covered(SP), SB: covered(SP) }),
      adTypes: { SP: { state: "ok" }, SB: { state: "ok" }, SD: { state: "unsupported" } },
    });
    expect(rowValues(document.querySelector("table.trend"), "ppcSales")[0]).toBe("$2,240.00");
    expect(document.querySelector("#adt").textContent).toContain("Sponsored Display isn't included");
  });
});
