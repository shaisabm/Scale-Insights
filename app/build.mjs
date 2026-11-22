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
const shell = readFileSync("src/index.html", "utf8");
for (const p of paths) {
  mkdirSync(join("dist", p), { recursive: true });
  writeFileSync(join("dist", p, "index.html"), shell);
}
writeFileSync(join("dist", "404.html"), shell);
console.log(`Built dist/ with ${paths.size + 1} pages:\n  /\n  ${[...paths].sort().join("\n  ")}`);
