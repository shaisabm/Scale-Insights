// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { openApp, stubFetch, stubNavigation } from "./load-app.js";

// The Missing good Word In Title card runs the other cards' machinery against words, and its See
// details opens the Main words report.
const card = () => document.querySelector("[data-words-card]");
const bodyRows = (root = card()) => [...root.querySelectorAll(":scope tbody > tr[data-k]")];
const heads = table => [...table.querySelectorAll(":scope > thead th")].map(th => th.textContent.replace(/[↓↑]/g, "").trim());
const field = sel => document.querySelector(`.modal-wrap ${sel}`);
const grid = id => document.querySelector(`[data-grid="${id}"]`);
const wordSettings = (overrides = {}) => ({
  name: "Missing good Word In Title", description: "[Tip]: Consider adding relevant keyword with high traffic and conversion to your product title for boosting their organic ranking.", showTracked: true,
  hideAsins: true, hideInTitle: true, sort: "orders", dir: "desc", filters: { orders: { min: 3 }, conversion: { min: 8 } }, track: ["clicks", "orders", "conversion"], order: [], pageSize: 7, ...overrides,
});
const product = { asin: "B0PRODUCTA", title: "Cordless Battle Ropes for Home Gym", image: "/api/ads/product-image?asin=B0PRODUCTA" };
const word = (w, clicks, orders, extra = {}) => ({ adProduct: "SB_SEARCH", sponsored: "Brands", asin: product.asin, title: product.title, image: product.image, products: [product], word: w,
  terms: 32, impressions: 141, clicks, orders, units: orders, spend: 40.64, sales: 104.95, ctr: 29.08, cpc: 0.99, conversion: (orders / clicks) * 100, acos: 38.72, roas: 2.58, inTitle: false, lastSeen: "2026-11-22", ...extra });
const searchPage = { page: 0, pageSize: 7, total: 0, rows: [], totals: {}, coverage: {} };
const full = { SP_SEARCH: { days: 60, expectedDays: 60 }, SB_SEARCH: { days: 60, expectedDays: 60, mapReady: true } };

