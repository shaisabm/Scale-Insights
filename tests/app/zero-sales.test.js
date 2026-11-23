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
});
