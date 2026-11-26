import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { refreshNames } from "../../server/ads/names.js";
import { migrate } from "../../server/db.js";

const profileId = "test-profile";
const names = async db => (await db.execute("SELECT ad_product, kind, id, name FROM ads_names ORDER BY ad_product, kind, id")).rows.map(r => [r.ad_product, r.kind, r.id, r.name]);

describe("refreshNames", () => {
  it("stores campaign and ad group names from the four read-only lists, page by page", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    const pages = {
      "/sp/campaigns/list": [{ campaigns: [{ campaignId: 1, name: "SP One" }], nextToken: "page-2" }, { campaigns: [{ campaignId: 2, name: "SP Two" }] }],
      "/sp/adGroups/list": [{ adGroups: [{ adGroupId: 10, campaignId: 1, name: "Exact" }] }],
      "/sb/v4/campaigns/list": [{ campaigns: [{ campaignId: "30", name: "SBV | BATTLE ROPE.mov | Pink/Pink" }] }],
      "/sb/v4/adGroups/list": [{ adGroups: [{ adGroupId: "40", campaignId: "30", name: "BATTLE ROPE.mov" }] }],
    };
    const request = vi.fn(async (method, path, { body }) => ({ status: 200, data: pages[path][body.nextToken ? 1 : 0] }));
    expect(await refreshNames(db, { request }, profileId, "t")).toBe(5);
    // Only list calls, with archived campaigns and ad groups included.
    for (const [method, path, { body }] of request.mock.calls) {
      expect([method, path.endsWith("/list"), body.stateFilter]).toEqual(["POST", true, { include: ["ENABLED", "PAUSED", "ARCHIVED"] }]);
    }
    expect(request.mock.calls.map(([, path, { body }]) => [path, body.nextToken ?? null])).toContainEqual(["/sp/campaigns/list", "page-2"]);
    expect(await names(db)).toEqual([
      ["SB", "adGroup", "40", "BATTLE ROPE.mov"], ["SB", "campaign", "30", "SBV | BATTLE ROPE.mov | Pink/Pink"],
      ["SP", "adGroup", "10", "Exact"], ["SP", "campaign", "1", "SP One"], ["SP", "campaign", "2", "SP Two"],
    ]);
  });

  it("throws when a list fails, keeping the names it had", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await db.execute({ sql: "INSERT INTO ads_names (profile_id, ad_product, kind, id, name, updated_at) VALUES (?, 'SP', 'campaign', '1', 'Kept', 't')", args: [profileId] });
    await expect(refreshNames(db, { request: async () => ({ status: 503, data: {} }) }, profileId)).rejects.toThrow(/HTTP 503/);
    expect(await names(db)).toEqual([["SP", "campaign", "1", "Kept"]]);
  });
});
