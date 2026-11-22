import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

// The browser scripts in the order app/src/index.html loads them.
// (Paths are built with node:path because happy-dom replaces the global URL.)
const SCRIPTS = ["core", "sales", "products", "ads", "more", "account", "optimizer", "app"];
const APP_SRC = join(dirname(fileURLToPath(import.meta.url)), "../../app/src");
const src = name => readFileSync(join(APP_SRC, name), "utf8");
const html = src("index.html");
const BODY = html.slice(html.indexOf("<body>") + "<body>".length, html.indexOf("<script"));
const SOURCES = SCRIPTS.map(name => src(`${name}.js`));

/**
 * Opens `path` in a fresh copy of the app shell and runs the scripts, as a page load would.
 * `env` is the Vercel environment build.mjs writes into the page; `realData` presets the
 * Real data switch (otherwise the stored choice is kept).
 */
export function openApp(path, { env = "production", realData } = {}) {
  history.replaceState(null, "", path);
  if (realData !== undefined) localStorage.setItem("sp-data-source", realData ? "real" : "sample");
  window.SP_ENV = env;
  document.body.innerHTML = BODY;
  for (const code of SOURCES) window.eval(code);
  return window.SP;
}

/**
 * Stubs fetch with `routes`: { "GET /api/x": body | (init) => body }. A body of
 * { status, json } sets the status. Unknown routes answer 404.
 */
export function stubFetch(routes) {
  const fetch = vi.fn(async (url, init = {}) => {
    const key = `${init.method || "GET"} ${new URL(url, location.origin).pathname}`;
    let reply = key in routes ? routes[key] : { status: 404, json: { error: "Not found" } };
    if (typeof reply === "function") reply = await reply(init);
    const { status = 200, json = reply } = reply && "json" in reply ? reply : { json: reply };
    return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** Records location.assign calls instead of navigating. */
export function stubNavigation() {
  return vi.spyOn(location, "assign").mockImplementation(() => {});
}
