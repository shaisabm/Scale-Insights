// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { openApp, stubFetch, stubNavigation } from "./load-app.js";

// The Performing Search Terms card shares the other insight cards' machinery; these cover what
// differs: its own defaults (conversion from 15% up, best first), its dialog, endpoint and settings.
const page = (page, rows, settings = perfSettings()) => ({
  page, pageSize: 7, total: rows.length, rows: rows.slice(page * 7, page * 7 + 7),
  totals: { impressions: 1000, clicks: 50, spend: 30, sales: 25, acos: 120, conversion: 12, pl: -30 },
  coverage: { SP_SEARCH: { days: 30, expectedDays: 30 }, SB_SEARCH: { days: 30, expectedDays: 30 } },
  ...(settings ? { settings } : {}),
});
const perfSettings = (overrides = {}) => ({ name: "Performing Search Terms", description: "", showTracked: true, hideAsins: true, hideKeywords: false, sort: "conversion", dir: "desc", filters: { conversion: { min: 15 } }, track: ["impressions", "clicks", "orders", "sales", "conversion"], order: [], ...overrides });
const rows = [
  { term: "best term", sponsored: "Products", impressions: 400, clicks: 20, orders: 8, sales: 40, conversion: 40 },
  { term: "middle term", sponsored: "Products", impressions: 300, clicks: 15, orders: 4, sales: 20, conversion: 26.7 },
  { term: "strong asin term", sponsored: "Products", impressions: 200, clicks: 10, orders: 4, sales: 20, conversion: 40, asin: "B0PERFORMS1" },
  { term: "weak term", sponsored: "Products", impressions: 100, clicks: 5, orders: 0, sales: 0, conversion: 0 },
];

describe("Performing Search Terms card", () => {
  it("starts with the 15% conversion default filter, best first, on sample data", async () => {
    stubNavigation();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-perf-card] table.grid")).not.toBeNull());
    const card = document.querySelector("[data-perf-card]");
    expect(card.querySelector("h3").textContent).toBe("Performing Search Terms");
    // The ASIN term and the two terms under 15% conversion (7.1% and 10%) are filtered out by the
    // defaults, best conversion first: 57.1% leather down to 23% adjustable on the first page.
    const bodyRows = () => [...card.querySelectorAll("tbody tr[data-k]")];
    expect(bodyRows().map(tr => tr.textContent)).toHaveLength(7); // first page of 11
    expect(bodyRows()[0].textContent).toContain("leather jump rope");
    expect(bodyRows()[6].textContent).toContain("adjustable jump rope");
    expect(card.textContent).not.toContain("B0JUMP99XY");
    expect(card.textContent).not.toContain("digital counting jump rope");
    // The card has its own Edit button, like the other insight cards.
    expect(card.querySelector("[data-edit=perf]").textContent).toContain("Edit");
    // Nothing is saved anywhere on sample data.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("edits the same settings as the other cards, with the conversion filter instead", async () => {
    stubNavigation();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-perf-card] table.grid")).not.toBeNull());
    document.querySelector("[data-edit=perf]").click();
    const field = sel => document.querySelector(`.modal-wrap ${sel}`);
    expect([field("[data-z=name]").value, field("[data-z=sort]").value, field("[data-min=conversion]").value, field("[data-max=conversion]").value]).toEqual(["Performing Search Terms", "conversion:desc", "15", ""]);
    // Raising the minimum to 35% keeps only the terms converting at 35% or more (leather 57.1%,
    // kids 36.7%); saving keeps the dialog open only on errors.
    field("[data-min=conversion]").value = "35";
    field("[data-ok]").click();
    await vi.waitFor(() => expect(document.querySelector("[data-perf-card] tbody tr[data-k]").textContent).toContain("leather jump rope"));
    expect([...document.querySelectorAll("[data-perf-card] tbody tr[data-k]")]).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelector(".modal-wrap")).toBeNull();
  });

  it("loads all three cards from their own endpoints, and edits save to the Performing one", async () => {
    stubNavigation();
    const saves = [];
    const strong = rows.filter(r => r.conversion >= 15 && !r.asin); // as the server applies the saved settings
    const api = stubFetch({
      "GET /api/ads/zero-sales": page(0, rows, { name: "Wasted terms", description: "", showTracked: true, hideAsins: true, hideKeywords: false, sort: "spend", dir: "desc", filters: { spend: { min: 10 }, orders: { max: 0 } }, track: ["impressions", "clicks"], order: [] }),
      // The reports echo the settings as saved, as the real routes load them from the database.
      "GET /api/ads/high-acos": () => page(0, rows, { name: "Costly terms", description: "", showTracked: true, hideAsins: true, hideKeywords: false, sort: "acos", dir: "desc", filters: { acos: { min: 50 } }, track: ["impressions", "clicks", "sales", "acos"], order: [] }),
      "GET /api/ads/performing": () => page(0, strong, saves.length ? perfSettings(saves[saves.length - 1][1]) : perfSettings()),
      "PUT /api/ads/performing-settings": init => { saves.push(["perf", JSON.parse(init.body)]); return { settings: JSON.parse(init.body) }; },
    });
    openApp("/Ads", { realData: true });
    await vi.waitFor(() => expect(document.querySelector("[data-perf-card] table.grid")).not.toBeNull());
    const urls = api.mock.calls.map(([url]) => String(url));
    expect(urls.some(u => u.includes("/api/ads/zero-sales"))).toBe(true);
    expect(urls.some(u => u.includes("/api/ads/high-acos"))).toBe(true);
    expect(urls.some(u => u.includes("/api/ads/performing"))).toBe(true);
    // Each card shows its own data under its own settings.
    expect(document.querySelector("[data-zero-card] h3").textContent).toBe("Wasted terms");
    expect(document.querySelector("[data-hacos-card] h3").textContent).toBe("Costly terms");
    expect(document.querySelector("[data-perf-card] tbody tr[data-k]").textContent).toContain("best term");
    // Editing the Performing card saves to its endpoint alone, with the same columns.
    document.querySelector("[data-edit=perf]").click();
    document.querySelector(".modal-wrap [data-z=name]").value = "Winning terms";
    document.querySelector(".modal-wrap [data-ok]").click();
    await vi.waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0][0]).toBe("perf");
    const saved = saves[0][1];
    expect([saved.name, saved.filters]).toEqual(["Winning terms", { conversion: { min: 15 } }]);
    await vi.waitFor(() => expect(document.querySelector("[data-perf-card] h3").textContent).toBe("Winning terms"));
    expect(saves.every(([kind]) => kind === "perf")).toBe(true);
  });
});
