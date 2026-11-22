// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { openApp, stubFetch, stubNavigation } from "./load-app.js";

describe("SP.api", () => {
  it("returns the JSON body", async () => {
    stubFetch({ "GET /api/thing": { a: 1 } });
    const SP = openApp("/");
    expect(await SP.api.get("/api/thing")).toEqual({ a: 1 });
  });

  it("posts JSON with the session cookie", async () => {
    const fetch = stubFetch({ "POST /api/thing": { ok: true } });
    const SP = openApp("/");
    await SP.api.post("/api/thing", { x: 2 });
    expect(fetch).toHaveBeenCalledWith("/api/thing", expect.objectContaining({ method: "POST", credentials: "same-origin", body: '{"x":2}', headers: { "Content-Type": "application/json" } }));
  });

  it("sends a signed-out person to sign in and back", async () => {
    stubFetch({ "GET /api/thing": { status: 401, json: { error: "Sign in required." } } });
    const assign = stubNavigation();
    const SP = openApp("/Ads/Performance");
    await expect(SP.api.get("/api/thing")).rejects.toMatchObject({ status: 401, message: "Sign in required." });
    expect(assign).toHaveBeenCalledWith("/Identity/Login?next=%2FAds%2FPerformance");
  });

  it("throws the server's error message for other failures", async () => {
    stubFetch({ "GET /api/thing": { status: 500, json: { error: "Database down" } } });
    const assign = stubNavigation();
    const SP = openApp("/");
    await expect(SP.api.get("/api/thing")).rejects.toThrow("Database down");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("router", () => {
  it("still renders pages without load() straight away", () => {
    stubFetch({});
    openApp("/Ads/SearchTermTrend");
    expect(document.querySelector("#page-title-text").textContent).toBe("Search term trend");
    expect(document.querySelector("#stt-out")).not.toBeNull();
  });

  it("shows a loading state, then renders with the loaded data", async () => {
    let finish;
    stubFetch({ "GET /api/ads/trend": () => new Promise(resolve => (finish = resolve)) });
    stubNavigation();
    openApp("/Ads/AdvertisingTrend");
    expect(document.querySelector("#view").textContent).toContain("Loading…");
    finish({ from: "2026-09-01", to: "2026-11-21", days: [], synced: {} });
    await vi.waitFor(() => expect(document.querySelector("#adt")).not.toBeNull());
    expect(document.querySelector("#view").textContent).not.toContain("Loading…");
  });

  it("shows the error when loading fails", async () => {
    stubFetch({ "GET /api/ads/trend": { status: 500, json: { error: "Missing environment variable TURSO_DATABASE_URL" } } });
    stubNavigation();
    openApp("/Ads/AdvertisingTrend");
    await vi.waitFor(() => expect(document.querySelector(".placeholder")).not.toBeNull());
    expect(document.querySelector(".placeholder").textContent).toContain("Missing environment variable TURSO_DATABASE_URL");
  });
});
