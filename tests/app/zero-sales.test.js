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

// The card's column headers, and a drag between two of them as the browser sends it: start on one
// header, then over and onto another.
const headers = () => [...document.querySelectorAll("[data-zero-card] thead th")];
const labels = () => headers().map(th => th.textContent.replace(/[↓↑]/g, "").trim());
const header = label => headers().find(th => th.textContent.includes(label));
function drag(from, to) {
  const data = new Map(), dataTransfer = { setData: (k, v) => data.set(k, v), getData: k => data.get(k), effectAllowed: "", dropEffect: "" };
  const fire = (el, type) => el.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer }));
  const source = header(from), target = header(to);
  fire(source, "dragstart");
  fire(target, "dragover");
  fire(target, "drop");
}
// A promise and the function that settles it, for replies a test releases when it chooses.
function later() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const savedSettings = order => ({ name: "Search Terms with 0 Sales", description: "", showTracked: true, hideAsins: true, hideKeywords: false, sort: "spend", dir: "desc", filters: {}, track: ["impressions", "clicks", "pl"], order });

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
    const bodyRows = () => [...card.querySelectorAll("tbody tr[data-k]")];
    expect(bodyRows()).toHaveLength(7);
    expect(bodyRows()[0].textContent).toContain("search term 1");
    expect(card.querySelector(".sumrow").textContent).toContain("11,222");
    expect(card.querySelector(".sumrow").textContent).toContain("103");
    // The pager is the table's last row, right under the totals and as wide as the table.
    const pagerRow = card.querySelector("[data-zero-pager]").closest("tr");
    expect(pagerRow.previousElementSibling.classList.contains("sumrow")).toBe(true);
    expect(pagerRow.nextElementSibling).toBeNull();
    expect(pagerRow.querySelector("td").getAttribute("colspan")).toBe(String(card.querySelector(".sumrow").children.length));
    expect(pagerRow.textContent).toContain("Page 1 of 2");
    card.querySelector("[data-zero-next]").click();
    await vi.waitFor(() => expect(bodyRows()[0].textContent).toContain("search term 8"));
    expect(bodyRows()).toHaveLength(4);
    expect(card.querySelector(".sumrow").textContent).toContain("400");
    expect(card.querySelector("[data-zero-next]").disabled).toBe(true);
    card.querySelector("[data-zero-prev]").click();
    await vi.waitFor(() => expect(bodyRows()[0].textContent).toContain("search term 1"));
    expect(fetch.mock.calls.some(([url]) => String(url).includes("page=1"))).toBe(true);
  });

  it("makes every setting editable and saves them to the account", async () => {
    stubNavigation();
    let saved = null;
    const fetch = vi.fn(async (url, init = {}) => {
      if (init.method === "PUT") saved = JSON.parse(init.body);
      const body = init.method === "PUT" ? { settings: saved } : { ...response(0), ...(saved ? { settings: saved } : {}) };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    document.querySelector("[data-edit=st0]").click();
    const dialog = document.querySelector(".modal-wrap");
    const field = sel => dialog.querySelector(sel);
    // Everything is editable except Break even bid, which needs product costs.
    const disabled = [...dialog.querySelectorAll("input, select")].filter(i => i.disabled);
    expect(disabled.map(i => i.dataset.min || i.dataset.max || i.dataset.track)).toEqual(["breakEvenBid", "breakEvenBid", "breakEvenBid"]);
    expect([field("[data-z=name]").value, field("[data-z=sort]").value, field("[data-min=spend]").value, field("[data-max=orders]").value]).toEqual(["Search Terms with 0 Sales", "spend:desc", "10", "0"]);
    expect([field("[data-z=showTracked]").checked, field("[data-z=hideAsins]").checked, field("[data-z=hideKeywords]").checked]).toEqual([true, true, false]);
    expect(field("[data-z=sort]").textContent).toContain("Cost in Descending Order");
    field("[data-z=name]").value = "Wasted search terms";
    field("[data-z=description]").value = "Negate these.";
    field("[data-z=hideKeywords]").checked = true;
    field("[data-z=sort]").value = "clicks:asc";
    field("[data-min=clicks]").value = "5";
    field("[data-track=orders]").checked = true;
    field("[data-track=pl]").checked = false;
    field("[data-ok]").click();
    await vi.waitFor(() => expect(saved).not.toBeNull());
    expect(saved).toEqual({
      name: "Wasted search terms", description: "Negate these.", showTracked: true, hideAsins: true, hideKeywords: true, sort: "clicks", dir: "asc",
      filters: { clicks: { min: 5 }, orders: { max: 0 }, spend: { min: 10 } }, track: ["impressions", "clicks", "orders"], order: [], pageSize: 7,
    });
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] h3").textContent).toBe("Wasted search terms"));
    expect(document.querySelector(".modal-wrap")).toBeNull();
    expect(document.querySelector("[data-zero-card] footer").textContent).toBe("Negate these.");
    expect([...document.querySelectorAll("[data-zero-card] thead th")].map(th => th.textContent.replace(/[↓↑]/g, "").trim())).toEqual(["Product", "Sponsored", "Search term", "Impressions", "Clicks", "Orders"]);
  });

  it("lets column headers be dragged left or right, and saves the new order", async () => {
    stubNavigation();
    let saved = null;
    const fetch = vi.fn(async (url, init = {}) => {
      if (init.method === "PUT") saved = JSON.parse(init.body);
      return new Response(JSON.stringify(init.method === "PUT" ? { settings: saved } : response(0)), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    expect(labels()).toEqual(["Product", "Sponsored", "Search term", "Impressions", "Clicks", "P&L"]);
    expect(header("Clicks").getAttribute("draggable")).toBe("true");

    // Dragged left onto Impressions, P&L lands before it, and its cells move with it.
    drag("P&L", "Impressions");
    expect(labels()).toEqual(["Product", "Sponsored", "Search term", "P&L", "Impressions", "Clicks"]);
    expect([...document.querySelector("[data-zero-card] .sumrow").children].map(td => td.textContent.trim()).slice(3)).toEqual(["($75.35)", "11,222", "103"]);
    await vi.waitFor(() => expect(saved?.order).toEqual(["p", "sp", "term", "pl", "impressions", "clicks"]));

    // Dragged right onto Clicks, Product lands after it.
    drag("Product", "Clicks");
    expect(labels()).toEqual(["Sponsored", "Search term", "P&L", "Impressions", "Clicks", "Product"]);
    await vi.waitFor(() => expect(saved.order).toEqual(["sp", "term", "pl", "impressions", "clicks", "p"]));

    // Saving the Edit dialog keeps the order.
    saved = null;
    document.querySelector("[data-edit=st0]").click();
    document.querySelector(".modal-wrap [data-ok]").click();
    await vi.waitFor(() => expect(saved).not.toBeNull());
    expect(saved.order).toEqual(["sp", "term", "pl", "impressions", "clicks", "p"]);
  });

  it("keeps a dragged column order when a page that was already loading arrives afterwards", async () => {
    stubNavigation();
    const pending = later();
    let loads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      if (init.method === "PUT") return json({ settings: JSON.parse(init.body) });
      // Only the zero-sales card's loads are choreographed; the other card's resolve at once.
      if (!String(url).includes("/api/ads/zero-sales")) return json(response(0));
      // The first load answers at once; the second waits until the test releases it.
      return ++loads === 1 ? json({ ...response(0), settings: savedSettings([]) }) : pending.promise;
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    document.querySelector("[data-zero-card] [data-zero-next]").click();
    drag("P&L", "Impressions");
    const moved = ["Product", "Sponsored", "Search term", "P&L", "Impressions", "Clicks"];
    expect(labels()).toEqual(moved);
    // Page 2 was read before the drag, with the old order.
    pending.resolve(json({ ...response(1), settings: savedSettings([]) }));
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] tbody tr[data-k]").textContent).toContain("search term 8"));
    expect(labels()).toEqual(moved);
  });

  it("keeps a dragged column order when a page load started while its save was still going", async () => {
    stubNavigation();
    const save = later(), page = later();
    let loads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      if (init.method === "PUT") return save.promise;
      // Only the zero-sales card's loads are choreographed; the other card's resolve at once.
      if (!String(url).includes("/api/ads/zero-sales")) return json(response(0));
      // The first load answers at once; the pager's load waits until the test releases it.
      return ++loads === 1 ? json({ ...response(0), settings: savedSettings([]) }) : page.promise;
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    drag("P&L", "Impressions");
    const moved = ["Product", "Sponsored", "Search term", "P&L", "Impressions", "Clicks"];
    expect(labels()).toEqual(moved);
    // Page 2 is requested while the drag's save is still going; only then does the save land,
    // so the page's reply carries the old order even though nothing is pending any more.
    document.querySelector("[data-zero-card] [data-zero-next]").click();
    save.resolve(json({ settings: savedSettings(["p", "sp", "term", "pl", "impressions", "clicks"]) }));
    await new Promise(resolve => setTimeout(resolve, 20));
    page.resolve(json({ ...response(1), settings: savedSettings([]) }));
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] tbody tr[data-k]").textContent).toContain("search term 8"));
    expect(labels()).toEqual(moved);
  });

  it("saves settings one at a time, so the last change made is the one stored", async () => {
    stubNavigation();
    const saves = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      if (init.method !== "PUT") return json(response(0));
      const reply = later();
      saves.push({ order: JSON.parse(init.body).order, reply });
      return reply.promise;
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    drag("P&L", "Impressions");
    await vi.waitFor(() => expect(saves).toHaveLength(1));
    drag("Clicks", "Product");
    // The second save waits for the first to finish.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(saves).toHaveLength(1);
    saves[0].reply.resolve(json({ settings: savedSettings(saves[0].order) }));
    await vi.waitFor(() => expect(saves).toHaveLength(2));
    expect(saves.map(x => x.order)).toEqual([["p", "sp", "term", "pl", "impressions", "clicks"], ["clicks", "p", "sp", "term", "pl", "impressions"]]);
    saves[1].reply.resolve(json({ settings: savedSettings(saves[1].order) }));
  });

  it("keeps both the dialog's changes and a column dragged while they were saving", async () => {
    stubNavigation();
    const saves = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      if (init.method !== "PUT") return json({ ...response(0), settings: savedSettings([]) });
      const reply = later();
      saves.push({ body: JSON.parse(init.body), reply });
      return reply.promise;
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    document.querySelector("[data-edit=st0]").click();
    document.querySelector(".modal-wrap [data-z=name]").value = "Renamed";
    document.querySelector(".modal-wrap [data-ok]").click();
    await vi.waitFor(() => expect(saves).toHaveLength(1));
    // A column moves while the dialog's save is still going.
    drag("P&L", "Impressions");
    const moved = ["p", "sp", "term", "pl", "impressions", "clicks"];
    saves[0].reply.resolve(json({ settings: saves[0].body }));
    await vi.waitFor(() => expect(saves).toHaveLength(2));
    // The save sent last carries both changes.
    expect([saves[1].body.name, saves[1].body.order]).toEqual(["Renamed", moved]);
    saves[1].reply.resolve(json({ settings: saves[1].body }));
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] h3").textContent).toBe("Renamed"));
    expect(headers().map(th => th.dataset.gcol)).toEqual(moved);
  });

  it("puts the dialog's changes back if the account refuses them", async () => {
    stubNavigation();
    const bodies = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      if (init.method !== "PUT") return json(response(0));
      bodies.push(JSON.parse(init.body));
      return bodies.length === 1 ? new Response(JSON.stringify({ error: "Choose a sort order from the list." }), { status: 400, headers: { "Content-Type": "application/json" } }) : json({ settings: bodies.at(-1) });
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    document.querySelector("[data-edit=st0]").click();
    document.querySelector(".modal-wrap [data-z=name]").value = "Refused";
    document.querySelector(".modal-wrap [data-ok]").click();
    await vi.waitFor(() => expect(document.querySelector("#toast").textContent).toBe("Choose a sort order from the list."));
    expect(document.querySelector(".modal-wrap")).not.toBeNull();
    document.querySelector(".modal-wrap [data-close]").click();
    // The next save sends the settings as they were, with the new column order.
    drag("P&L", "Impressions");
    await vi.waitFor(() => expect(bodies).toHaveLength(2));
    expect([bodies[1].name, bodies[1].order]).toEqual(["Search Terms with 0 Sales", ["p", "sp", "term", "pl", "impressions", "clicks"]]);
  });

  it("redraws the card without a refused edit that a page load showed meanwhile", async () => {
    stubNavigation();
    const page = later(), save = later();
    let loads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      if (init.method === "PUT") return save.promise;
      if (!String(url).includes("/api/ads/zero-sales")) return json(response(0));
      return ++loads === 1 ? json({ ...response(0), settings: savedSettings([]) }) : page.promise;
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    const title = () => document.querySelector("[data-zero-card] h3").textContent;
    document.querySelector("[data-zero-card] [data-zero-next]").click();
    document.querySelector("[data-edit=st0]").click();
    document.querySelector(".modal-wrap [data-z=name]").value = "Refused";
    document.querySelector(".modal-wrap [data-ok]").click();
    // Page 2 arrives while the save is still going, so it shows the edit.
    page.resolve(json({ ...response(1), settings: savedSettings([]) }));
    await vi.waitFor(() => expect(title()).toBe("Refused"));
    save.resolve(new Response(JSON.stringify({ error: "Choose a sort order from the list." }), { status: 400, headers: { "Content-Type": "application/json" } }));
    await vi.waitFor(() => expect(title()).toBe("Search Terms with 0 Sales"));
    expect(document.querySelector("#toast").textContent).toBe("Choose a sort order from the list.");
  });

  it("stores a second edit when the first one's save is refused", async () => {
    stubNavigation();
    const saves = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      if (init.method !== "PUT") return json({ ...response(0), settings: savedSettings([]) });
      const reply = later();
      saves.push({ body: JSON.parse(init.body), reply });
      return reply.promise;
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    document.querySelector("[data-edit=st0]").click();
    const field = sel => document.querySelector(`.modal-wrap ${sel}`);
    field("[data-z=name]").value = "First";
    field("[data-ok]").click();
    await vi.waitFor(() => expect(saves).toHaveLength(1));
    // The dialog stays open while its save goes, so it can be saved again.
    field("[data-z=name]").value = "Second";
    field("[data-z=description]").value = "Two";
    field("[data-ok]").click();
    saves[0].reply.resolve(new Response(JSON.stringify({ error: "Choose a sort order from the list." }), { status: 400, headers: { "Content-Type": "application/json" } }));
    await vi.waitFor(() => expect(saves).toHaveLength(2));
    expect([saves[1].body.name, saves[1].body.description]).toEqual(["Second", "Two"]);
    saves[1].reply.resolve(json({ settings: saves[1].body }));
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] h3").textContent).toBe("Second"));
  });

  it("lets the rows per page be chosen, saves it, and says which rows are showing", async () => {
    stubNavigation();
    let saved = null;
    const asked = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      if (init.method === "PUT") { saved = JSON.parse(init.body); return json({ settings: saved }); }
      const params = new URL(url, location.origin).searchParams, page = Number(params.get("page")), size = Number(params.get("pageSize") || 7);
      asked.push([page, size]);
      return json({ ...response(0), page, pageSize: size, rows: terms.slice(page * size, (page + 1) * size) });
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    const pager = () => document.querySelector("[data-zero-card] [data-zero-pager]");
    expect(pager().querySelector(".zero-showing").textContent).toBe("1–7 of 11");
    // The shared-product badge's class would pull the count out of the pager.
    expect(pager().querySelector(".zero-count")).toBeNull();
    expect(pager().textContent).toContain("Page 1 of 2");
    const size = pager().querySelector("[data-zero-size]");
    expect([...size.options].map(o => o.value)).toEqual(["7", "10", "20", "30", "50"]);
    expect(size.value).toBe("7");
    size.value = "10";
    size.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(pager().textContent).toContain("1–10 of 11"));
    expect(document.querySelectorAll("[data-zero-card] tbody tr[data-k]")).toHaveLength(10);
    expect(asked.at(-1)).toEqual([0, 10]);
    await vi.waitFor(() => expect(saved?.pageSize).toBe(10));
    expect(pager().querySelector("[data-zero-size]").value).toBe("10");
    pager().querySelector("[data-zero-next]").click();
    await vi.waitFor(() => expect(pager().querySelector(".zero-showing").textContent).toBe("11 of 11"));
    expect(pager().textContent).toContain("Page 2 of 2");
    expect(asked.at(-1)).toEqual([1, 10]);
  });

  it("keeps focus on the rows per page menu through the redraw, unless it has moved", async () => {
    stubNavigation();
    const replies = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      if (init.method === "PUT") return json({ settings: JSON.parse(init.body) });
      const params = new URL(url, location.origin).searchParams, page = Number(params.get("page")), size = Number(params.get("pageSize") || 7);
      const body = { ...response(0), page, pageSize: size, rows: terms.slice(page * size, (page + 1) * size) };
      if (params.has("pageSize")) { const reply = later(); replies.push(reply); await reply.promise; }
      return json(body);
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    const menu = () => document.querySelector("[data-zero-card] [data-zero-size]");
    const showing = () => document.querySelector("[data-zero-card] .zero-showing").textContent;
    const choose = n => { menu().focus(); menu().value = String(n); menu().dispatchEvent(new Event("change", { bubbles: true })); };
    choose(10);
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    replies[0].resolve();
    await vi.waitFor(() => expect(showing()).toBe("1–10 of 11"));
    expect(document.activeElement).toBe(menu());
    // Focus moved elsewhere while the page loads stays where it was put.
    choose(20);
    await vi.waitFor(() => expect(replies).toHaveLength(2));
    const edit = document.querySelector("[data-zero-card] [data-edit]");
    edit.focus();
    replies[1].resolve();
    await vi.waitFor(() => expect(showing()).toBe("1–11 of 11"));
    expect(document.activeElement).toBe(edit);
  });

  it("pages on from a rows per page reset that's still loading, not from the page it replaces", async () => {
    stubNavigation();
    const many = Array.from({ length: 30 }, (_, i) => ({ ...terms[i % terms.length], term: `search term ${i + 1}` }));
    const asked = [], held = [];
    let hold = false;
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      if (init.method === "PUT") return json({ settings: JSON.parse(init.body) });
      const params = new URL(url, location.origin).searchParams, page = Number(params.get("page")), size = Number(params.get("pageSize") || 7);
      asked.push([page, size]);
      if (hold) { const reply = later(); held.push(reply); await reply.promise; }
      const at = Math.max(0, Math.min(page, Math.ceil(many.length / size) - 1));
      return json({ ...response(0), page: at, pageSize: size, total: many.length, rows: many.slice(at * size, (at + 1) * size) });
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    const pager = () => document.querySelector("[data-zero-card] [data-zero-pager]");
    const showing = () => pager().querySelector(".zero-showing").textContent;
    const choose = n => { const size = pager().querySelector("[data-zero-size]"); size.value = String(n); size.dispatchEvent(new Event("change", { bubbles: true })); };
    pager().querySelector("[data-zero-next]").click();
    await vi.waitFor(() => expect(showing()).toBe("8–14 of 30"));
    pager().querySelector("[data-zero-next]").click();
    await vi.waitFor(() => expect(showing()).toBe("15–21 of 30"));
    // Next is pressed on the old pager before the first page at 10 rows arrives.
    hold = true;
    choose(10);
    pager().querySelector("[data-zero-next]").click();
    await vi.waitFor(() => expect(asked.slice(-2)).toEqual([[0, 10], [1, 10]]));
    held.splice(0).forEach(r => r.resolve());
    await vi.waitFor(() => expect(showing()).toBe("11–20 of 30"));
    expect(pager().textContent).toContain("Page 2 of 3");
    // Previous from a reset that's still loading stays on the first page.
    choose(20);
    pager().querySelector("[data-zero-prev]").click();
    await vi.waitFor(() => expect(asked.slice(-2)).toEqual([[0, 20], [0, 20]]));
    held.splice(0).forEach(r => r.resolve());
    await vi.waitFor(() => expect(showing()).toBe("1–20 of 30"));
  });

  it("pages from the first page at a new rows per page whose page failed to load", async () => {
    stubNavigation();
    const many = Array.from({ length: 30 }, (_, i) => ({ ...terms[i % terms.length], term: `search term ${i + 1}` }));
    const asked = [];
    let failing = null;
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      if (init.method === "PUT") return json({ settings: JSON.parse(init.body) });
      const params = new URL(url, location.origin).searchParams, page = Number(params.get("page")), size = Number(params.get("pageSize") || 7);
      asked.push([page, size]);
      if (failing) return new Response(JSON.stringify({ error: failing }), { status: 500, headers: { "Content-Type": "application/json" } });
      const at = Math.max(0, Math.min(page, Math.ceil(many.length / size) - 1));
      return json({ ...response(0), page: at, pageSize: size, total: many.length, rows: many.slice(at * size, (at + 1) * size) });
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    const pager = () => document.querySelector("[data-zero-card] [data-zero-pager]");
    const showing = () => pager().querySelector(".zero-showing").textContent;
    const next = async expected => { pager().querySelector("[data-zero-next]").click(); await vi.waitFor(() => expect(asked.at(-1)).toEqual(expected)); };
    await next([1, 7]);
    await next([2, 7]);
    await vi.waitFor(() => expect(showing()).toBe("15–21 of 30"));
    // The 10 rows per page is saved, but its first page fails, leaving page 3 at 7 rows on screen.
    failing = "Search terms are unavailable.";
    const size = pager().querySelector("[data-zero-size]");
    size.value = "10";
    size.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(asked.at(-1)).toEqual([0, 10]));
    await vi.waitFor(() => expect(document.body.textContent).toContain("Search terms are unavailable."));
    failing = null;
    await next([1, 10]);
    await vi.waitFor(() => expect(showing()).toBe("11–20 of 30"));
    // A failed page at the same size still pages on from the page on screen.
    failing = "Search terms are still unavailable.";
    await next([2, 10]);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Search terms are still unavailable."));
    failing = null;
    await next([2, 10]);
    await vi.waitFor(() => expect(showing()).toBe("21–30 of 30"));
  });

  it("starts over at a rows per page saved elsewhere, so the pager and its requests agree", async () => {
    stubNavigation();
    const asked = [];
    let account = 7;
    vi.stubGlobal("fetch", vi.fn(async url => {
      const params = new URL(url, location.origin).searchParams, page = Number(params.get("page")), size = Number(params.get("pageSize") || account);
      asked.push([page, size]);
      return json({ ...response(0), page, pageSize: size, rows: terms.slice(page * size, (page + 1) * size), settings: { ...savedSettings([]), pageSize: account } });
    }));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    const pager = () => document.querySelector("[data-zero-card] [data-zero-pager]");
    expect(pager().querySelector(".zero-showing").textContent).toBe("1–7 of 11");
    // Another tab saves 10 rows per page while this one shows 7.
    account = 10;
    pager().querySelector("[data-zero-next]").click();
    await vi.waitFor(() => expect(pager().querySelector(".zero-showing").textContent).toBe("1–10 of 11"));
    expect(asked.slice(-2)).toEqual([[1, 7], [0, 10]]);
    expect(pager().querySelector("[data-zero-size]").value).toBe("10");
    pager().querySelector("[data-zero-next]").click();
    await vi.waitFor(() => expect(pager().querySelector(".zero-showing").textContent).toBe("11 of 11"));
    expect(asked.at(-1)).toEqual([1, 10]);
  });

  it("refuses a min above its max and keeps the dialog open", async () => {
    stubNavigation();
    const fetch = vi.fn(async () => new Response(JSON.stringify(response(0)), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    document.querySelector("[data-edit=st0]").click();
    document.querySelector(".modal-wrap [data-min=impressions]").value = "50";
    document.querySelector(".modal-wrap [data-max=impressions]").value = "10";
    document.querySelector(".modal-wrap [data-ok]").click();
    expect(document.querySelector(".modal-wrap")).not.toBeNull();
    expect(document.querySelector("#toast").textContent).toBe("The min for Impressions is above its max.");
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("shows only the tracked columns, or none when tracked columns are turned off", async () => {
    stubNavigation();
    const settings = { name: "Mine", description: "", showTracked: true, hideAsins: true, hideKeywords: false, sort: "spend", dir: "desc", filters: {}, track: ["orders", "spend", "roas"] };
    const rows = [{ term: "jump rope", sponsored: "Products", impressions: 10, clicks: 2, orders: 1, units: 1, spend: 4.5, sales: 9, roas: 2, pl: null }];
    let show = true;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...response(0), rows, total: 1, totals: { orders: 1, spend: 4.5, roas: 2 }, settings: { ...settings, showTracked: show } }), { status: 200, headers: { "Content-Type": "application/json" } })));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    const heads = () => [...document.querySelectorAll("[data-zero-card] thead th")].map(th => th.textContent.replace(/[↓↑]/g, "").trim());
    expect(heads()).toEqual(["Product", "Sponsored", "Search term", "Orders", "ROAS", "Spend"]);
    expect(document.querySelector("[data-zero-card] tbody tr").textContent).toContain("$4.50");
    expect(document.querySelector("[data-zero-card] tbody tr").textContent).toContain("2.00");
    show = false;
    document.querySelector("[data-apply]").click();
    await vi.waitFor(() => expect(heads()).toEqual(["Product", "Sponsored", "Search term"]));
  });

  it("applies settings to sample data without saving anything", async () => {
    stubNavigation();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    openApp("/Ads", { env: "preview", realData: false });
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] table.grid")).not.toBeNull());
    expect(document.querySelectorAll("[data-zero-card] tbody tr[data-k]")).toHaveLength(6);
    document.querySelector("[data-edit=st0]").click();
    document.querySelector(".modal-wrap [data-z=hideKeywords]").checked = true;
    document.querySelector(".modal-wrap [data-ok]").click();
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] tr.empty")).not.toBeNull());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the latest request's results when an older response arrives last", async () => {
    stubNavigation();
    const replies = [];
    const json = body => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn(url => {
      // Only the zero-sales card's loads are held for the test to release; the other card's resolve at once.
      if (!String(url).includes("/api/ads/zero-sales")) return Promise.resolve(json(response(0)));
      return new Promise(resolve => replies.push(body => resolve(json(body))));
    }));
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

  it("leaves Orders, Units, Sales, Conversion, ACOS and ROAS blank when they're 0", async () => {
    stubNavigation();
    // Tracked in the card's column order: clicks, orders, units, conversion, ACOS, ROAS, sales.
    const track = ["clicks", "orders", "units", "conversion", "acos", "roas", "sales"];
    const settings = { name: "Search Terms with 0 Sales", description: "", showTracked: true, hideAsins: true, hideKeywords: false, sort: "spend", dir: "desc", filters: {}, track };
    const zero = { clicks: 4, orders: 0, units: 0, conversion: 0, acos: 0, roas: 0, sales: 0 };
    const body = { ...response(0), settings, total: 2, totals: zero, rows: [
      { term: "no sales", sponsored: "Products", ...zero },
      { term: "sold", sponsored: "Products", clicks: 10, orders: 2, units: 3, conversion: 20, acos: 25, roas: 4, sales: 40 },
    ] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] tbody tr[data-k]")).not.toBeNull());
    const card = document.querySelector("[data-zero-card]");
    // The metric cells come after Product, Sponsored and Search term.
    const metrics = tr => [...tr.children].slice(3).map(td => td.textContent.trim());
    const [none, sold] = card.querySelectorAll("tbody tr[data-k]");
    expect(metrics(none)).toEqual(["4", "", "", "", "", "", ""]);
    expect(metrics(sold)).toEqual(["10", "2", "3", "20.00%", "25.00%", "4.00", "$40.00"]);
    expect(metrics(card.querySelector(".sumrow"))).toEqual(["4", "", "", "", "", "", ""]);
  });

  it("marks a shared ad group's row with a count badge, and shows every product's photo on hover", async () => {
    stubNavigation();
    const products = [{ asin: "B0PRODUCTA", title: "Pink Ropes", image: "/api/ads/product-image?asin=B0PRODUCTA" }, { asin: "B0PRODUCTB", title: "", image: null }];
    const body = { ...response(0), rows: [{ term: "battle ropes", sponsored: "Products", impressions: 5, clicks: 2, pl: -3, asin: "B0PRODUCTA,B0PRODUCTB", title: "Pink Ropes", image: products[0].image, products }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-card] [data-zero-multi]")).not.toBeNull());
    const multi = document.querySelector("[data-zero-card] [data-zero-multi]");
    // The first product's photo at full size, a badge counting the others, and every product named.
    expect(multi.querySelector(":scope > img.zero-thumb").getAttribute("src")).toBe("/api/ads/product-image?asin=B0PRODUCTA");
    expect(multi.querySelector(".zero-count").textContent).toBe("+1");
    // Titles can repeat across variants, so each product is also named by its ASIN.
    expect(multi.getAttribute("aria-label")).toBe("Pink Ropes (B0PRODUCTA) + B0PRODUCTB");
    expect(multi.getAttribute("tabindex")).toBe("0");
    // The hover panel shows each product's photo side by side, named by title and ASIN.
    const panel = multi.querySelector(".zero-pop");
    expect([...panel.querySelectorAll("figure")].map(f => [f.querySelector("img")?.getAttribute("src") ?? null, f.querySelector("figcaption").textContent]))
      .toEqual([["/api/ads/product-image?asin=B0PRODUCTA", "Pink RopesB0PRODUCTA"], [null, "B0PRODUCTB"]]);
    // Hovering places the panel beside the photo, outside the table's scrolling area.
    multi.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(panel.style.left).not.toBe("");
    expect(document.querySelector("[data-zero-card] .zero-split")).toBeNull();
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

  it("says how much spend is left out because its product can't be confirmed", async () => {
    stubNavigation();
    const body = { ...response(0), coverage: {
      SP_SEARCH: { days: 30, expectedDays: 30, unattributedSpend: 0 },
      SB_SEARCH: { days: 30, expectedDays: 30, mapReady: true, unattributedSpend: 45.5 },
    } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
    openApp("/Ads");
    await vi.waitFor(() => expect(document.querySelector("[data-zero-status]")).not.toBeNull());
    const status = document.querySelector("[data-zero-status]");
    expect(status.textContent).toBe("$45.50 of Sponsored Brands spend can't be matched to the products it advertised on its dates, so its search terms are left out.");
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
