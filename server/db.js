import { createClient } from "@libsql/client";

// Turso (libSQL). Every statement is idempotent, so migrate() can run on each cold start.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ads_keyword_states (
    profile_id TEXT NOT NULL, ad_product TEXT NOT NULL, kind TEXT NOT NULL,
    campaign_id TEXT NOT NULL, ad_group_id TEXT NOT NULL, keyword_id TEXT NOT NULL,
    state TEXT NOT NULL, synced_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, ad_product, kind, campaign_id, ad_group_id, keyword_id)
  )`,
  // Daily Amazon Ads numbers. SP rows are per advertised ASIN; SB rows are per campaign.
  `CREATE TABLE IF NOT EXISTS ads_daily (
    profile_id TEXT NOT NULL,
    ad_product TEXT NOT NULL,
    date TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    ad_group_id TEXT NOT NULL DEFAULT '',
    asin TEXT NOT NULL DEFAULT '',
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    orders INTEGER NOT NULL DEFAULT 0,
    units INTEGER NOT NULL DEFAULT 0,
    sales REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (profile_id, ad_product, date, campaign_id, ad_group_id, asin)
  )`,
  // Search term reports keep their own grain; adding them to ads_daily would double count trends.
  `CREATE TABLE IF NOT EXISTS ads_search_terms_daily (
    profile_id TEXT NOT NULL,
    ad_product TEXT NOT NULL,
    date TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    ad_group_id TEXT NOT NULL DEFAULT '',
    search_term TEXT NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    orders INTEGER NOT NULL DEFAULT 0,
    units INTEGER NOT NULL DEFAULT 0,
    sales REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (profile_id, ad_product, date, campaign_id, ad_group_id, search_term)
  )`,
  // Keyword-level detail is stored separately so old summary reports remain readable during backfill.
  `CREATE TABLE IF NOT EXISTS ads_search_term_details_daily (
    profile_id TEXT NOT NULL, ad_product TEXT NOT NULL, date TEXT NOT NULL,
    campaign_id TEXT NOT NULL, ad_group_id TEXT NOT NULL, search_term TEXT NOT NULL,
    keyword_id TEXT NOT NULL DEFAULT '', keyword TEXT NOT NULL DEFAULT '', match_type TEXT NOT NULL DEFAULT '',
    campaign_name TEXT NOT NULL DEFAULT '', ad_group_name TEXT NOT NULL DEFAULT '',
    impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0, orders INTEGER NOT NULL DEFAULT 0,
    units INTEGER NOT NULL DEFAULT 0, sales REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (profile_id, ad_product, date, campaign_id, ad_group_id, search_term, keyword_id, keyword, match_type)
  )`,
  `CREATE TABLE IF NOT EXISTS ads_search_detail_days (
    profile_id TEXT NOT NULL, ad_product TEXT NOT NULL, date TEXT NOT NULL, synced_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, ad_product, date)
  )`,
  // Daily numbers per keyword or target, from the targeting reports of each ad type, with the names,
  // text, match type, bid and top-of-search impression share (a percentage) reported that day.
  // kind is keyword (exact, phrase or broad), auto (automatic targeting) or target (products,
  // categories and audiences).
  `CREATE TABLE IF NOT EXISTS ads_targets_daily (
    profile_id TEXT NOT NULL, ad_product TEXT NOT NULL, date TEXT NOT NULL,
    campaign_id TEXT NOT NULL, ad_group_id TEXT NOT NULL, target_id TEXT NOT NULL,
    campaign_name TEXT NOT NULL DEFAULT '', ad_group_name TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT '', match_type TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL,
    bid REAL, top_share REAL,
    impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0, orders INTEGER NOT NULL DEFAULT 0,
    units INTEGER NOT NULL DEFAULT 0, sales REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (profile_id, ad_product, date, campaign_id, ad_group_id, target_id)
  )`,
  // Current bids of the keywords and targets in ads_keyword_states, from the same lists. A null bid
  // means the entity uses its ad group's default bid.
  `CREATE TABLE IF NOT EXISTS ads_keyword_bids (
    profile_id TEXT NOT NULL, ad_product TEXT NOT NULL, kind TEXT NOT NULL,
    campaign_id TEXT NOT NULL, ad_group_id TEXT NOT NULL, keyword_id TEXT NOT NULL,
    bid REAL, synced_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, ad_product, kind, campaign_id, ad_group_id, keyword_id)
  )`,
  // Settings people save for an insight card (filters, sort, columns), as JSON per profile.
  `CREATE TABLE IF NOT EXISTS ads_insight_settings (
    profile_id TEXT NOT NULL,
    insight TEXT NOT NULL,
    settings TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, insight)
  )`,
  // Sponsored Brands search reports identify an ad group, while the ads list identifies its ASINs
  // (sorted, comma-separated) as they are now. Each row is a date range the group is known to have
  // advertised them, so a search term is matched by its date: from the day after the group's ads
  // last changed, through the day before the ads list that last confirmed it (observed_at).
  `CREATE TABLE IF NOT EXISTS ads_search_product_history (
    profile_id TEXT NOT NULL,
    ad_product TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    ad_group_id TEXT NOT NULL,
    asins TEXT NOT NULL,
    valid_from TEXT NOT NULL,
    valid_to TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, ad_product, campaign_id, ad_group_id, valid_from)
  )`,
  // Ads read so far by a Sponsored Brands ads list, which may take more than one sync to finish.
  `CREATE TABLE IF NOT EXISTS ads_sb_ads_scan (
    profile_id TEXT NOT NULL,
    ad_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    ad_group_id TEXT NOT NULL,
    state TEXT NOT NULL,
    asins TEXT NOT NULL,
    created_ms INTEGER,
    updated_ms INTEGER,
    PRIMARY KEY (profile_id, ad_id)
  )`,
  // Titles and image URLs of advertised products, from the Ads API product metadata lookup.
  `CREATE TABLE IF NOT EXISTS ads_products (
    profile_id TEXT NOT NULL,
    asin TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, asin)
  )`,
  // When that history last finished updating (ready_at) and the last date it confirms
  // (ready_through), why the latest refresh failed, if it did, and where an unfinished ads list
  // carries on (next_token, from the list begun at scan_started_at). Search reports for the ad type
  // can't count as complete for dates after ready_through. lease_owner is the sync listing the ads
  // now, until lease_until (epoch ms), so two syncs never list at once.
  `CREATE TABLE IF NOT EXISTS ads_product_map_status (
    profile_id TEXT NOT NULL,
    ad_product TEXT NOT NULL,
    ready_at TEXT,
    ready_through TEXT,
    error TEXT,
    next_token TEXT,
    scan_started_at TEXT,
    lease_owner TEXT,
    lease_until INTEGER,
    PRIMARY KEY (profile_id, ad_product)
  )`,
  // Which days have been stored, and when, so recent days can be refreshed.
  `CREATE TABLE IF NOT EXISTS ads_synced_days (
    profile_id TEXT NOT NULL,
    ad_product TEXT NOT NULL,
    date TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, ad_product, date)
  )`,
  // Ad types Amazon refused for a profile (HTTP 401 or 403 on a report request), so combined
  // totals can leave them out instead of waiting for them. Cleared when a request succeeds.
  `CREATE TABLE IF NOT EXISTS ads_unsupported (
    profile_id TEXT NOT NULL,
    ad_product TEXT NOT NULL,
    reason TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, ad_product)
  )`,
  // Async report requests that are waiting on Amazon.
  `CREATE TABLE IF NOT EXISTS ads_report_requests (
    report_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    ad_product TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    error TEXT
  )`,
];

let shared;

/** The app's database client, created once per process. */
export function getDb(env = process.env) {
  if (!shared) {
    if (!env.TURSO_DATABASE_URL) throw new Error("Missing environment variable TURSO_DATABASE_URL");
    shared = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  }
  return shared;
}

const migrated = new WeakSet();

/** Creates any missing tables, and adds columns that later versions need. */
export async function migrate(db) {
  if (!migrated.has(db)) {
    await db.batch(SCHEMA, "write");
    // Column checks and the changes they call for share one write transaction, which takes the
    // write lock before looking, so two cold starts can't both find a column missing and add it.
    const tx = await db.transaction("write");
    try {
      const columns = async table => (await tx.execute(`PRAGMA table_info(${table})`)).rows.map(r => r.name);
      // Search term rows stored before units were synced get the column, and their days are marked
      // unsynced so the next sync fetches them again with units. Reports requested without units
      // are given up, so collecting one can't mark its days synced again.
      if (!(await columns("ads_search_terms_daily")).includes("units")) {
        await tx.batch([
          "ALTER TABLE ads_search_terms_daily ADD COLUMN units INTEGER NOT NULL DEFAULT 0",
          "DELETE FROM ads_synced_days WHERE ad_product IN ('SP_SEARCH', 'SB_SEARCH')",
          "UPDATE ads_report_requests SET status = 'FAILED', error = 'Requested before units were synced' WHERE ad_product IN ('SP_SEARCH', 'SB_SEARCH') AND status IN ('PENDING', 'PROCESSING')",
        ]);
      }
      if (!(await columns("ads_report_requests")).includes("search_details")) {
        await tx.execute("ALTER TABLE ads_report_requests ADD COLUMN search_details INTEGER NOT NULL DEFAULT 0");
      }
      // Product maps built before they had dates are dropped, and marked not ready, so the next sync
      // builds the dated history instead.
      const status = await columns("ads_product_map_status");
      if (!status.includes("next_token")) {
        await tx.batch([
          "ALTER TABLE ads_product_map_status ADD COLUMN next_token TEXT",
          "ALTER TABLE ads_product_map_status ADD COLUMN scan_started_at TEXT",
          "UPDATE ads_product_map_status SET ready_at = NULL",
          "DROP TABLE IF EXISTS ads_search_product_map",
        ]);
      }
      if (!status.includes("ready_through")) await tx.execute("ALTER TABLE ads_product_map_status ADD COLUMN ready_through TEXT");
      if (!status.includes("lease_owner")) {
        await tx.batch([
          "ALTER TABLE ads_product_map_status ADD COLUMN lease_owner TEXT",
          "ALTER TABLE ads_product_map_status ADD COLUMN lease_until INTEGER",
        ]);
      }
      await tx.commit();
    } finally {
      tx.close();
    }
    migrated.add(db);
  }
  return db;
}
