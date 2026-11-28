// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { openApp, stubFetch, stubNavigation } from "./load-app.js";

// The Keywords with 0 Sales card shares the search term cards' machinery (pager, rows per page,
// column dragging), so these cover what differs: its columns, its dialog's options, its endpoint
// and settings, and where See details goes.
const card = () => document.querySelector("[data-kw-card]");
const bodyRows = () => [...card().querySelectorAll("tbody tr[data-k]")];
const labels = () => [...card().querySelectorAll("thead th")].map(th => th.textContent.replace(/[↓↑]/g, "").trim());
const field = sel => document.querySelector(`.modal-wrap ${sel}`);
const keywordSettings = (overrides = {}) => ({
  name: "Keywords with 0 Sales", description: "[Tip]: You can automatically reduce poor keyword bids using Automation.", showTracked: true,
  hideProductTargets: false, hideKeywordTargets: false, hideAutoTargets: true, hideExact: false, hidePhrase: false, hideBroad: false, hidePausedKeywords: false, hidePausedTargets: false,
  sort: "spend", dir: "desc", filters: { orders: { max: 0 }, spend: { min: 20 } }, track: ["clicks", "cpc", "pl", "currentBid"], order: ["p", "campaign", "adGroup", "keyword", "clicks", "currentBid"], pageSize: 7, ...overrides,
});
const keyword = (keyword, clicks, spend, currentBid) => ({ sponsored: "Products", campaign: `Campaign for ${keyword}`, adGroup: "Exact", keyword, kind: "keyword", matchType: "exact", state: "enabled", clicks, spend, cpc: spend / clicks, pl: -spend, currentBid });
const searchPage = { page: 0, pageSize: 7, total: 0, rows: [], totals: {}, coverage: {} };
const keywordPage = (rows, settings = keywordSettings()) => ({
  page: 0, pageSize: 7, total: rows.length, rows, settings, filterId: "zero-sales-keywords", from: "2026-10-28", to: "2026-11-26",
  totals: { clicks: rows.reduce((n, r) => n + r.clicks, 0), cpc: 0.85, pl: rows.reduce((n, r) => n + r.pl, 0), currentBid: null },
  coverage: { SP_TARGETING: { days: 30, expectedDays: 30 }, SB_TARGETING: { days: 30, expectedDays: 30 }, SD_TARGETING: { days: 30, expectedDays: 30 } },
});

