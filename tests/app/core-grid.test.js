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

it("can leave out the search box but keep Columns, and page with the insight cards' pager", () => {
  stubFetch({});
  const SP = openApp("/");
  const host = document.createElement("div");
  document.body.append(host);
  SP.wireCommon(host);
  const rows = Array.from({ length: 32 }, (_, i) => ({ _k: String(i), name: `term ${i + 1}`, clicks: 100 - i }));
  host.innerHTML = SP.grid({ id: "rows-pager", columns: true, instantSearch: false, rowsPager: true, pageSize: 20, sortKey: "clicks", rows, cols: [{ key: "name", label: "Name" }, { key: "clicks", label: "Clicks" }] });
  const names = () => [...host.querySelectorAll("tbody tr[data-k]")].map(tr => tr.children[0].textContent);
  const pager = () => host.querySelector(".grid-foot .zero-pager");
  expect(host.querySelector("[data-gsearch]")).toBeNull();
  expect(host.querySelector("[data-gcols]").textContent).toBe("Columns");
  expect(host.querySelector(".grid-foot .pager")).toBeNull();
  expect([...pager().querySelectorAll("[data-gpsize] option")].map(o => [o.value, o.hasAttribute("selected")])).toEqual([["7", false], ["10", false], ["20", true], ["30", false], ["50", false]]);
  expect(pager().querySelector(".zero-showing").textContent).toBe("1–20 of 32");
  expect([...pager().querySelectorAll("button, :scope > span:not(.zero-showing)")].map(el => el.textContent)).toEqual(["‹ Previous", "Page 1 of 2", "Next ›"]);
  expect(pager().querySelector("[data-gpage=prev]").disabled).toBe(true);
  expect(names()).toHaveLength(20);
  pager().querySelector("[data-gpage=next]").click();
  expect(names()).toEqual(rows.slice(20).map(r => r.name));
  expect(pager().querySelector(".zero-showing").textContent).toBe("21–32 of 32");
  expect(pager().querySelector("[data-gpage=next]").disabled).toBe(true);
  const size = pager().querySelector("[data-gpsize]");
  size.value = "50";
  size.dispatchEvent(new Event("change", { bubbles: true }));
  expect(names()).toHaveLength(32);
  expect(pager().querySelector(".zero-showing").textContent).toBe("1–32 of 32");
  // One page needs no Previous or Next.
  expect(pager().querySelector("[data-gpage]")).toBeNull();
  host.remove();
});
