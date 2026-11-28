import { createAdsClient } from "../../server/amazon/ads.js";
import { SEARCH_PRODUCTS, TARGETING_PRODUCTS, syncAds } from "../../server/ads/sync.js";
import { requireUser, secretMatches } from "../../server/auth.js";
import { adsConfig } from "../../server/config.js";
import { getDb } from "../../server/db.js";
import { json } from "../../server/http.js";

// Vercel Cron calls GET with "Authorization: Bearer <CRON_SECRET>". A signed-in person can POST to sync now.
export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  if (!secretMatches(auth.replace(/^Bearer /, ""), process.env.CRON_SECRET)) return json({ error: "Not allowed." }, 401);
  return run();
}

export async function POST(request) {
  return requireUser(request) || run();
}

async function run() {
  const cfg = adsConfig();
  const summary = await syncAds({ db: getDb(), ads: createAdsClient(cfg), profileId: cfg.profileId, timeZone: cfg.timeZone, products: ["SP", "SB", "SD", ...SEARCH_PRODUCTS, ...TARGETING_PRODUCTS], budgetMs: 45_000 });
  return json(summary);
}
