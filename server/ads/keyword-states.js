import { migrate } from "../db.js";

const sources = [
  { product: "SP_SEARCH", kind: "keyword", path: "/sp/keywords/list", media: "application/vnd.spKeyword.v3+json", key: "keywords", id: "keywordId" },
  { product: "SP_SEARCH", kind: "target", path: "/sp/targets/list", media: "application/vnd.spTargetingClause.v3+json", key: "targetingClauses", id: "targetId" },
  { product: "SB_SEARCH", kind: "keyword", path: "/sb/keywords", media: "application/vnd.sbkeyword.v3+json", id: "keywordId" },
];

// Current entity state, independent of the historical reporting range. Only list/read calls.
export async function refreshKeywordStates(db, ads, profileId, { now = Date.now, signal, sourceTimeoutMs = 10000 } = {}) {
  await migrate(db);
  const errors = [];
  for (const source of sources) {
    try {
      const rows = [], seen = new Set();
      const timeout = AbortSignal.timeout(sourceTimeoutMs);
      const sourceSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let nextToken, startIndex = 0;
      do {
        const post = Boolean(source.key);
        const path = post ? source.path : `${source.path}?startIndex=${startIndex}&count=100&stateFilter=enabled,paused,archived`;
        const result = await ads.request(post ? "POST" : "GET", path, { profileId, signal: sourceSignal,
          accept: source.media, contentType: source.media,
          ...(post ? { body: { maxResults: 100, stateFilter: { include: ["ENABLED", "PAUSED", "ARCHIVED"] }, ...(nextToken ? { nextToken } : {}) } } : {}) });
        if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
        const page = post ? result.data?.[source.key] : result.data;
        if (!Array.isArray(page)) throw new Error("Invalid list response");
        rows.push(...page);
        nextToken = post ? result.data.nextToken : (page.length === 100 ? String(startIndex + 100) : undefined);
        if (nextToken && seen.has(nextToken)) throw new Error("Repeated pagination token");
        seen.add(nextToken); startIndex += 100;
      } while (nextToken);
      const stamp = new Date(now()).toISOString();
      const statements = [{ sql: "DELETE FROM ads_keyword_states WHERE profile_id = ? AND ad_product = ? AND kind = ?", args: [profileId, source.product, source.kind] }];
      for (const row of rows) {
        if (row[source.id] == null || row.campaignId == null || row.adGroupId == null) throw new Error("Missing entity identity");
        const state = String(row.state || "").toLowerCase();
        statements.push({ sql: "INSERT OR REPLACE INTO ads_keyword_states VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          args: [profileId, source.product, source.kind, String(row.campaignId), String(row.adGroupId), String(row[source.id]),
            ["enabled", "paused", "archived"].includes(state) ? state : "unknown", stamp] });
      }
      await db.batch(statements, "write");
    } catch (err) { errors.push(`${source.product} ${source.kind} state: ${err.message}`); }
  }
  return errors;
}

export async function addKeywordStates(db, profileId, rows) {
  const result = await db.execute({ sql: "SELECT * FROM ads_keyword_states WHERE profile_id = ?", args: [profileId] });
  const key = (product, campaign, group, keyword) => JSON.stringify([product, campaign, group, keyword]);
  const states = new Map(result.rows.map(r => [key(r.ad_product, r.campaign_id, r.ad_group_id, r.keyword_id), r]));
  for (const row of rows) for (const detail of row.details) {
    const entity = states.get(key(row.adProduct, detail.campaignId, detail.adGroupId, detail.keywordId));
    detail.state = entity?.state || "unknown";
    detail.stateUpdatedAt = entity?.synced_at || null;
  }
}
