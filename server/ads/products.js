const METADATA_REQUEST = "application/vnd.productmetadatarequest.v1+json";
const METADATA_RESPONSE = "application/vnd.productmetadataresponse.v1+json";
const PAGE = 300;

/**
 * Titles and image URLs for every ASIN the stored ads data mentions, from the read-only product
 * metadata lookup. Products Amazon doesn't return keep whatever was stored before.
 */
export async function refreshProducts(db, ads, profileId, at = new Date().toISOString()) {
  const known = await db.execute({
    sql: "SELECT asin FROM ads_daily WHERE profile_id = ? AND asin <> '' UNION SELECT asin FROM ads_search_product_map WHERE profile_id = ?",
    args: [profileId, profileId],
  });
  const asins = known.rows.map(r => String(r.asin));
  const stmts = [];
  for (let i = 0; i < asins.length; i += PAGE) {
    const { status, data } = await ads.request("POST", "/product/metadata", {
      profileId,
      body: { asins: asins.slice(i, i + PAGE), checkItemDetails: true, pageIndex: 0, pageSize: PAGE },
      contentType: METADATA_REQUEST,
      accept: METADATA_RESPONSE,
    });
    if (status !== 200) throw new Error(`Product metadata failed: HTTP ${status}`);
    for (const p of data?.ProductMetadataList || []) {
      stmts.push({
        sql: "INSERT OR REPLACE INTO ads_products (profile_id, asin, title, image_url, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: [profileId, String(p.asin), String(p.title || ""), String(p.imageUrl || ""), at],
      });
    }
  }
  if (stmts.length) await db.batch(stmts, "write");
  return stmts.length;
}

// Amazon's product image hosts. Anything else is refused, so the image route can't be pointed
// at other servers.
const IMAGE_HOSTS = new Set(["m.media-amazon.com", "images-na.ssl-images-amazon.com", "images-eu.ssl-images-amazon.com", "images-fe.ssl-images-amazon.com"]);

/** A thumbnail URL for an Amazon product image, or null when the URL isn't one. */
export function imageSource(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !IMAGE_HOSTS.has(u.hostname)) return null;
  // Amazon image URLs take size codes before the extension (the lookup returns "._SS60_", 60px).
  // "._SL160_" in their place caps the longer side at 160px instead.
  u.pathname = u.pathname.replace(/^(\/images\/I\/[^./]+)(?:\.[^/]*)?(\.[a-z]+)$/i, "$1._SL160_$2");
  return u.href;
}