describe("Keywords with 0 Sales card", () => {
  it("lists sample keywords that spent $20 or more without sales, costliest first, with the original card's columns", async () => {
    stubNavigation();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    expect(card().querySelector("h3").textContent).toBe("Keywords with 0 Sales");
    expect(labels()).toEqual(["Product", "Campaign", "Ad group", "Keyword", "Clicks", "Current bid", "CPC", "P&L"]);
    // Each sample keyword or target shows its product's thumbnail, Sponsored Display's too.
    expect(bodyRows().every(tr => tr.children[0].querySelector(".thumb"))).toBe(true);
    // Eight of the sample keywords pass the defaults: the auto target, the one that sold and the one
    // that spent under $20 don't.
    expect(bodyRows()).toHaveLength(7);
    expect(card().querySelector("[data-zero-pager]").textContent).toContain("1–7 of 8");
    expect(bodyRows()[0].textContent).toContain("jump rope with counter");
    expect(bodyRows()[0].textContent).toContain("$1.08");
    expect(bodyRows()[0].textContent).toContain("($49.09)");
    for (const gone of ["close-match", "jump rope for women", "cordless battle ropes"]) expect(card().textContent).not.toContain(gone);
    card().querySelector("[data-zero-next]").click();
    await vi.waitFor(() => expect(bodyRows()[0].textContent).toContain("battle ropes for home gym"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens the Performance report's Keywords tab, filtered by the card, for the card's dates", async () => {
    stubNavigation();
    vi.stubGlobal("fetch", vi.fn());
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    const link = new URL(card().querySelector("a.see").href);
    expect(link.pathname).toBe("/Ads/Performance/Keywords");
    expect(link.searchParams.get("filterId")).toBe("zero-sales-keywords");
    expect(link.searchParams.get("from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(link.searchParams.get("to")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("edits the keyword options and filters, which apply to the sample keywords", async () => {
    stubNavigation();
    vi.stubGlobal("fetch", vi.fn());
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    document.querySelector("[data-edit=kw0]").click();
    const boxes = [...document.querySelectorAll(".modal-wrap .zero-edit > label:not(.field)")].map(l => [l.textContent.trim(), l.querySelector("input").checked]);
    expect(boxes).toEqual([
      ["Show tracked columns in Overview", true], ["Hide product targets from results", false], ["Hide keyword targets from results", false], ["Hide auto targets from results", true],
      ["Hide exact keywords from results", false], ["Hide phrase keywords from results", false], ["Hide broad keywords from results", false],
      ["Hide keywords with paused status from results", false], ["Hide targets with paused status from results", false],
    ]);
    expect([...document.querySelectorAll(".modal-wrap tbody th")].map(th => th.textContent)).toEqual(["Impressions", "Clicks", "Orders", "Units", "Cost per click", "CTR %", "Conversion %", "ACOS %", "TOS impression share %", "ROAS", "Spend", "Sales", "P&L", "Break even bid", "Current bid"]);
    expect([field("[data-z=name]").value, field("[data-z=sort]").value, field("[data-max=orders]").value, field("[data-min=spend]").value]).toEqual(["Keywords with 0 Sales", "spend:desc", "0", "20"]);
    expect(["clicks", "cpc", "pl", "currentBid"].every(k => field(`[data-track=${k}]`).checked)).toBe(true);
    // Leaving out broad and paused keywords, and product targets, keeps the two exact keywords and the phrase one.
    field("[data-z=hideBroad]").checked = true;
    field("[data-z=hidePausedKeywords]").checked = true;
    field("[data-z=hideProductTargets]").checked = true;
    field("[data-track=topShare]").checked = true;
    field("[data-ok]").click();
    await vi.waitFor(() => expect(bodyRows()).toHaveLength(3));
    expect(bodyRows().map(tr => tr.children[3].textContent)).toEqual(["training rope with handles", "battle rope", "battle ropes for home gym"]);
    expect(labels()).toContain("TOS share");
  });

  it("loads from the keywords endpoint and saves its own settings, with real data", async () => {
    stubNavigation();
    const saves = [];
    const api = stubFetch({
      "GET /api/ads/zero-sales": searchPage, "GET /api/ads/high-acos": searchPage, "GET /api/ads/performing": searchPage,
      "GET /api/ads/keywords": () => keywordPage([keyword("weighted battle ropes", 46, 45.77, 1.13), keyword("jump rope with counter", 23, 27.37, 0.81)], saves.length ? keywordSettings(saves[saves.length - 1]) : keywordSettings()),
      "PUT /api/ads/zero-sales-keywords-settings": init => { saves.push(JSON.parse(init.body)); return { settings: JSON.parse(init.body) }; },
    });
    openApp("/Ads", { realData: true });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    const asked = new URL(String(api.mock.calls.map(([url]) => String(url)).find(u => u.startsWith("/api/ads/keywords"))), location.origin);
    expect(asked.searchParams.get("filterId")).toBe("zero-sales-keywords");
    expect(bodyRows()[0].textContent).toContain("weighted battle ropes");
    expect(card().querySelector(".sumrow").textContent).toContain("69");
    document.querySelector("[data-edit=kw0]").click();
    field("[data-z=name]").value = "Wasted keywords";
    field("[data-z=hideExact]").checked = true;
    field("[data-min=spend]").value = "";
    field("[data-ok]").click();
    await vi.waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toEqual(keywordSettings({ name: "Wasted keywords", hideExact: true, filters: { orders: { max: 0 } } }));
    await vi.waitFor(() => expect(card().querySelector("h3").textContent).toBe("Wasted keywords"));
    // Paging asks the same endpoint for the same filter.
    expect(api.mock.calls.filter(([url]) => String(url).startsWith("/api/ads/keywords?filterId=zero-sales-keywords")).length).toBeGreaterThan(1);
  });

  it("shows each keyword's product image like the search term cards, first even in a column order saved before it", async () => {
    stubNavigation();
    const one = { asin: "B0PRODUCTA", title: "Weighted Jump Rope", image: "/api/ads/product-image?asin=B0PRODUCTA" };
    const two = { asin: "B0PRODUCTB", title: "Battle Rope", image: null };
    const rows = [
      { ...keyword("weighted battle ropes", 46, 45.77, 1.13), asin: one.asin, title: one.title, image: one.image, products: [one] },
      { ...keyword("battle ropes for home gym", 23, 27.37, 0.81), asin: "B0PRODUCTA,B0PRODUCTB", title: one.title, image: one.image, products: [one, two] },
      { ...keyword("audiences-likely-interested-in-ad", 59, 21.96, 0.2), sponsored: "Display", kind: "target", asin: "", title: "", image: null, products: [] },
    ];
    const saved = keywordSettings({ order: ["keyword", "campaign", "adGroup", "clicks", "currentBid"] });
    stubFetch({
      "GET /api/ads/zero-sales": searchPage, "GET /api/ads/high-acos": searchPage, "GET /api/ads/performing": searchPage,
      "GET /api/ads/keywords": keywordPage(rows, saved),
    });
    openApp("/Ads", { realData: true });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    expect(labels()).toEqual(["Product", "Keyword", "Campaign", "Ad group", "Clicks", "Current bid", "CPC", "P&L"]);
    const [single, multi, display] = bodyRows().map(tr => tr.children[0]);
    expect(single.querySelector("img.zero-thumb").getAttribute("src")).toBe("/api/ads/product-image?asin=B0PRODUCTA");
    expect(single.querySelector("img").getAttribute("alt")).toBe("Weighted Jump Rope");
    expect(multi.querySelector("[data-zero-multi]").getAttribute("aria-label")).toBe("Weighted Jump Rope (B0PRODUCTA) + Battle Rope (B0PRODUCTB)");
    expect(multi.querySelector(".zero-count").textContent).toBe("+1");
    expect(multi.querySelectorAll(".zero-pop figure")).toHaveLength(2);
    expect(display.querySelector(".zero-product")).not.toBeNull();
  });

  it("says why it couldn't load, while the search term cards still show", async () => {
    stubNavigation();
    stubFetch({
      "GET /api/ads/zero-sales": searchPage, "GET /api/ads/high-acos": searchPage, "GET /api/ads/performing": searchPage,
      "GET /api/ads/keywords": { status: 500, json: { error: "Database down" } },
    });
    openApp("/Ads", { realData: true });
    await vi.waitFor(() => expect(card()).toBeTruthy());
    expect(card().textContent).toContain("Keywords couldn't load: Database down");
    expect(document.querySelector("[data-zero-card] h3").textContent).toBe("Search Terms with 0 Sales");
  });
});

describe("Performance report's Keywords tab", () => {
  it("opens on the Keywords tab with the card's filter picked and the keywords it keeps", async () => {
    stubNavigation();
    vi.stubGlobal("fetch", vi.fn());
    openApp("/Ads/Performance/Keywords?filterId=zero-sales-keywords&from=2026-10-28&to=2026-11-26", { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-grid=perf]")).not.toBeNull());
    expect(document.querySelector("#page-title-text").textContent).toBe("Performance");
    expect(document.querySelector("[data-tabs=perf] button.on").textContent).toBe("Keywords");
    expect(document.querySelector("[data-select] .slabel").textContent).toBe("Keywords with 0 Sales");
    const rows = [...document.querySelectorAll("[data-grid=perf] tbody tr[data-k]")];
    expect(rows).toHaveLength(8);
    expect([...document.querySelectorAll("[data-grid=perf] thead th")].slice(0, 3).map(th => th.textContent.replace(/[↓↑]/g, "").trim())).toEqual(["Campaign", "Ad group", "Keyword"]);
    expect(document.querySelector("[data-grid=perf] tbody").textContent).not.toContain("close-match");
  });

  it("keeps the plain report on /Ads/Performance", async () => {
    stubNavigation();
    vi.stubGlobal("fetch", vi.fn());
    openApp("/Ads/Performance", { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-grid=perf]")).not.toBeNull());
    expect(document.querySelector("[data-tabs=perf] button.on").textContent).toBe("Products");
    expect(document.querySelector("[data-select] .slabel").textContent).toBe("Select filter");
  });
});
