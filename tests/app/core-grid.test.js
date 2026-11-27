// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { openApp, stubFetch } from "./load-app.js";

it("keeps null grid metrics last in both sort directions", () => {
  stubFetch({});
  const SP = openApp("/");
  const rows = [
    { name: "unknown", metric: null },
    { name: "high", metric: 20 },
    { name: "low", metric: 10 },
  ];
  const sortedNames = dir => {
    const host = document.createElement("div");
    host.innerHTML = SP.grid({
      id: `null-metric-${dir}`,
      rows,
      cols: [{ key: "name", label: "Name" }, { key: "metric", label: "Metric" }],
      sortKey: "metric",
      dir,
      search: false,
      noFoot: true,
    });
    return [...host.querySelectorAll("tbody tr")].map(row => row.children[0].textContent);
  };

  expect(sortedNames(1)).toEqual(["low", "high", "unknown"]);
  expect(sortedNames(-1)).toEqual(["high", "low", "unknown"]);
});
