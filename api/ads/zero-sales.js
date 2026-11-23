import { zeroSales } from "../../server/ads/zero-sales.js";
import { requireUser } from "../../server/auth.js";
import { getDb } from "../../server/db.js";
import { addDays, json, todayIn } from "../../server/http.js";

export async function GET(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const days = Number(params.get("days") || 30);
  const page = Number(params.get("page") || 0);
  const minSpend = Number(params.get("minSpend") ?? 10);
  const maxOrders = Number(params.get("maxOrders") ?? 0);
  if (![7, 14, 30].includes(days) || !Number.isSafeInteger(page) || page < 0 || page > 10000 || !Number.isFinite(minSpend) || minSpend < 0 || !Number.isSafeInteger(maxOrders) || maxOrders < 0) {
    return json({ error: "Invalid search term filters." }, 400);
  }
  if (!process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Amazon Ads is not configured." }, 500);
  const to = addDays(todayIn(process.env.AMAZON_ADS_TIME_ZONE || "America/Los_Angeles"), -1);
  return json(await zeroSales(getDb(), {
    profileId: process.env.AMAZON_ADS_PROFILE_ID,
    from: addDays(to, -days + 1), to, page, minSpend, maxOrders,
    hideAsins: params.get("hideAsins") !== "false",
  }));
}
