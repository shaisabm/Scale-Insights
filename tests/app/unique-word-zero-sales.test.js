// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { openApp, stubNavigation } from "./load-app.js";

const card = () => document.querySelector("[data-uw-card]");
const bodyRows = (root = card()) => [...root.querySelectorAll(":scope tbody > tr[data-k]")];
const heads = table => [...table.querySelectorAll(":scope > thead th")].map(th => th.textContent.replace(/[↓↑]/g, "").trim());
const grid = id => document.querySelector(`[data-grid="${id}"]`);

describe("Unique Word with 0 Sales card", () => {
  it("lists sample words with 25 or more clicks and no orders, most clicks first", async () => {
    stubNavigation();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    expect(card().querySelector("h3").textContent).toBe("Unique Word with 0 Sales");
    expect(heads(card().querySelector("table.grid"))).toEqual(["Product", "Sponsored", "Word", "Impressions", "Clicks", "Spend"]);
    const rows = bodyRows();
    expect(rows.length).toBeGreaterThan(0);
    const clicks = rows.map(tr => Number(tr.children[4].textContent));
    expect(clicks).toEqual([...clicks].sort((a, b) => b - a));
    expect(clicks.every(n => n >= 25)).toBe(true);
    const link = new URL(card().querySelector("a.see").href);
    expect([link.pathname, link.searchParams.get("filterId")]).toEqual(["/Ads/MainKeywords", "unique-word-zero-sales"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("edits the word options and filters of the original card", async () => {
    stubNavigation();
    vi.stubGlobal("fetch", vi.fn());
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(card()?.querySelector("table.grid")).toBeTruthy());
    document.querySelector("[data-edit=uw]").click();
    const boxes = [...document.querySelectorAll(".modal-wrap .zero-edit > label:not(.field)")].map(l => [l.textContent.trim(), l.querySelector("input").checked]);
    expect(boxes).toEqual([["Show tracked columns in Overview", true], ["Hide ASINs", true], ["Hide words if they appear in Title", false]]);
    expect(document.querySelector(".modal-wrap [data-min=clicks]").value).toBe("25");
    expect(document.querySelector(".modal-wrap [data-max=orders]").value).toBe("0");
    expect(document.querySelector(".modal-wrap [data-track=impressions]").checked).toBe(true);
    expect(document.querySelector(".modal-wrap [data-track=clicks]").checked).toBe(true);
    expect(document.querySelector(".modal-wrap [data-track=spend]").checked).toBe(true);
    expect(document.querySelector(".modal-wrap [data-track=orders]").checked).toBe(false);
  });
});

describe("Main words report", () => {
  it("opens with the Unique Word with 0 Sales filter from the query string", async () => {
    stubNavigation();
    vi.stubGlobal("fetch", vi.fn());
    const filterId = "unique-word-zero-sales";
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-uw-card] table.grid")).toBeTruthy());
    const link = new URL(document.querySelector("[data-uw-card] a.see").href);
    openApp(`${link.pathname}${link.search}`, { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-words-filter]").value).toBe(filterId));
    await vi.waitFor(() => expect(bodyRows(grid("words-products")).length).toBeGreaterThan(0));
  });
});