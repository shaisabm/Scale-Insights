import { PERFORMING_DEFAULTS, cleanInsightSettings, saveZeroSettings } from "../../server/ads/insight-settings.js";
import { requireUser } from "../../server/auth.js";
import { getDb } from "../../server/db.js";
import { json } from "../../server/http.js";

// PUT /api/ads/performing-settings with the card's settings as JSON. Saves them for the profile;
// /api/ads/performing applies them and returns them with each page.
export async function PUT(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  if (!process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Amazon Ads is not configured." }, 500);
  const body = await request.json().catch(() => null);
  const { settings, error } = cleanInsightSettings(body);
  if (error) return json({ error }, 400);
  await saveZeroSettings(getDb(), process.env.AMAZON_ADS_PROFILE_ID, settings, undefined, PERFORMING_DEFAULTS);
  return json({ settings });
}
