import { zeroSales } from "../../server/ads/zero-sales.js";
import { requireUser } from "../../server/auth.js";
import { getDb } from "../../server/db.js";
import { addDays, isoDate, json, todayIn } from "../../server/http.js";

// GET /api/ads/zero-sales?from=YYYY-MM-DD&to=YYYY-MM-DD (or days=7|14|30, ending yesterday;
// the default is the last 30 days) plus page, minSpend, maxOrders and hideAsins.
export async function GET(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const today = todayIn(process.env.AMAZON_ADS_TIME_ZONE || "America/Los_Angeles");
  const days = Number(params.get("days") || 30);
  const to = params.has("to") ? isoDate(params.get("to")) : addDays(today, -1);
  const from = params.has("from") ? isoDate(params.get("from")) : to && addDays(to, -days + 1);
  const page = Number(params.get("page") || 0);
  const minSpend = Number(params.get("minSpend") ?? 10);
  const maxOrders = Number(params.get("maxOrders") ?? 0);
  const badRange = !from || !to || from > to || to > today || addDays(from, 400) < to || (!params.has("from") && ![7, 14, 30].includes(days));
  if (badRange || !Number.isSafeInteger(page) || page < 0 || page > 10000 || !Number.isFinite(minSpend) || minSpend < 0 || !Number.isSafeInteger(maxOrders) || maxOrders < 0) {
    return json({ error: "Invalid search term filters." }, 400);
  }
  if (!process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Amazon Ads is not configured." }, 500);
  return json(await zeroSales(getDb(), {
    profileId: process.env.AMAZON_ADS_PROFILE_ID,
    from, to, today, page, minSpend, maxOrders,
    hideAsins: params.get("hideAsins") !== "false",
  }));
}
