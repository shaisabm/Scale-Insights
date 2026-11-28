const METADATA_REQUEST = "application/vnd.productmetadatarequest.v1+json";
const METADATA_RESPONSE = "application/vnd.productmetadataresponse.v1+json";
const PAGE = 300;

/**
 * Titles and image URLs for every ASIN the stored ads data mentions, from the read-only product
 * metadata lookup. Products Amazon doesn't return keep whatever was stored before.
 */
export async function refreshProducts(db, ads, profileId, at = new Date().toISOString()) {
  // History rows list an ad group's ASINs comma-separated; a group advertising several needs them all.
  const known = await db.execute({
    sql: "SELECT DISTINCT asin FROM ads_daily WHERE profile_id = ? AND asin <> '' UNION SELECT asins FROM ads_search_product_history WHERE profile_id = ? UNION SELECT asin FROM ads_sd_product_ads WHERE profile_id = ?",
    args: [profileId, profileId, profileId],
  });
  const asins = [...new Set(known.rows.flatMap(r => String(r.asin).split(",")))].sort();
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

const SD_PAGE = 100;

/**
 * The product each Sponsored Display ad advertises, in every state, from the read-only product ads
 * list. A list that fails partway keeps the one stored before.
 */
export async function refreshSdProductAds(db, ads, profileId, { now = Date.now, timeoutMs = 10000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  const listed = [];
  for (let startIndex = 0; ; startIndex += SD_PAGE) {
    const { status, data } = await ads.request("GET", `/sd/productAds?startIndex=${startIndex}&count=${SD_PAGE}&stateFilter=enabled,paused,archived`, { profileId, signal });
    if (status !== 200) throw new Error(`HTTP ${status}`);
    if (!Array.isArray(data)) throw new Error("Invalid list response");
    listed.push(...data);
    if (data.length < SD_PAGE) break;
  }
  const at = new Date(now()).toISOString();
  const stmts = [{ sql: "DELETE FROM ads_sd_product_ads WHERE profile_id = ?", args: [profileId] }];
  // An ad for a landing page rather than a product has no ASIN.
  for (const ad of listed.filter(a => a.asin)) {
    if (ad.adId == null || ad.campaignId == null || ad.adGroupId == null) throw new Error("Missing ad identity");
    stmts.push({
      sql: "INSERT OR REPLACE INTO ads_sd_product_ads (profile_id, ad_id, campaign_id, ad_group_id, asin, state, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [profileId, String(ad.adId), String(ad.campaignId), String(ad.adGroupId), String(ad.asin), String(ad.state || "").toLowerCase(), at],
    });
  }
  await db.batch(stmts, "write");
  return stmts.length - 1;
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
