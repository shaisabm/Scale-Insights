// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { openApp, stubFetch, stubNavigation } from "./load-app.js";

const day = (adProduct, date, n = 1) => ({ adProduct, date, impressions: 1000 * n, clicks: 20 * n, cost: 10 * n, orders: 2 * n, units: 3 * n, sales: 40 * n });

// Every day of the default 8 x 7-day view (it ends on SP.lastDate, two days ago).
function lastDays(SP, count) {
  return Array.from({ length: count }, (_, i) => SP.iso(SP.addDays(SP.lastDate, -i)));
}

async function openTrend(days) {
  stubNavigation();
  const fetch = stubFetch({
    "GET /api/ads/trend": () => ({ from: "x", to: "y", days: days(window.SP), synced: { SP: { first: "x", last: "y", syncedAt: "2026-11-22T14:00:00.000Z" } } }),
    "POST /api/sync/ads": { requested: 1, stored: 1, failed: 0, pending: 0, rows: 5 },
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

  it("returns zeros, not NaN, when there is no data", () => {
    stubFetch({});
    const SP = openApp("/");
    const t = SP.adTotals([], "SP", "2026-11-01", "2026-11-02");
    expect(Object.values(t).every(v => v === 0)).toBe(true);
  });
});

describe("Advertising trend page", () => {
  it("draws Sponsored Products and Sponsored Brands from the API data", async () => {
    await openTrend(SP => [...lastDays(SP, 56).map(d => day("SP", d)), day("SB", SP.iso(SP.lastDate), 2)]);
    const [sp, sb] = document.querySelectorAll("table.trend");
    expect([...document.querySelectorAll("#adt h4")].map(h => h.textContent)).toEqual(["Advertising trend for Sponsored Products", "Advertising trend for Sponsored Brands"]);
    // Summary, then 8 weekly columns of 7 days each.
    expect(rowValues(sp, "ppcSales")).toEqual(["$2,240.00", ...Array(8).fill("$280.00")]);
    expect(rowValues(sp, "acos")).toEqual(Array(9).fill("25.00%"));
    expect(rowValues(sb, "ppcSales")).toEqual(["$80.00", ...Array(7).fill("$0.00"), "$80.00"]);
    expect(document.querySelector(".meta").textContent).toContain("last synced");
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
});
