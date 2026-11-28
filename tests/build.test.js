import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const APP = fileURLToPath(new URL("../app/", import.meta.url));
let dir;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

// Runs app/build.mjs on a copy of app/src and returns a reader for the built pages.
function build(vercelEnv) {
  dir = mkdtempSync(join(tmpdir(), "scale-ppc-build-"));
  cpSync(join(APP, "build.mjs"), join(dir, "build.mjs"));
  cpSync(join(APP, "src"), join(dir, "src"), { recursive: true });
  const env = { ...process.env };
  delete env.VERCEL_ENV;
  if (vercelEnv) env.VERCEL_ENV = vercelEnv;
  execFileSync(process.execPath, ["build.mjs"], { cwd: dir, env, stdio: "pipe" });
  return page => readFileSync(join(dir, "dist", page), "utf8");
}

describe("app/build.mjs", () => {
  it("writes the Vercel environment into every page, before the first script", () => {
    const read = build("preview");
    for (const page of ["index.html", "404.html", "Ads/AdvertisingTrend/index.html", "Identity/Login/index.html"]) {
      expect(read(page)).toMatch(/<script>window\.SP_ENV = "preview";<\/script>\s*<script src="\/core\.js"><\/script>/);
    }
  });

  it("marks production builds as production", () => {
    expect(build("production")("index.html")).toContain('window.SP_ENV = "production";');
  });

  it("defaults to development outside Vercel", () => {
    expect(build()("index.html")).toContain('window.SP_ENV = "development";');
  });
});
