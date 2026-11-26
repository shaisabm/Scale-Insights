import { loadZeroSettings } from "../../server/ads/insight-settings.js";
import { zeroSales, insightQuery } from "../../server/ads/zero-sales.js";
import { requireUser } from "../../server/auth.js";
import { getDb } from "../../server/db.js";
import { json } from "../../server/http.js";

// GET /api/ads/zero-sales?from=YYYY-MM-DD&to=YYYY-MM-DD (or days=7|14|30, ending yesterday;
// the default is the last 30 days) and page. Filters, sort and columns come from the profile's
// saved settings (PUT /api/ads/zero-sales-settings), which the response includes.
export async function GET(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  const query = insightQuery(new URL(request.url).searchParams);
  if (!query) return json({ error: "Invalid search term filters." }, 400);
  if (!process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Amazon Ads is not configured." }, 500);
  const db = getDb(), profileId = process.env.AMAZON_ADS_PROFILE_ID;
  return json(await zeroSales(db, { profileId, ...query, settings: await loadZeroSettings(db, profileId) }));
}
