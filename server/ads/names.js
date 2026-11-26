// The Ads API's list endpoints for each ad type's campaigns and ad groups. They only read.
const LISTS = [
  { adProduct: "SP", kind: "campaign", path: "/sp/campaigns/list", media: "application/vnd.spCampaign.v3+json", key: "campaigns", id: "campaignId" },
  { adProduct: "SP", kind: "adGroup", path: "/sp/adGroups/list", media: "application/vnd.spAdGroup.v3+json", key: "adGroups", id: "adGroupId" },
  { adProduct: "SB", kind: "campaign", path: "/sb/v4/campaigns/list", media: "application/vnd.sbcampaignresource.v4+json", key: "campaigns", id: "campaignId" },
  { adProduct: "SB", kind: "adGroup", path: "/sb/v4/adGroups/list", media: "application/vnd.sbadgroupresource.v4+json", key: "adGroups", id: "adGroupId" },
];

/**
 * Stores the current name of every campaign and ad group, archived ones included, so search terms
 * can be shown by campaign and ad group. Names no longer listed keep their last stored value.
 * Returns how many were stored; throws if a list fails, before storing any.
 */
export async function refreshNames(db, ads, profileId, at = new Date().toISOString()) {
  const stmts = [];
  for (const list of LISTS) {
    let nextToken;
    do {
      const { status, data } = await ads.request("POST", list.path, {
        profileId,
        body: { maxResults: 100, stateFilter: { include: ["ENABLED", "PAUSED", "ARCHIVED"] }, ...(nextToken ? { nextToken } : {}) },
        contentType: list.media,
        accept: list.media,
      });
      if (status !== 200) throw new Error(`${list.path} failed: HTTP ${status}`);
      for (const item of data?.[list.key] || []) {
        stmts.push({
          sql: "INSERT OR REPLACE INTO ads_names (profile_id, ad_product, kind, id, name, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          args: [profileId, list.adProduct, list.kind, String(item[list.id]), String(item.name || ""), at],
        });
      }
      nextToken = data?.nextToken;
    } while (nextToken);
  }
  if (stmts.length) await db.batch(stmts, "write");
  return stmts.length;
}
