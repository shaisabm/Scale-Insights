// Runs the Amazon Ads sync from this machine, for the first backfill or a manual refresh:
//   npm run sync:ads
// Like /api/sync/ads, it syncs the trend reports, both search term reports and the targeting reports.
// It waits up to SYNC_BUDGET_MS (default 10 minutes) for Amazon to finish the reports.
// VERCEL_ENV is unset locally, so the write guard keeps the real profile read-only.
import { createAdsClient } from "../server/amazon/ads.js";
import { SEARCH_PRODUCTS, TARGETING_PRODUCTS, syncAds } from "../server/ads/sync.js";
import { adsConfig } from "../server/config.js";
import { getDb } from "../server/db.js";

const cfg = adsConfig();
const budgetMs = Number(process.env.SYNC_BUDGET_MS) || 10 * 60_000;
const summary = await syncAds({ db: getDb(), ads: createAdsClient(cfg), profileId: cfg.profileId, timeZone: cfg.timeZone, products: ["SP", "SB", "SD", ...SEARCH_PRODUCTS, ...TARGETING_PRODUCTS], budgetMs });
console.log(JSON.stringify(summary, null, 2));
