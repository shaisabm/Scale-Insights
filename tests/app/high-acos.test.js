// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { openApp, stubFetch, stubNavigation } from "./load-app.js";

// The High ACOS card shares the 0 Sales card's machinery; these cover what differs: its own
// defaults (ACOS from 50% up, worst first), its own dialog, endpoint and saved settings.
const page = (page, rows, settings = acosSettings()) => ({
  page, pageSize: 7, total: rows.length, rows: rows.slice(page * 7, page * 7 + 7),
  totals: { impressions: 1000, clicks: 50, spend: 30, sales: 25, acos: 120, pl: -30 },
  coverage: { SP_SEARCH: { days: 30, expectedDays: 30 }, SB_SEARCH: { days: 30, expectedDays: 30 } },
  ...(settings ? { settings } : {}),
});
const acosSettings = (overrides = {}) => ({ name: "Search Terms with High ACOS", description: "", showTracked: true, hideAsins: true, hideKeywords: false, sort: "acos", dir: "desc", filters: { acos: { min: 50 } }, track: ["impressions", "clicks", "sales", "acos"], order: [], ...overrides });
const rows = [
  { term: "worst term", sponsored: "Products", impressions: 400, clicks: 20, spend: 14.5, sales: 10, acos: 145 },
  { term: "middle term", sponsored: "Products", impressions: 300, clicks: 15, spend: 8, sales: 10, acos: 80 },
  { term: "high asin term", sponsored: "Products", impressions: 200, clicks: 10, spend: 6, sales: 5, acos: 120, asin: "B0HIGHACOS1" },
  { term: "cheap term", sponsored: "Products", impressions: 100, clicks: 5, spend: 1.5, sales: 5, acos: 30 },
];

describe("Search Terms with High ACOS card", () => {
  it("starts with the 50% ACOS default filter, worst first, on sample data", async () => {
    stubNavigation();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-hacos-card] table.grid")).not.toBeNull());
    const card = document.querySelector("[data-hacos-card]");
    expect(card.querySelector("h3").textContent).toBe("Search Terms with High ACOS");
    expect([...card.querySelectorAll("thead th")].map(th => th.dataset.gcol)).not.toContain("campaignId");
    expect([...card.querySelectorAll("thead th")].map(th => th.dataset.gcol)).not.toContain("adGroupId");
    // The ASIN term and the two under 50% ACOS are filtered out by the defaults, worst ACOS first.
    const bodyRows = () => [...card.querySelectorAll("tbody tr[data-k]")];
    expect(bodyRows().map(tr => tr.textContent)).toHaveLength(7); // first page of 8
    expect(bodyRows()[0].textContent).toContain("weighted jump rope");
    expect(bodyRows()[6].textContent).toContain("adjustable jump rope");
    expect(card.textContent).not.toContain("B0JUMP99XY");
    expect(card.textContent).not.toContain("leather jump rope");
    // The card has its own Edit button, like the 0 Sales card.
    expect(card.querySelector("[data-edit=acos]").textContent).toContain("Edit");
    // Nothing is saved anywhere on sample data.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("edits the same settings as the 0 Sales card, with the ACOS filter instead", async () => {
    stubNavigation();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-hacos-card] table.grid")).not.toBeNull());
    document.querySelector("[data-edit=acos]").click();
    const field = sel => document.querySelector(`.modal-wrap ${sel}`);
    expect([field("[data-z=name]").value, field("[data-z=sort]").value, field("[data-min=acos]").value, field("[data-max=acos]").value]).toEqual(["Search Terms with High ACOS", "acos:desc", "50", ""]);
    // Raising the minimum to 100% keeps only the four terms at 100% or more; saving keeps the
    // dialog open only on errors.
    field("[data-min=acos]").value = "100";
    field("[data-ok]").click();
    await vi.waitFor(() => expect(document.querySelector("[data-hacos-card] tbody tr[data-k]").textContent).toContain("weighted jump rope"));
    expect([...document.querySelectorAll("[data-hacos-card] tbody tr[data-k]")]).toHaveLength(4);
    expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelector(".modal-wrap")).toBeNull();
  });

  it("loads both cards from their own endpoints, and edits save to the High ACOS one", async () => {
    stubNavigation();
    const saves = [];
    const keywords = rows.filter(r => r.acos >= 50 && !r.asin); // as the server applies the saved settings
    const api = stubFetch({
      "GET /api/ads/zero-sales": page(0, rows.filter(r => r.spend >= 10), { name: "Wasted terms", description: "", showTracked: true, hideAsins: true, hideKeywords: false, sort: "spend", dir: "desc", filters: { spend: { min: 10 }, orders: { max: 0 } }, track: ["impressions", "clicks"], order: [] }),
      // The report echoes the settings as saved, as the real route loads them from the database.
      "GET /api/ads/high-acos": () => page(0, keywords, saves.length ? acosSettings(saves[saves.length - 1][1]) : acosSettings()),
      "GET /api/ads/performing": page(0, []),
      "PUT /api/ads/high-acos-settings": init => { saves.push(["acos", JSON.parse(init.body)]); return { settings: JSON.parse(init.body) }; },
    });
    openApp("/Ads", { realData: true });
    await vi.waitFor(() => expect(document.querySelector("[data-hacos-card] table.grid")).not.toBeNull());
    const urls = api.mock.calls.map(([url]) => String(url));
    expect(urls.some(u => u.includes("/api/ads/zero-sales"))).toBe(true);
    expect(urls.some(u => u.includes("/api/ads/high-acos"))).toBe(true);
    // Each card shows its own data under its own settings.
    expect(document.querySelector("[data-zero-card] h3").textContent).toBe("Wasted terms");
    expect(document.querySelector("[data-hacos-card] tbody tr[data-k]").textContent).toContain("worst term");
    // Editing the High ACOS card saves to its endpoint alone, with the same columns.
    document.querySelector("[data-edit=acos]").click();
    document.querySelector(".modal-wrap [data-z=name]").value = "Costly terms";
    document.querySelector(".modal-wrap [data-ok]").click();
    await vi.waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0][0]).toBe("acos");
    const saved = saves[0][1];
    expect([saved.name, saved.filters]).toEqual(["Costly terms", { acos: { min: 50 } }]);
    await vi.waitFor(() => expect(document.querySelector("[data-hacos-card] h3").textContent).toBe("Costly terms"));
    expect(saves.every(([kind]) => kind === "acos")).toBe(true);
  });
});
