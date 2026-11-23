import { loadZeroSettings } from "../../server/ads/insight-settings.js";
import { zeroSales } from "../../server/ads/zero-sales.js";
import { requireUser } from "../../server/auth.js";
import { getDb } from "../../server/db.js";
import { addDays, isoDate, json, todayIn } from "../../server/http.js";

// GET /api/ads/zero-sales?from=YYYY-MM-DD&to=YYYY-MM-DD (or days=7|14|30, ending yesterday;
// the default is the last 30 days) and page. Filters, sort and columns come from the profile's
// saved settings (PUT /api/ads/zero-sales-settings), which the response includes.
export async function GET(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const today = todayIn(process.env.AMAZON_ADS_TIME_ZONE || "America/Los_Angeles");
  const days = Number(params.get("days") || 30);
  const to = params.has("to") ? isoDate(params.get("to")) : addDays(today, -1);
  const from = params.has("from") ? isoDate(params.get("from")) : to && [7, 14, 30].includes(days) ? isoDate(addDays(to, -days + 1)) : null;
  const page = Number(params.get("page") || 0);
  // At most 400 dates, counting both ends.
  const badRange = !from || !to || from > to || to > today || to > addDays(from, 399);
  if (badRange || !Number.isSafeInteger(page) || page < 0 || page > 10000) {
    return json({ error: "Invalid search term filters." }, 400);
  }
  if (!process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Amazon Ads is not configured." }, 500);
  const db = getDb(), profileId = process.env.AMAZON_ADS_PROFILE_ID;
  return json(await zeroSales(db, { profileId, from, to, today, page, settings: await loadZeroSettings(db, profileId) }));
}
