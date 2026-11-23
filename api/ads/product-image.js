import { imageSource } from "../../server/ads/products.js";
import { requireUser } from "../../server/auth.js";
import { getDb, migrate } from "../../server/db.js";
import { json } from "../../server/http.js";

// GET /api/ads/product-image?asin=B0... Fetches the product's image here and passes it on, so
// the viewer's browser never contacts Amazon.
export async function GET(request) {
  const denied = requireUser(request);
  if (denied) return denied;
  const asin = new URL(request.url).searchParams.get("asin") || "";
  if (!/^[A-Z0-9]{10}$/.test(asin) || !process.env.AMAZON_ADS_PROFILE_ID) return json({ error: "Unknown product." }, 404);
  const db = await migrate(getDb());
  const { rows } = await db.execute({ sql: "SELECT image_url FROM ads_products WHERE profile_id = ? AND asin = ?", args: [process.env.AMAZON_ADS_PROFILE_ID, asin] });
  const source = imageSource(rows[0]?.image_url);
  if (!source) return json({ error: "No image for this product." }, 404);
  // A redirect could lead away from the host imageSource checked, so it counts as a failure.
  const res = await fetch(source, { redirect: "manual", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const type = res?.headers.get("content-type") || "";
  if (!res?.ok || !type.startsWith("image/")) return json({ error: "The product image is unavailable." }, 502);
  return new Response(await res.arrayBuffer(), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
}
