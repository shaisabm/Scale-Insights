// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openApp, stubFetch, stubNavigation } from "./load-app.js";

const realTrend = {
  from: "2026-07-25",
  to: "2026-11-21",
  days: [{ adProduct: "SP", date: "2026-11-01", impressions: 100, clicks: 4, cost: 2, orders: 1, units: 1, sales: 25 }],
  synced: { SP: { first: "2026-08-24", last: "2026-11-21", syncedAt: "2026-11-22T14:00:00.000Z" } },
};
const dataSwitch = () => document.querySelector(".data-switch input");
const trendCalls = fetch => fetch.mock.calls.filter(([url]) => url === "/api/ads/trend").length;
const flip = on => {
  dataSwitch().checked = on;
  dataSwitch().dispatchEvent(new Event("change", { bubbles: true }));
};

beforeEach(() => localStorage.clear());

// Makes reading or saving the data-source choice throw, as a browser that blocks storage does.
const storageSpies = [];
function blockStorage(method) {
  const original = Storage.prototype[method];
  storageSpies.push(vi.spyOn(Storage.prototype, method).mockImplementation(function (key, ...rest) {
    if (key === "sp-data-source") throw new DOMException("The operation is insecure.", "SecurityError");
    return original.call(this, key, ...rest);
  }));
}

describe("when browser storage is blocked", () => {
  afterEach(() => storageSpies.splice(0).forEach(spy => spy.mockRestore()));

  it("starts on sample data when the saved choice can't be read", async () => {
    blockStorage("getItem");
    const fetch = stubFetch({});
    stubNavigation();
    openApp("/Ads/AdvertisingTrend", { env: "preview" });
    expect(dataSwitch().checked).toBe(false);
    await vi.waitFor(() => expect(document.querySelector(".meta").textContent).toContain("Sample data"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still switches when the choice can't be saved, and says it won't be remembered", async () => {
    blockStorage("setItem");
    const fetch = stubFetch({ "GET /api/ads/trend": realTrend });
    stubNavigation();
    openApp("/Ads/AdvertisingTrend", { env: "preview" });
    await vi.waitFor(() => expect(document.querySelector("table.trend")).not.toBeNull());
    flip(true);
    await vi.waitFor(() => expect(document.querySelector("[data-sync]")).not.toBeNull());
    expect(trendCalls(fetch)).toBe(1);
    expect(document.querySelector("#toast").textContent).toContain("won't be remembered");
    flip(false);
    await vi.waitFor(() => expect(document.querySelector(".meta").textContent).toContain("Sample data"));
  });
});

describe("when the switch is flipped quickly", () => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 20));

  it("shows only the latest choice, even if an older load finishes last", async () => {
    let finish;
    stubFetch({ "GET /api/ads/trend": () => new Promise(resolve => (finish = resolve)) });
    stubNavigation();
    openApp("/Ads/AdvertisingTrend", { env: "preview" });
    await vi.waitFor(() => expect(document.querySelector("table.trend")).not.toBeNull());
    flip(true);
    flip(false);
    await vi.waitFor(() => expect(document.querySelector(".meta").textContent).toContain("Sample data"));
    finish(realTrend);
    await settle();
    expect(document.querySelector(".meta").textContent).toContain("Sample data");
    expect(document.querySelector("[data-sync]")).toBeNull();
  });

  it("ignores an error from an older load", async () => {
    let fail;
    stubFetch({ "GET /api/ads/trend": () => new Promise(resolve => (fail = () => resolve({ status: 500, json: { error: "Database down" } }))) });
    stubNavigation();
    openApp("/Ads/AdvertisingTrend", { env: "preview" });
    await vi.waitFor(() => expect(document.querySelector("table.trend")).not.toBeNull());
    flip(true);
    flip(false);
    await vi.waitFor(() => expect(document.querySelector(".meta").textContent).toContain("Sample data"));
    fail();
    await settle();
    expect(document.querySelector(".placeholder")).toBeNull();
    expect(document.querySelector(".meta").textContent).toContain("Sample data");
  });
});

describe("in production", () => {
  it("has no switch and always loads the real account", async () => {
    const fetch = stubFetch({ "GET /api/ads/trend": realTrend });
    stubNavigation();
    openApp("/Ads/AdvertisingTrend", { env: "production", realData: false });
    expect(document.querySelector(".data-switch")).toBeNull();
    await vi.waitFor(() => expect(document.querySelector("[data-sync]")).not.toBeNull());
    expect(trendCalls(fetch)).toBe(1);
  });
});

describe.each(["preview", "development"])("in %s", env => {
  it("starts on sample data without calling the API or asking to sign in", async () => {
    const fetch = stubFetch({});
    const assign = stubNavigation();
    openApp("/Ads/AdvertisingTrend", { env });
    expect(dataSwitch().checked).toBe(false);
    await vi.waitFor(() => expect(document.querySelectorAll("table.trend")).toHaveLength(3));
    expect(fetch).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(document.querySelector('tr[data-metric="ppcSales"] td').textContent).not.toBe("$0.00");
    expect(document.querySelector(".meta").textContent).toContain("Sample data");
    expect(document.querySelector("[data-sync]")).toBeNull();
  });

  it("switches to the real account and remembers the choice", async () => {
    const fetch = stubFetch({ "GET /api/ads/trend": realTrend });
    stubNavigation();
    openApp("/Ads/AdvertisingTrend", { env });
    await vi.waitFor(() => expect(document.querySelector("table.trend")).not.toBeNull());
    flip(true);
    await vi.waitFor(() => expect(document.querySelector("[data-sync]")).not.toBeNull());
    expect(trendCalls(fetch)).toBe(1);
    expect(document.querySelector(".meta").textContent).toContain("last synced");
    expect(localStorage.getItem("sp-data-source")).toBe("real");

    openApp("/Ads/AdvertisingTrend", { env });
    expect(dataSwitch().checked).toBe(true);
    await vi.waitFor(() => expect(trendCalls(fetch)).toBe(2));
  });

  it("goes back to sample data when switched off", async () => {
    const fetch = stubFetch({ "GET /api/ads/trend": realTrend });
    stubNavigation();
    openApp("/Ads/AdvertisingTrend", { env, realData: true });
    await vi.waitFor(() => expect(document.querySelector("[data-sync]")).not.toBeNull());
    flip(false);
    await vi.waitFor(() => expect(document.querySelector(".meta").textContent).toContain("Sample data"));
    expect(trendCalls(fetch)).toBe(1);
    expect(localStorage.getItem("sp-data-source")).toBe("sample");
  });

  it("asks a signed-out person to sign in once real data is on", async () => {
    stubFetch({ "GET /api/ads/trend": { status: 401, json: { error: "Sign in required." } } });
    const assign = stubNavigation();
    openApp("/Ads/AdvertisingTrend", { env, realData: true });
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/Identity/Login?next=%2FAds%2FAdvertisingTrend"));
  });
});