describe("Missing good Word In Title card", () => {
  it("lists sample words with 3 or more orders and 8% conversion missing from the title, most orders first", async () => {
    stubNavigation();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    expect(card().querySelector("h3").textContent).toBe("Missing good Word In Title");
    expect(heads(card().querySelector("table.grid"))).toEqual(["Product", "Sponsored", "Word", "Clicks", "Orders", "Conversion"]);
    const orders = bodyRows().map(tr => Number(tr.children[4].textContent));
    expect(orders).toEqual([...orders].sort((a, b) => b - a));
    expect(orders.every(n => n >= 3)).toBe(true);
    // Words of the sample titles ("weighted", "training", "rope") are left out.
    for (const tr of bodyRows()) expect(["weighted", "training", "rope", "home", "gym"]).not.toContain(tr.children[2].textContent);
    expect(card().querySelector("[data-zero-pager]").textContent).toMatch(/1–7 of \d+/);
    const link = new URL(card().querySelector("a.see").href);
    expect([link.pathname, link.searchParams.get("filterId")]).toEqual(["/Ads/MainKeywords", "missing-title-words"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("edits the word options and filters of the original card", async () => {
    stubNavigation();
    vi.stubGlobal("fetch", vi.fn());
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    document.querySelector("[data-edit=mw]").click();
    const boxes = [...document.querySelectorAll(".modal-wrap .zero-edit > label:not(.field)")].map(l => [l.textContent.trim(), l.querySelector("input").checked]);
    expect(boxes).toEqual([["Show tracked columns in Overview", true], ["Hide ASINs", true], ["Hide words if they appear in Title", true]]);
    expect([...document.querySelectorAll(".modal-wrap tbody th")].map(th => th.textContent)).toEqual(["Impressions", "Clicks", "Orders", "Units", "Cost per click", "CTR %", "Conversion %", "ACOS %", "ROAS", "Spend", "Sales"]);
    expect([field("[data-z=sort]").value, field("[data-min=orders]").value, field("[data-min=conversion]").value]).toEqual(["orders:desc", "3", "8"]);
    // Showing words that are in the title brings back the title's words.
    field("[data-z=hideInTitle]").checked = false;
    field("[data-ok]").click();
    await vi.waitFor(() => expect(card().querySelector("[data-zero-pager]").textContent).not.toBe(""));
    expect(bodyRows().some(tr => ["weighted", "training", "rope"].includes(tr.children[2].textContent))).toBe(true);
  });

  it("loads its words and saves its settings through its own filter, with real data", async () => {
    stubNavigation();
    const saves = [];
    const api = stubFetch({
      "GET /api/ads/zero-sales": searchPage, "GET /api/ads/high-acos": searchPage, "GET /api/ads/performing": searchPage, "GET /api/ads/keywords": searchPage,
      "GET /api/ads/search-terms": () => ({ ...searchPage, total: 2, rows: [word("counter", 41, 5), word("with", 42, 4)], totals: { clicks: 83, orders: 9, conversion: 10.84 }, coverage: full, settings: saves.length ? wordSettings(saves.at(-1)) : wordSettings() }),
      "PUT /api/ads/missing-title-words-settings": init => { saves.push(JSON.parse(init.body)); return { settings: JSON.parse(init.body) }; },
    });
    openApp("/Ads", { realData: true });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    const asked = new URL(String(api.mock.calls.map(([url]) => String(url)).find(u => u.startsWith("/api/ads/search-terms"))), location.origin);
    expect([asked.searchParams.get("view"), asked.searchParams.get("filterId")]).toEqual(["word-insight", "missing-title-words"]);
    expect(bodyRows().map(tr => [tr.children[1].textContent, tr.children[2].textContent, tr.children[3].textContent, tr.children[4].textContent, tr.children[5].textContent]))
      .toEqual([["Brands", "counter", "41", "5", "12.20%"], ["Brands", "with", "42", "4", "9.52%"]]);
    expect(bodyRows()[0].querySelector("img.zero-thumb").getAttribute("src")).toBe(product.image);
    expect(card().querySelector(".sumrow").textContent).toContain("10.84%");
    document.querySelector("[data-edit=mw]").click();
    field("[data-min=orders]").value = "5";
    field("[data-ok]").click();
    await vi.waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toEqual(wordSettings({ filters: { orders: { min: 5 }, conversion: { min: 8 } } }));
  });
});

describe("Main words report", () => {
  it("groups the sample words by product, opening each product's words and each word's search terms", async () => {
    stubNavigation();
    vi.stubGlobal("fetch", vi.fn());
    openApp("/Ads/MainKeywords?filterId=missing-title-words&from=2026-10-28&to=2026-11-26", { env: "preview", realData: false });
    await vi.waitFor(() => expect(grid("words-products")).not.toBeNull());
    expect(document.querySelector("#page-title-text").textContent).toBe("Main words");
    expect(document.querySelector("[data-words-filter]").value).toBe("missing-title-words");
    expect(heads(grid("words-products")).slice(-4)).toEqual(["Product", "ASIN", "Title", "Words"]);
    const products = bodyRows(grid("words-products"));
    expect(products.length).toBeGreaterThan(0);
    products[0].querySelector("[data-gdet]").click();
    await vi.waitFor(() => expect(grid("words-product-0")).not.toBeNull());
    expect(heads(grid("words-product-0")).slice(1)).toEqual(["Sponsored", "Word", "Blacklist", "Whitelist", "Terms", "Impressions", "Clicks", "Orders", "Units", "Spend", "Sales", "CTR", "CPC", "Conversion", "ACOS", "ROAS", "In title", "Last activity"]);
    const words = bodyRows(grid("words-product-0"));
    expect(words).toHaveLength(Number(products[0].lastElementChild.textContent));
    expect(words[0].textContent).toContain("false");
    expect(words[0].textContent).toContain("26-Nov-26");
    expect(words[0].querySelector(".switch input").disabled).toBe(true);
    words[0].querySelector("[data-gdet]").click();
    await vi.waitFor(() => expect(grid("words-product-0-terms-0")).not.toBeNull());
    // The drilldowns have Columns and the insight cards' pager; the words can be searched, a word's
    // search terms can't, and the product list keeps its search.
    for (const [id, searchable] of [["words-product-0", true], ["words-product-0-terms-0", false]]) {
      const panel = grid(id).closest(".detpanel");
      expect(Boolean(panel.querySelector(":scope > .grid-tools [data-gsearch]"))).toBe(searchable);
      expect(panel.querySelector(":scope > .grid-tools [data-gcols]")).not.toBeNull();
      expect(document.querySelector(`[data-gfoot="${id}"] .zero-pager .zero-showing`).textContent).toMatch(/^1(–\d+)? of \d+$/);
      expect(document.querySelector(`[data-gfoot="${id}"] .pager`)).toBeNull();
    }
    expect(document.querySelector("[data-words-results] > .grid-tools [data-gsearch]")).not.toBeNull();
    expect(heads(grid("words-product-0-terms-0"))).toEqual(["Search terms", "Impressions", "Clicks", "Orders", "Sales", "Conversion", "Spent", "CPC", "ACOS", "ROAS", "Last activity"]);
    const word = bodyRows(grid("words-product-0"))[0].children[2].textContent;
    for (const tr of bodyRows(grid("words-product-0-terms-0"))) expect(tr.children[0].textContent.split(" ")).toContain(word);
    // Searching the words narrows them.
    const search = grid("words-product-0").closest(".detpanel").querySelector(":scope > .grid-tools [data-gsearch]");
    search.value = "no such word";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(bodyRows(grid("words-product-0"))).toHaveLength(0);
    search.value = word;
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(bodyRows(grid("words-product-0")).map(tr => tr.children[2].textContent)).toContain(word);
  });

  it("shows the dates it opens with as their preset, as /Ads does, and others as a custom range", async () => {
    stubNavigation();
    vi.stubGlobal("fetch", vi.fn());
    const SP = openApp("/", { env: "preview", realData: false });
    const last30 = SP.rangeFor("Last 30 Days"), iso = d => SP.iso(d);
    const open = async (from, to) => {
      openApp(`/Ads/MainKeywords?filterId=missing-title-words&from=${from}&to=${to}`, { env: "preview", realData: false });
      await vi.waitFor(() => expect(grid("words-products")).not.toBeNull());
      return document.querySelector("[data-range]");
    };
    let button = await open(iso(last30.from), iso(last30.to));
    expect(button.dataset.preset).toBe("Last 30 Days");
    expect(button.querySelector(".rlabel").textContent).toBe(SP.rangeLabel("Last 30 Days", last30.from, last30.to));
    expect(button.querySelector(".rlabel").textContent).toMatch(/^Last 30 Days: /);
    button.click();
    expect([...document.querySelectorAll(".popover button.on")].map(b => b.textContent)).toEqual(["Last 30 Days"]);
    button = await open("2026-10-01", "2026-10-15");
    expect(button.dataset.preset).toBe("Custom Range");
    expect(button.querySelector(".rlabel").textContent).toBe("1 Oct 26 - 15 Oct 26");
    // The Search terms report does the same.
    openApp(`/Ads/SearchTerms?filterId=zero-sales&from=${iso(last30.from)}&to=${iso(last30.to)}`, { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-search-results]")).not.toBeNull());
    expect(document.querySelector("[data-range]").dataset.preset).toBe("Last 30 Days");
  });

  it("says what Sync now did, then reloads the words", async () => {
    stubNavigation();
    const api = stubFetch({
      "GET /api/ads/search-terms": { from: "2026-09-28", to: "2026-11-26", coverage: { SP_SEARCH: { days: 40, expectedDays: 60 } }, settings: wordSettings(), products: [] },
      "POST /api/sync/ads": { requested: 1, stored: 0, failed: 0, pending: 1, rows: 0, errors: ["SB_SEARCH: HTTP 429"] },
    });
    openApp("/Ads/MainKeywords?filterId=missing-title-words&from=2026-09-28&to=2026-11-26", { realData: true });
    await vi.waitFor(() => expect(document.querySelector("[data-words-status] [data-zero-sync]")).not.toBeNull());
    document.querySelector("[data-zero-sync]").click();
    await vi.waitFor(() => expect(document.querySelector("#toast")?.textContent).toBe("Sync finished with problems: SB_SEARCH: HTTP 429. Some reports are still being prepared."));
    await vi.waitFor(() => expect(api.mock.calls.filter(([url]) => String(url).startsWith("/api/ads/search-terms"))).toHaveLength(2));
  });

  it("loads the words view of the search terms, and reloads for another filter", async () => {
    stubNavigation();
    const api = stubFetch({
      "GET /api/ads/search-terms": { from: "2026-09-28", to: "2026-11-26", coverage: full, settings: wordSettings(), products: [{ ...product, products: [product],
        words: [{ ...word("counter", 41, 5), searchTerms: [{ term: "best jump rope counter", impressions: 6, clicks: 2, orders: 1, units: 1, sales: 19.99, spend: 1.87, conversion: 50, cpc: 0.94, acos: 9.35, roas: 10.69, ctr: 33.33, lastSeen: "2026-10-13" }] }] }] },
    });
    openApp("/Ads/MainKeywords?filterId=missing-title-words&from=2026-09-28&to=2026-11-26", { realData: true });
    await vi.waitFor(() => expect(grid("words-products")).not.toBeNull());
    const asked = new URL(String(api.mock.calls[0][0]), location.origin);
    expect(Object.fromEntries(asked.searchParams)).toEqual({ view: "words", from: "2026-09-28", to: "2026-11-26", filterId: "missing-title-words" });
    const [row] = bodyRows(grid("words-products"));
    expect(row.textContent).toContain("B0PRODUCTA");
    expect(row.textContent).toContain("Cordless Battle Ropes for Home Gym");
    expect(row.lastElementChild.textContent).toBe("1");
    row.querySelector("[data-gdet]").click();
    await vi.waitFor(() => expect(grid("words-product-0")).not.toBeNull());
    const [counter] = bodyRows(grid("words-product-0"));
    for (const value of ["Brands", "counter", "32", "141", "41", "5", "$40.64", "$104.95", "29.08%", "$0.99", "12.20%", "38.72%", "2.58", "false", "22-Nov-26"]) expect(counter.textContent).toContain(value);
    counter.querySelector("[data-gdet]").click();
    await vi.waitFor(() => expect(grid("words-product-0-terms-0")).not.toBeNull());
    expect(bodyRows(grid("words-product-0-terms-0"))[0].textContent).toContain("13-Oct-26");
    const select = document.querySelector("[data-words-filter]");
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(api.mock.calls).toHaveLength(2));
    expect(new URL(String(api.mock.calls[1][0]), location.origin).searchParams.get("filterId")).toBe("");
    await vi.waitFor(() => expect(location.search).toContain("filterId="));
  });
});
