import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { storeWindow } from "../../server/ads/sync.js";
import { adsTrend } from "../../server/ads/trend.js";
import { migrate } from "../../server/db.js";

const PROFILE = "111";
const row = (date, sales) => ({ date, campaignId: "1", adGroupId: "", asin: "", impressions: 10, clicks: 1, cost: 1, orders: 1, units: 1, sales });

async function db() {
  return migrate(createClient({ url: ":memory:" }));
}

describe("adsTrend", () => {
  it("reports synced days as separate ranges, so a missing window stays a gap", async () => {
    const d = await db();
    await storeWindow(d, { profileId: PROFILE, product: "SP", start: "2026-11-01", end: "2026-11-03", rows: [row("2026-11-02", 5)], syncedAt: "2026-11-04T14:00:00.000Z" });
    await storeWindow(d, { profileId: PROFILE, product: "SP", start: "2026-11-07", end: "2026-11-09", rows: [], syncedAt: "2026-11-10T14:00:00.000Z" });
    const { synced } = await adsTrend(d, { profileId: PROFILE, from: "2026-11-01", to: "2026-11-30" });
    expect(synced.SP).toEqual({ first: "2026-11-01", last: "2026-11-09", syncedAt: "2026-11-10T14:00:00.000Z", ranges: [["2026-11-01", "2026-11-03"], ["2026-11-07", "2026-11-09"]] });
  });

  it("gives every ad type a state: synced, waiting on Amazon, never synced or not offered", async () => {
    const d = await db();
    await storeWindow(d, { profileId: PROFILE, product: "SP", start: "2026-11-01", end: "2026-11-02", rows: [], syncedAt: "2026-11-03T14:00:00.000Z" });
    await d.execute({ sql: "INSERT INTO ads_report_requests (report_id, profile_id, ad_product, start_date, end_date, status, requested_at, updated_at) VALUES ('r1', ?, 'SB', '2026-11-01', '2026-11-02', 'PENDING', 't', 't')", args: [PROFILE] });
    await d.execute({ sql: "INSERT INTO ads_unsupported (profile_id, ad_product, reason, checked_at) VALUES (?, 'SD', 'Report request failed: HTTP 401', 't')", args: [PROFILE] });
    const { adTypes } = await adsTrend(d, { profileId: PROFILE, from: "2026-11-01", to: "2026-11-30" });
    expect(adTypes).toEqual({ SP: { state: "ok" }, SB: { state: "pending" }, SD: { state: "unsupported" } });
    const other = await adsTrend(d, { profileId: "999", from: "2026-11-01", to: "2026-11-30" });
    expect(other.adTypes).toEqual({ SP: { state: "missing" }, SB: { state: "missing" }, SD: { state: "missing" } });
  });

  it("reads totals and sync info in one read transaction, so they can't disagree", async () => {
    const d = await db();
    const batch = vi.spyOn(d, "batch");
    const execute = vi.spyOn(d, "execute");
    await adsTrend(d, { profileId: PROFILE, from: "2026-11-01", to: "2026-11-30" });
    expect(execute).not.toHaveBeenCalled();
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][1]).toBe("read");
  });
});
