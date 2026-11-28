import { afterEach, describe, expect, it, vi } from "vitest";

// The script runs on import, so everything it would reach (Amazon, the database) is faked.
const syncAds = vi.fn(async () => ({ requested: 0 }));
vi.mock("../../server/ads/sync.js", async importOriginal => ({ ...(await importOriginal()), syncAds }));
vi.mock("../../server/amazon/ads.js", () => ({ createAdsClient: () => ({}) }));
vi.mock("../../server/config.js", () => ({ adsConfig: () => ({ profileId: "test-profile", timeZone: "America/Los_Angeles" }) }));
vi.mock("../../server/db.js", () => ({ getDb: () => ({}) }));

afterEach(() => vi.restoreAllMocks());

describe("npm run sync:ads", () => {
  it("syncs search terms and targeting along with the trend reports, like /api/sync/ads", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await import("../../scripts/sync-ads.mjs");
    expect(syncAds).toHaveBeenCalledWith(expect.objectContaining({ profileId: "test-profile", products: ["SP", "SB", "SD", "SP_SEARCH", "SB_SEARCH", "SP_TARGETING", "SB_TARGETING", "SD_TARGETING"] }));
  });
});
