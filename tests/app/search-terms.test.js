// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { openApp, stubFetch } from "./load-app.js";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
const from = "2026-10-27", to = "2026-11-25";
const counts = { impressions: 100, clicks: 4, orders: 1, units: 1, spend: 4, sales: 25, ctr: 4, cpc: 1, conversion: 25, acos: 16, roas: 6.25, costPerOrder: 4 };
const productA = { asin: "B0PRODUCTA", title: "Product A", image: null }, productB = { asin: "B0PRODUCTB", title: "Product B", image: null };
const fixture = (filterId = "performing") => {
  const settings = { name: "Performing Search Terms", filters: { conversion: { min: 15 } }, hideAsins: true, sort: "conversion", dir: "desc" };
  const rows = [[productA], [productB], [productA, productB]].map((products, i) => ({ ...counts, products, asin: products.map(p => p.asin).join(","), title: products[0].title,
    sponsored: "Products", term: i ? "weighted rope" : '<img src=x onerror="bad()">', details: [
      { ...counts, campaignName: "Campaign A", adGroupName: "Broad group", keyword: "jump rope", matchType: "BROAD", lastSeen: to, detailed: true },
      { ...counts, campaignName: "Campaign B", adGroupName: "Exact group", keyword: '<script>bad()</script>', matchType: "EXACT", orders: 0, detailed: true },
    ] }));
  return { from, to, filterId, settings, rows, products: rows.map(r => ({ ...r, clicks: 50, terms: [r] })), totals: counts, coverage: { SP_SEARCH: { days: 30, expectedDays: 30 }, SB_SEARCH: { days: 30, expectedDays: 30, mapReady: true } }, detailComplete: true };
};
const loaded = () => vi.waitFor(() => expect(document.querySelector('[data-grid="search-products"]')).not.toBeNull());

describe("Search terms report", () => {
  it("loads the requested dates and insight filter, and expands products into terms then contributions", async () => {
    const fetch = stubFetch({ "GET /api/ads/search-terms": fixture() });
    openApp(`/Ads/SearchTerms?filterId=performing&from=${from}&to=${to}`);
    await loaded();
    expect(fetch.mock.calls[0][0]).toContain(`from=${from}&to=${to}&filterId=performing`);
    expect(document.querySelector("[data-search-filter]").value).toBe("performing");
    expect(document.querySelector("[data-range]").dataset.from).toBe(from);
    expect(document.querySelectorAll('[data-grid="search-products"] > tbody > tr[data-k]')).toHaveLength(3);
    expect(document.querySelector('[data-grid="search-products"] tbody').textContent).toContain("B0PRODUCTA");
    document.querySelector('[data-grid="search-products"] [data-gdet="0"]').click();
    const terms = document.querySelector('[data-grid="search-product-0"]');
    expect(terms).not.toBeNull();
    expect(terms.textContent).toContain('<img src=x onerror="bad()">');
    expect(terms.querySelector('img[src="x"]')).toBeNull();
    terms.querySelector('[data-gdet="0"]').click();
    const details = document.querySelector('[data-grid="search-product-0-detail-0"]');
    expect(details.textContent).toContain("Campaign A");
    expect(details.textContent).toContain("Campaign B");
    expect(details.textContent).toContain("Broad group");
    expect(details.textContent).toContain("broad");
    expect(details.textContent).toContain("exact");
    expect(details.querySelector("script")).toBeNull();
    expect(details.querySelectorAll("tbody tr[data-k]")).toHaveLength(2);
    document.querySelector('[data-tabs="search-report"] [data-i="1"]').click();
    expect(document.querySelector('[data-panels="search-report"] [data-panel="1"]').hidden).toBe(false);
    document.querySelector('[data-grid="search-flat"] [data-gdet="0"]').click();
    expect(document.querySelector('[data-grid="search-flat-detail-0"]').textContent).toContain("Campaign A");
  });

  it("filters product sets exactly and preserves the current tab and dates when changing insight filters", async () => {
    const fetch = stubFetch({ "GET /api/ads/search-terms": fixture() });
    openApp(`/Ads/SearchTerms?filterId=performing&from=${from}&to=${to}`); await loaded();
    const select = document.querySelector("[data-search-product]");
    select.value = "B0PRODUCTA,B0PRODUCTB"; select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.querySelectorAll('[data-grid="search-products"] > tbody > tr[data-k]')).toHaveLength(1);
    document.querySelector('[data-tabs="search-report"] [data-i="1"]').click();
    const filter = document.querySelector("[data-search-filter]"); filter.value = "high-acos"; filter.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(fetch.mock.calls).toHaveLength(2));
    await vi.waitFor(() => expect(location.search).toContain("filterId=high-acos"));
    expect(fetch.mock.calls[1][0]).toContain(`from=${from}&to=${to}&filterId=high-acos`);
    expect(document.querySelector('[data-panels="search-report"] [data-panel="1"]').hidden).toBe(false);
    expect(document.querySelectorAll('[data-grid="search-flat"] > tbody > tr[data-k]')).toHaveLength(1);
  });

  it("provides the three product groups and functional drilldowns in sample mode without requests", async () => {
    const fetch = stubFetch({});
    openApp("/Ads/SearchTerms", { env: "preview", realData: false }); await loaded();
    expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-grid="search-products"] > tbody > tr[data-k]')).toHaveLength(3);
    document.querySelector('[data-grid="search-products"] [data-gdet="0"]').click();
    document.querySelector('[data-grid="search-product-0"] [data-gdet="0"]').click();
    expect(document.querySelector('[data-grid="search-product-0-detail-0"]')).not.toBeNull();
  });

  it("all three insight links carry their filter and the selected dates", async () => {
    stubFetch({}); openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-perf-card] a.see")).not.toBeNull());
    const root = document.querySelector(".page-ads");
    root.dispatchEvent(new CustomEvent("rangechange", { detail: { from, to } }));
    for (const [selector, id] of [["[data-zero-card]", "zero-sales"], ["[data-hacos-card]", "high-acos"], ["[data-perf-card]", "performing"]]) {
      const link = new URL(document.querySelector(`${selector} a.see`).href);
      expect(link.pathname).toBe("/Ads/SearchTerms");
      expect(link.searchParams.get("filterId")).toBe(id);
      expect(link.searchParams.get("from")).toBe(from);
      expect(link.searchParams.get("to")).toBe(to);
    }
  });
});
