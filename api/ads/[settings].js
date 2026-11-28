import { INSIGHT_DEFAULTS, cleanInsightSettings, saveZeroSettings } from "../../server/ads/insight-settings.js";
import { requireUser } from "../../server/auth.js";
import { getDb } from "../../server/db.js";
import { json } from "../../server/http.js";

// One handler serves every insight's settings URL (/api/ads/<insight>-settings), each with its own
// saved settings.
export async function PUT(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  const match = new URL(request.url).pathname.match(/\/([a-z-]+)-settings$/);
  if (!match || !Object.hasOwn(INSIGHT_DEFAULTS, match[1])) return json({ error: "Unknown insight settings." }, 404);
  const defaults = INSIGHT_DEFAULTS[match[1]];
  if (!process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Amazon Ads is not configured." }, 500);
  const body = await request.json().catch(() => null);
  const { settings, error } = cleanInsightSettings(body, defaults);
  if (error) return json({ error }, 400);
  await saveZeroSettings(getDb(), process.env.AMAZON_ADS_PROFILE_ID, settings, undefined, defaults);
  return json({ settings });
}
