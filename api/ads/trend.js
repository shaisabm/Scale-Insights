import { adsTrend } from "../../server/ads/trend.js";
import { requireUser } from "../../server/auth.js";
import { getDb } from "../../server/db.js";
import { addDays, isoDate, json, todayIn } from "../../server/http.js";

// GET /api/ads/trend?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults: the 120 days up to yesterday).
export async function GET(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const to = isoDate(params.get("to")) || addDays(todayIn(process.env.AMAZON_ADS_TIME_ZONE || "America/Los_Angeles"), -1);
  const from = isoDate(params.get("from")) || addDays(to, -119);
  if (from > to || addDays(from, 400) < to) return json({ error: "Use a date range of at most 400 days." }, 400);
  if (!process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Amazon Ads is not configured." }, 500);
  return json(await adsTrend(getDb(), { profileId: process.env.AMAZON_ADS_PROFILE_ID, from, to }));
}
