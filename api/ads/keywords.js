import { KEYWORD_INSIGHT_DEFAULTS, loadZeroSettings } from "../../server/ads/insight-settings.js";
import { keywordInsight } from "../../server/ads/keywords.js";
import { insightQuery } from "../../server/ads/zero-sales.js";
import { requireUser } from "../../server/auth.js";
import { getDb } from "../../server/db.js";
import { json } from "../../server/http.js";

// GET /api/ads/keywords?filterId=zero-sales-keywords (the default) with from=YYYY-MM-DD&to=YYYY-MM-DD
// (or days=7|14|30, ending yesterday; the default is the last 30 days), page and pageSize. Filters,
// sort and columns come from the filter's saved settings (PUT /api/ads/<filterId>-settings), which
// the response includes.
export async function GET(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams, query = insightQuery(params);
  const filterId = params.get("filterId") || "zero-sales-keywords";
  if (!query || !Object.hasOwn(KEYWORD_INSIGHT_DEFAULTS, filterId)) return json({ error: "Invalid keyword filters." }, 400);
  if (!process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Amazon Ads is not configured." }, 500);
  const db = getDb(), profileId = process.env.AMAZON_ADS_PROFILE_ID;
  const settings = await loadZeroSettings(db, profileId, KEYWORD_INSIGHT_DEFAULTS[filterId]);
  return json({ ...await keywordInsight(db, { profileId, ...query, settings }), filterId });
}
