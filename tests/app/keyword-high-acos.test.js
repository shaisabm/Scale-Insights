// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { openApp, stubFetch, stubNavigation } from "./load-app.js";

// The Keywords with High ACOS card runs the Keywords with 0 Sales card's machinery, so these cover
// what differs: its defaults, columns, sample keywords, filter and settings URL.
const card = () => document.querySelector("[data-kwa-card]");
const bodyRows = () => [...card().querySelectorAll("tbody tr[data-k]")];
const labels = () => [...card().querySelectorAll("thead th")].map(th => th.textContent.replace(/[↓↑]/g, "").trim());
const field = sel => document.querySelector(`.modal-wrap ${sel}`);
const acosSettings = (overrides = {}) => ({
  name: "Keywords with High ACOS", description: "[Tip]: You can automatically lower the bids of keywords with high ACOS using Automation.", showTracked: true,
  hideProductTargets: false, hideKeywordTargets: false, hideAutoTargets: true, hideExact: false, hidePhrase: false, hideBroad: false, hidePausedKeywords: false, hidePausedTargets: false,
  sort: "acos", dir: "desc", filters: { acos: { min: 60 }, spend: { min: 20 } }, track: ["clicks", "units", "cpc", "conversion", "acos", "spend", "pl", "currentBid"],
  order: ["p", "campaign", "adGroup", "keyword", "clicks", "units", "conversion", "spend", "currentBid", "cpc", "acos", "pl"], pageSize: 7, ...overrides,
});
const keyword = (keyword, clicks, spend, sales, orders, currentBid) => ({ sponsored: "Products", campaign: `Campaign for ${keyword}`, adGroup: "Exact", keyword, kind: "keyword", matchType: "exact", state: "enabled",
  clicks, units: orders, orders, spend, sales, conversion: (orders / clicks) * 100, cpc: spend / clicks, acos: (spend / sales) * 100, pl: null, currentBid, asin: "", title: "", image: null, products: [] });
const page = (rows, settings) => ({
  page: 0, pageSize: 7, total: rows.length, rows, settings, from: "2026-10-28", to: "2026-11-26",
  totals: { clicks: rows.reduce((n, r) => n + r.clicks, 0), spend: rows.reduce((n, r) => n + r.spend, 0), pl: null, currentBid: null },
  coverage: { SP_TARGETING: { days: 30, expectedDays: 30 }, SB_TARGETING: { days: 30, expectedDays: 30 }, SD_TARGETING: { days: 30, expectedDays: 30 } },
});
const searchPage = { page: 0, pageSize: 7, total: 0, rows: [], totals: {}, coverage: {} };

describe("Keywords with High ACOS card", () => {
  it("lists sample keywords that spent $20 or more at 60% ACOS or more, worst first, with the original card's columns", async () => {
    stubNavigation();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    expect(card().querySelector("h3").textContent).toBe("Keywords with High ACOS");
    expect(labels()).toEqual(["Product", "Campaign", "Ad group", "Keyword", "Clicks", "Units", "Conversion", "Spend", "Current bid", "CPC", "ACOS", "P&L"]);
    // Eight sample keywords pass: the auto target, the one under 60% ACOS and the one under $20 don't.
    expect(card().querySelector("[data-zero-pager]").textContent).toContain("1–7 of 8");
    const keywords = bodyRows().map(tr => tr.children[3].textContent);
    expect(keywords.slice(0, 6)).toEqual(["battle ropes for home gym", "audiences-likely-interested-in-ad", "cordless jump rope", "jump rope with counter", "speed jump rope", "cordless training rope"]);
    expect(keywords[6]).toMatch(/^asin="/);
    const first = bodyRows()[0].textContent;
    for (const value of ["41", "2.44%", "$42.88", "$0.95", "$1.05", "204.29%"]) expect(first).toContain(value);
    for (const gone of ["loose-match", "weighted jump rope"]) expect(card().textContent).not.toContain(gone);
    // Every row sold, so no P&L is known and the totals row leaves it blank.
    const totals = card().querySelector(".sumrow").children;
    expect(totals[labels().indexOf("P&L")].textContent.trim()).toBe("");
    card().querySelector("[data-zero-next]").click();
    await vi.waitFor(() => expect(bodyRows()[0].textContent).toContain("workout equipment for women"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads from its own keyword filter, saves its own settings and links to its own filter, with real data", async () => {
    stubNavigation();
    const saves = [];
    // The two keyword cards ask the same endpoint for different filters.
    const api = stubFetch({
      "GET /api/ads/zero-sales": searchPage, "GET /api/ads/high-acos": searchPage, "GET /api/ads/performing": searchPage,
      "PUT /api/ads/high-acos-keywords-settings": init => { saves.push(JSON.parse(init.body)); return { settings: JSON.parse(init.body) }; },
    });
    const routes = api.getMockImplementation();
    api.mockImplementation(async (url, init = {}) => {
      const u = new URL(url, location.origin);
      if (u.pathname !== "/api/ads/keywords") return routes(url, init);
      const body = u.searchParams.get("filterId") === "high-acos-keywords"
        ? page([keyword("cordless jump rope", 35, 32.69, 20.99, 1, 0.8)], saves.length ? acosSettings(saves[saves.length - 1]) : acosSettings())
        : page([]);
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    openApp("/Ads", { realData: true });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    expect(bodyRows()[0].textContent).toContain("cordless jump rope");
    expect(bodyRows()[0].textContent).toContain("155.74%");
    expect(document.querySelector("[data-kw-card]").textContent).not.toContain("cordless jump rope");
    const link = new URL(card().querySelector("a.see").href);
    expect([link.pathname, link.searchParams.get("filterId")]).toEqual(["/Ads/Performance/Keywords", "high-acos-keywords"]);
    document.querySelector("[data-edit=kwa]").click();
    expect([field("[data-z=sort]").value, field("[data-min=acos]").value, field("[data-min=spend]").value]).toEqual(["acos:desc", "60", "20"]);
    field("[data-min=acos]").value = "100";
    field("[data-ok]").click();
    await vi.waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toEqual(acosSettings({ filters: { acos: { min: 100 }, spend: { min: 20 } } }));
    expect(api.mock.calls.filter(([url]) => String(url).startsWith("/api/ads/keywords?filterId=high-acos-keywords")).length).toBeGreaterThan(1);
  });
});

describe("Performance report's Keywords tab", () => {
  it("opens with the High ACOS filter picked and the sample keywords it keeps", async () => {
    stubNavigation();
    vi.stubGlobal("fetch", vi.fn());
    openApp("/Ads/Performance/Keywords?filterId=high-acos-keywords&from=2026-10-28&to=2026-11-26", { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-grid=perf]")).not.toBeNull());
    expect(document.querySelector("[data-select] .slabel").textContent).toBe("Keywords with High ACOS");
    const rows = [...document.querySelectorAll("[data-grid=perf] tbody tr[data-k]")];
    expect(rows).toHaveLength(8);
    expect(document.querySelector("[data-grid=perf] tbody").textContent).not.toContain("loose-match");
  });
});
