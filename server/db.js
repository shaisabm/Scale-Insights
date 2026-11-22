import { createClient } from "@libsql/client";

// Turso (libSQL). Every statement is idempotent, so migrate() can run on each cold start.
const SCHEMA = [
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
  // Which days have been stored, and when, so recent days can be refreshed.
  `CREATE TABLE IF NOT EXISTS ads_synced_days (
    profile_id TEXT NOT NULL,
    ad_product TEXT NOT NULL,
    date TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, ad_product, date)
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

/** Creates any missing tables. */
export async function migrate(db) {
  if (!migrated.has(db)) {
    await db.batch(SCHEMA, "write");
    migrated.add(db);
  }
  return db;
}
