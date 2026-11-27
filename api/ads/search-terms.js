import { INSIGHT_DEFAULTS, loadZeroSettings } from "../../server/ads/insight-settings.js";
import { searchTerms, ALL_TERMS } from "../../server/ads/search-terms.js";
import { insightQuery } from "../../server/ads/zero-sales.js";
import { requireUser } from "../../server/auth.js";
import { getDb } from "../../server/db.js";
import { json } from "../../server/http.js";

export async function GET(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams, query = insightQuery(params);
  const filterId = params.get("filterId") || "";
  if (!query || (filterId && !Object.hasOwn(INSIGHT_DEFAULTS, filterId))) return json({ error: "Invalid search term filters." }, 400);
  if (!process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Amazon Ads is not configured." }, 500);
  const db = getDb(), profileId = process.env.AMAZON_ADS_PROFILE_ID;
  const settings = filterId ? await loadZeroSettings(db, profileId, INSIGHT_DEFAULTS[filterId]) : ALL_TERMS;
  return json({ ...await searchTerms(db, { profileId, ...query, settings }), filterId });
}
