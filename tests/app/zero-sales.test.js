// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { openApp, stubNavigation } from "./load-app.js";

const terms = Array.from({ length: 11 }, (_, i) => ({ term: `search term ${i + 1}`, sponsored: i % 3 === 0 ? "Brands" : "Products", impressions: 100 + i, clicks: 10 + i, pl: i % 3 === 0 ? null : -(20 + i) }));

function response(page) {
  return {
    page, pageSize: 7, total: terms.length,
    rows: terms.slice(page * 7, page * 7 + 7),
    totals: page ? { impressions: 400, clicks: 40, pl: -22 } : { impressions: 11222, clicks: 103, pl: -75.35 },
    coverage: { SP_SEARCH: { days: 30, expectedDays: 30 }, SB_SEARCH: { days: 30, expectedDays: 30 } },
  };
}

// Opens the card's date range picker and chooses a preset.
function pickRange(preset) {
  document.querySelector("[data-zero-card]").closest(".page").querySelector("[data-range]").click();
  [...document.querySelectorAll(".popover button")].find(b => b.textContent === preset).click();
}

describe("Search Terms with 0 Sales card", () => {
  it("shows seven rows, then the remaining rows, with each page's footer totals", async () => {
    stubNavigation();
    const fetch = vi.fn(async url => new Response(JSON.stringify(response(Number(new URL(url, location.origin).searchParams.get("page") || 0))), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    const card = document.querySelector("[data-zero-card]");
    expect(document.body.textContent).toContain("Live data for this insight is not connected yet.");
    expect(document.body.textContent).not.toContain("cordless jump rope");
    const bodyRows = () => [...card.querySelectorAll("tbody tr:not(.sumrow)")];
    expect(bodyRows()).toHaveLength(7);
    expect(bodyRows()[0].textContent).toContain("search term 1");
    expect(card.querySelector(".sumrow").textContent).toContain("11,222");
    expect(card.querySelector(".sumrow").textContent).toContain("103");
    card.querySelector("[data-zero-next]").click();
    await vi.waitFor(() => expect(bodyRows()[0].textContent).toContain("search term 8"));
    expect(bodyRows()).toHaveLength(4);
    expect(card.querySelector(".sumrow").textContent).toContain("400");
    expect(card.querySelector("[data-zero-next]").disabled).toBe(true);
    card.querySelector("[data-zero-prev]").click();
    await vi.waitFor(() => expect(bodyRows()[0].textContent).toContain("search term 1"));
    expect(fetch.mock.calls.some(([url]) => String(url).includes("page=1"))).toBe(true);
  });

  it("opens the reference filter settings and applies edited spend/order limits", async () => {
    stubNavigation();
    const fetch = vi.fn(async () => new Response(JSON.stringify(response(0)), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card]")).not.toBeNull());
    document.querySelector("[data-edit=st0]").click();
    const dialog = document.querySelector(".modal-wrap");
    expect(dialog.textContent).toContain("Search Terms with 0 Sales");
    expect(dialog.textContent).toContain("Cost in Descending Order");
    expect(dialog.querySelector("[data-zero-spend]").value).toBe("10.00");
    expect(dialog.querySelector("[data-zero-orders]").value).toBe("0");
    expect(dialog.querySelector("[data-zero-asins]").checked).toBe(true);
    dialog.querySelector("[data-zero-spend]").value = "15";
    dialog.querySelector("[data-zero-orders]").value = "1";
    dialog.querySelector("[data-ok]").click();
    await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes("minSpend=15") && String(url).includes("maxOrders=1"))).toBe(true));
  });

  it("keeps the latest request's results when an older response arrives last", async () => {
    stubNavigation();
    const replies = [];
    const json = body => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => replies.push(body => resolve(json(body))))));
    const withTerm = term => ({ ...response(0), total: 1, rows: [{ term, sponsored: "Products", impressions: 1, clicks: 1, pl: -1 }] });
    const firstRow = () => document.querySelector("[data-zero-card] tbody tr:not(.sumrow)").textContent;
    openApp("/Ads");
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    replies[0](response(0));
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    for (const preset of ["Last 14 Days", "Last 7 Days"]) pickRange(preset);
    await vi.waitFor(() => expect(replies).toHaveLength(3));
    replies[2](withTerm("latest seven-day term"));
    await vi.waitFor(() => expect(firstRow()).toContain("latest seven-day term"));
    replies[1](withTerm("older fourteen-day term"));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(firstRow()).toContain("latest seven-day term");
  });

  it("warns until Sponsored Brands search terms can be matched to products", async () => {
    stubNavigation();
    const coverage = mapReady => ({ SP_SEARCH: { days: 30, expectedDays: 30 }, SB_SEARCH: { days: 30, expectedDays: 30, mapReady } });
    let ready = false;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...response(0), coverage: coverage(ready) }), { status: 200, headers: { "Content-Type": "application/json" } })));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-status]")).not.toBeNull());
    expect(document.querySelector("[data-zero-status]").textContent).toContain("matched to products");
    ready = true;
    document.querySelector("[data-apply]").click();
    await vi.waitFor(() => expect(document.querySelector("[data-zero-status]")).toBeNull());
  });

  it("shows each product's own image, served by this site", async () => {
    stubNavigation();
    const body = { ...response(0), rows: [{ term: "battle ropes", sponsored: "Products", impressions: 5, clicks: 2, pl: -3, asin: "B0PRODUCTA", title: "Cordless Battle Ropes", image: "/api/ads/product-image?asin=B0PRODUCTA" }, { term: "jump rope", sponsored: "Brands", impressions: 4, clicks: 1, pl: null, asin: "B0PRODUCTB", title: "", image: null }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    const img = document.querySelector("[data-zero-card] img.zero-thumb");
    expect(img.getAttribute("src")).toBe("/api/ads/product-image?asin=B0PRODUCTA");
    expect(img.getAttribute("alt")).toBe("Cordless Battle Ropes");
    expect(document.querySelectorAll("[data-zero-card] img.zero-thumb")).toHaveLength(1);
    expect(document.querySelector("[data-zero-card] .zero-product")).not.toBeNull();
  });

  it("offers every date range preset and asks for the picked dates", async () => {
    stubNavigation();
    const fetch = vi.fn(async () => new Response(JSON.stringify(response(0)), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const SP = openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    const button = document.querySelector("[data-range]");
    expect(button.textContent).toContain(`Last 30 Days: ${SP.shortDate(SP.addDays(SP.today, -30))} - ${SP.shortDate(SP.addDays(SP.today, -1))}`);
    button.click();
    expect([...document.querySelectorAll(".popover button")].map(b => b.textContent)).toEqual(["Today", "Yesterday", "Last 7 Days", "Last 14 Days", "Last 30 Days", "Last 60 Days", "Last 90 Days", "This Month", "Last Month", "This Year", "Last Year", "Custom Range"]);
    [...document.querySelectorAll(".popover button")].find(b => b.textContent === "Last Month").click();
    const lastMonth = SP.rangeFor("Last Month");
    await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes(`from=${SP.iso(lastMonth.from)}&to=${SP.iso(lastMonth.to)}&page=0`))).toBe(true));
    expect(button.textContent).toContain("Last Month:");
  });

  it("asks for a custom range, and refuses one that ends before it starts", async () => {
    stubNavigation();
    const fetch = vi.fn(async () => new Response(JSON.stringify(response(0)), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    pickRange("Custom Range");
    const dialog = document.querySelector(".modal-wrap");
    const set = (from, to) => { dialog.querySelector("[name=from]").value = from; dialog.querySelector("[name=to]").value = to; dialog.querySelector("[data-ok]").click(); };
    set("2026-11-10", "2026-11-01");
    expect(document.querySelector(".modal-wrap")).not.toBeNull();
    expect(document.querySelector("#toast").textContent).toContain("start date on or before the end date");
    set("2026-11-01", "2026-11-10");
    await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes("from=2026-11-01&to=2026-11-10"))).toBe(true));
    expect(document.querySelector("[data-range]").textContent).toContain("1 Nov 26 - 10 Nov 26");
  });

  it("explains dates Amazon doesn't provide without offering a sync for them", async () => {
    stubNavigation();
    const body = { ...response(0), from: "2026-01-01", to: "2026-11-22", coverage: {
      SP_SEARCH: { days: 90, expectedDays: 90, availableFrom: "2026-08-24", reportedThrough: "2026-11-21" },
      SB_SEARCH: { days: 60, expectedDays: 60, availableFrom: "2026-09-23", reportedThrough: "2026-11-21", mapReady: true },
    } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-status]")).not.toBeNull());
    const status = document.querySelector("[data-zero-status]");
    expect(status.textContent).toContain("Amazon only keeps recent search terms: Sponsored Products from 24 Aug 26, Sponsored Brands from 23 Sep 26.");
    expect(status.textContent).toContain("Amazon hasn't reported search terms after 21 Nov 26 yet.");
    expect(status.querySelector("[data-zero-sync]")).toBeNull();
  });
});

describe("SP.rangeFor", () => {
  it("works out every preset from today", async () => {
    const SP = openApp("/");
    const today = new Date(2026, 10, 22);
    const range = preset => { const r = SP.rangeFor(preset, today); return [SP.iso(r.from), SP.iso(r.to)]; };
    expect(range("Today")).toEqual(["2026-11-22", "2026-11-22"]);
    expect(range("Yesterday")).toEqual(["2026-11-21", "2026-11-21"]);
    expect(range("Last 7 Days")).toEqual(["2026-11-15", "2026-11-21"]);
    expect(range("Last 30 Days")).toEqual(["2026-10-23", "2026-11-21"]);
    expect(range("Last 90 Days")).toEqual(["2026-08-24", "2026-11-21"]);
    expect(range("This Month")).toEqual(["2026-11-01", "2026-11-22"]);
    expect(range("Last Month")).toEqual(["2026-10-01", "2026-10-31"]);
    expect(range("This Year")).toEqual(["2026-01-01", "2026-11-22"]);
    expect(range("Last Year")).toEqual(["2025-01-01", "2025-12-31"]);
    expect(SP.rangeFor("Last Month", new Date(2026, 0, 15)).from.getFullYear()).toBe(2025);
  });
});
