import { PERFORMING_DEFAULTS, loadZeroSettings } from "../../server/ads/insight-settings.js";
import { insightQuery, zeroSales } from "../../server/ads/zero-sales.js";
import { requireUser } from "../../server/auth.js";
import { getDb } from "../../server/db.js";
import { json } from "../../server/http.js";

// GET /api/ads/performing with the same query and response shape as /api/ads/zero-sales, filtered
// by the "Performing Search Terms" card's saved settings (default: conversion from 15% up).
export async function GET(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  const query = insightQuery(new URL(request.url).searchParams);
  if (!query) return json({ error: "Invalid search term filters." }, 400);
  if (!process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Amazon Ads is not configured." }, 500);
  const db = getDb(), profileId = process.env.AMAZON_ADS_PROFILE_ID;
  return json(await zeroSales(db, { profileId, ...query, settings: await loadZeroSettings(db, profileId, PERFORMING_DEFAULTS) }));
}
