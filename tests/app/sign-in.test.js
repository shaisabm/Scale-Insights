// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { openApp, stubFetch, stubNavigation } from "./load-app.js";

function submit(password) {
  document.querySelector("[name=password]").value = password;
  document.querySelector("#signin").dispatchEvent(new Event("submit", { cancelable: true }));
}

describe("sign-in page", () => {
  it("signs in and goes back to the page that asked", async () => {
    const fetch = stubFetch({ "POST /api/login": { signedIn: true } });
    const assign = stubNavigation();
    openApp("/Identity/Login?next=%2FAds%2FAdvertisingTrend");
    expect(document.querySelector("#page-title-text").textContent).toBe("Sign in");
    submit("hunter2");
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/Ads/AdvertisingTrend"));
    expect(fetch).toHaveBeenCalledWith("/api/login", expect.objectContaining({ method: "POST", body: '{"password":"hunter2"}' }));
  });

  it("only follows same-site paths after sign-in", async () => {
    stubFetch({ "POST /api/login": { signedIn: true } });
    const assign = stubNavigation();
    openApp("/Identity/Login?next=%2F%2Fevil.example%2Fpage");
    submit("hunter2");
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("says so when the password is wrong, and stays put", async () => {
    stubFetch({ "POST /api/login": { status: 401, json: { error: "Wrong password." } } });
    const assign = stubNavigation();
    openApp("/Identity/Login");
    submit("nope");
    await vi.waitFor(() => expect(document.querySelector(".signin-error").hidden).toBe(false));
    expect(document.querySelector(".signin-error").textContent).toBe("That password isn't right.");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("log out", () => {
  it("clears the session and goes to the sign-in page", async () => {
    const fetch = stubFetch({ "POST /api/logout": { signedIn: false } });
    const assign = stubNavigation();
    openApp("/");
    document.querySelector("#logout").click();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/Identity/Login"));
    expect(fetch).toHaveBeenCalledWith("/api/logout", expect.objectContaining({ method: "POST" }));
  });
});
