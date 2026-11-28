import { SEARCH_INSIGHT_DEFAULTS as INSIGHT_DEFAULTS, WORD_INSIGHT_DEFAULTS, loadZeroSettings } from "../../server/ads/insight-settings.js";
import { searchTerms, ALL_TERMS } from "../../server/ads/search-terms.js";
import { ALL_WORDS, mainWords, wordInsight } from "../../server/ads/words.js";
import { insightQuery } from "../../server/ads/zero-sales.js";
import { requireUser } from "../../server/auth.js";
import { getDb } from "../../server/db.js";
import { json } from "../../server/http.js";

// GET /api/ads/search-terms with from/to (or days), and optionally a search term filterId: the
// Search terms page. With view=words, the words of those search terms by product for the Main words
// page, optionally with a word filterId; with view=word-insight, one page (page, pageSize) of a word
// insight card's words, which needs its filterId. Filters come from the filter's saved settings.
export async function GET(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams, query = insightQuery(params);
  const filterId = params.get("filterId") || "", view = params.get("view") || "";
  const words = view === "words" || view === "word-insight";
  const defaults = words ? WORD_INSIGHT_DEFAULTS : INSIGHT_DEFAULTS;
  if (!query || (view && !words) || (filterId && !Object.hasOwn(defaults, filterId)) || (view === "word-insight" && !filterId)) return json({ error: "Invalid search term filters." }, 400);
  if (!process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Amazon Ads is not configured." }, 500);
  const db = getDb(), profileId = process.env.AMAZON_ADS_PROFILE_ID;
  const settings = filterId ? await loadZeroSettings(db, profileId, defaults[filterId]) : words ? ALL_WORDS : ALL_TERMS;
  const report = view === "word-insight" ? wordInsight : view === "words" ? mainWords : searchTerms;
  return json({ ...await report(db, { profileId, ...query, settings }), filterId });
}
