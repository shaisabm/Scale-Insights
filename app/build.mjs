import { mkdirSync, cpSync, rmSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("src", "dist", { recursive: true });

// Every page address the scripts mention gets its own index.html, so each one opens directly.
const sections = "Sales|Products|Restock|KeywordRanking|Ads|Automation|MassCampaigns|StrategyExperts|Settings|Identity|ScaleOptimizer|AdGroupSignals";
const pattern = new RegExp(`"(/(?:${sections})(?:/[A-Za-z]+)*)"`, "g");
const paths = new Set();
for (const f of readdirSync("src").filter(f => f.endsWith(".js"))) {
  for (const m of readFileSync(join("src", f), "utf8").matchAll(pattern)) paths.add(m[1]);
}
// Pages learn which Vercel environment they run in (production, preview or development) from
// window.SP_ENV, set before the first script.
const env = process.env.VERCEL_ENV || "development";
const firstScript = '<script src="/core.js"></script>';
const source = readFileSync("src/index.html", "utf8");
if (!source.includes(firstScript)) throw new Error(`src/index.html no longer loads ${firstScript}`);
const shell = source.replace(firstScript, `<script>window.SP_ENV = ${JSON.stringify(env)};</script>\n  ${firstScript}`);
writeFileSync(join("dist", "index.html"), shell);
for (const p of paths) {
  mkdirSync(join("dist", p), { recursive: true });
  writeFileSync(join("dist", p, "index.html"), shell);
}
writeFileSync(join("dist", "404.html"), shell);
console.log(`Built dist/ (${env}) with ${paths.size + 1} pages:\n  /\n  ${[...paths].sort().join("\n  ")}`);
