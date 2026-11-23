import { migrate } from "../db.js";

// Settings for the "Search Terms with 0 Sales" card: its name and tip, which search terms it
// lists, how they're sorted, and which metric columns it shows. Saved per profile.
export const ZERO_METRICS = ["impressions", "clicks", "orders", "units", "cpc", "ctr", "conversion", "acos", "roas", "spend", "sales", "pl", "breakEvenBid"];
// Break even bid needs product costs, which aren't connected yet, so it can't filter, sort or show.
export const UNAVAILABLE_METRICS = ["breakEvenBid"];
const usable = k => ZERO_METRICS.includes(k) && !UNAVAILABLE_METRICS.includes(k);

export const ZERO_DEFAULTS = Object.freeze({
  name: "Search Terms with 0 Sales",
  description: "[Tip]: You can automatically remove poor performing search terms using Automation.",
  showTracked: true,
  hideAsins: true,
  hideKeywords: false,
  sort: "spend",
  dir: "desc",
  filters: { spend: { min: 10 }, orders: { max: 0 } },
  track: ["impressions", "clicks", "pl"],
});

/** { settings } with everything checked and normalized, or { error } for the first problem. */
export function cleanZeroSettings(input) {
  if (!input || typeof input !== "object") return { error: "Settings must be an object." };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80) return { error: "The name must be 1 to 80 characters." };
  const description = typeof input.description === "string" ? input.description.trim() : null;
  if (description === null || description.length > 300) return { error: "The description must be at most 300 characters." };
  for (const k of ["showTracked", "hideAsins", "hideKeywords"]) if (typeof input[k] !== "boolean") return { error: `${k} must be true or false.` };
  if (!usable(input.sort) || !["asc", "desc"].includes(input.dir)) return { error: "Choose a sort order from the list." };
  const filters = {};
  for (const [k, f] of Object.entries(input.filters || {})) {
    if (!usable(k) || !f || typeof f !== "object") return { error: `${k} can't be filtered.` };
    const limits = {};
    for (const side of ["min", "max"]) {
      if (f[side] == null || f[side] === "") continue;
      const n = Number(f[side]);
      if (!Number.isFinite(n)) return { error: `The ${side} for ${k} must be a number.` };
      limits[side] = n;
    }
    if (limits.min != null && limits.max != null && limits.min > limits.max) return { error: `The min for ${k} is above its max.` };
    if (Object.keys(limits).length) filters[k] = limits;
  }
  if (!Array.isArray(input.track) || input.track.some(k => !usable(k))) return { error: "Only available metrics can be tracked." };
  const track = ZERO_METRICS.filter(k => input.track.includes(k));
  return { settings: { name, description, showTracked: input.showTracked, hideAsins: input.hideAsins, hideKeywords: input.hideKeywords, sort: input.sort, dir: input.dir, filters, track } };
}

/** The profile's saved settings, or the defaults when none are saved (or they no longer validate). */
export async function loadZeroSettings(db, profileId) {
  await migrate(db);
  const { rows } = await db.execute({ sql: "SELECT settings FROM ads_insight_settings WHERE profile_id = ? AND insight = 'zero-sales'", args: [profileId] });
  if (!rows.length) return structuredClone(ZERO_DEFAULTS);
  try {
    return cleanZeroSettings(JSON.parse(rows[0].settings)).settings || structuredClone(ZERO_DEFAULTS);
  } catch {
    return structuredClone(ZERO_DEFAULTS);
  }
}

export async function saveZeroSettings(db, profileId, settings, at = new Date().toISOString()) {
  await migrate(db);
  await db.execute({
    sql: "INSERT OR REPLACE INTO ads_insight_settings (profile_id, insight, settings, updated_at) VALUES (?, 'zero-sales', ?, ?)",
    args: [profileId, JSON.stringify(settings), at],
  });
}
