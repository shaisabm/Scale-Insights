// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { openApp, stubFetch } from "./load-app.js";

it("has no floating help or chat buttons", () => {
  stubFetch({});
  openApp("/");
  expect(document.querySelector(".fab, [aria-label='Help'], [aria-label='Chat']")).toBeNull();
});
