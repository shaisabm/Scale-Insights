import { createClient } from "@libsql/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as productImage } from "../../api/ads/product-image.js";
import { imageSource, refreshProducts } from "../../server/ads/products.js";
import { storeWindow } from "../../server/ads/sync.js";
import { SESSION_COOKIE, createSessionToken } from "../../server/auth.js";
import { getDb, migrate } from "../../server/db.js";

const profileId = "test-profile";
const product = (asin, extra = {}) => ({ asin, title: `Title ${asin}`, imageUrl: `https://m.media-amazon.com/images/I/${asin}.jpg`, sku: "x", ...extra });

describe("refreshProducts", () => {
  it("stores titles and images for every ASIN the ads data mentions, with one read-only lookup", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await storeWindow(db, { profileId, product: "SP", start: "2026-11-01", end: "2026-11-01", rows: [{ date: "2026-11-01", campaignId: "1", adGroupId: "2", asin: "B0AAAAAAAA", impressions: 1, clicks: 0, cost: 0, orders: 0, units: 0, sales: 0 }], syncedAt: "t" });
    await db.execute({ sql: "INSERT INTO ads_search_product_history (profile_id, ad_product, campaign_id, ad_group_id, asins, valid_from, valid_to, observed_at) VALUES (?, 'SB_SEARCH', '7', '8', 'B0BBBBBBBB', '2026-10-01', '2026-11-21', 't')", args: [profileId] });
    const request = vi.fn(async () => ({ status: 200, data: { ProductMetadataList: [product("B0AAAAAAAA"), product("B0BBBBBBBB", { imageUrl: undefined })] } }));
    expect(await refreshProducts(db, { request }, profileId, "2026-11-22T00:00:00.000Z")).toBe(2);
    expect(request).toHaveBeenCalledWith("POST", "/product/metadata", expect.objectContaining({ profileId, body: expect.objectContaining({ asins: ["B0AAAAAAAA", "B0BBBBBBBB"] }) }));
    const { rows } = await db.execute("SELECT asin, title, image_url FROM ads_products ORDER BY asin");
    expect(rows.map(r => [r.asin, r.title, r.image_url])).toEqual([
      ["B0AAAAAAAA", "Title B0AAAAAAAA", "https://m.media-amazon.com/images/I/B0AAAAAAAA.jpg"],
      ["B0BBBBBBBB", "Title B0BBBBBBBB", ""],
    ]);
  });

  it("throws when the lookup fails, leaving stored products alone", async () => {
    const db = await migrate(createClient({ url: ":memory:" }));
    await db.execute({ sql: "INSERT INTO ads_search_product_history (profile_id, ad_product, campaign_id, ad_group_id, asins, valid_from, valid_to, observed_at) VALUES (?, 'SB_SEARCH', '7', '8', 'B0BBBBBBBB', '2026-10-01', '2026-11-21', 't')", args: [profileId] });
    await db.execute({ sql: "INSERT INTO ads_products (profile_id, asin, title, image_url, updated_at) VALUES (?, 'B0BBBBBBBB', 'Kept', 'https://m.media-amazon.com/images/I/k.jpg', 't')", args: [profileId] });
    await expect(refreshProducts(db, { request: async () => ({ status: 500, data: {} }) }, profileId)).rejects.toThrow(/HTTP 500/);
    expect((await db.execute("SELECT title FROM ads_products")).rows[0].title).toBe("Kept");
  });
});

describe("imageSource", () => {
  it("asks Amazon for a 160px thumbnail of its own product images", () => {
    expect(imageSource("https://m.media-amazon.com/images/I/71abcDEF12L.jpg")).toBe("https://m.media-amazon.com/images/I/71abcDEF12L._SL160_.jpg");
    expect(imageSource("https://images-na.ssl-images-amazon.com/images/I/41x.png")).toBe("https://images-na.ssl-images-amazon.com/images/I/41x._SL160_.png");
    // The lookup's own 60px size code, and any other, are replaced.
    expect(imageSource("https://m.media-amazon.com/images/I/41exampleAB._SS60_.jpg")).toBe("https://m.media-amazon.com/images/I/41exampleAB._SL160_.jpg");
    expect(imageSource("https://m.media-amazon.com/images/I/71abc._AC_SX300_.jpg")).toBe("https://m.media-amazon.com/images/I/71abc._SL160_.jpg");
  });

  it("refuses anything that isn't an https Amazon image host", () => {
    for (const url of ["http://m.media-amazon.com/images/I/a.jpg", "https://evil.example/images/I/a.jpg", "https://m.media-amazon.com.evil.example/a.jpg", "file:///etc/passwd", "", undefined]) {
      expect(imageSource(url)).toBeNull();
    }
  });
});

describe("GET /api/ads/product-image", () => {
  const signedIn = asin => new Request(`https://app.test/api/ads/product-image?asin=${asin}`, { headers: { cookie: `${SESSION_COOKIE}=${createSessionToken("secret")}` } });
  const env = () => {
    vi.stubEnv("SESSION_SECRET", "secret");
    vi.stubEnv("TURSO_DATABASE_URL", ":memory:");
    vi.stubEnv("AMAZON_ADS_PROFILE_ID", profileId);
  };

  beforeAll(async () => {
    env();
    const db = await migrate(getDb());
    await db.batch([
      { sql: "INSERT INTO ads_products (profile_id, asin, title, image_url, updated_at) VALUES (?, 'B0AAAAAAAA', 'A', 'https://m.media-amazon.com/images/I/71a.jpg', 't')", args: [profileId] },
      { sql: "INSERT INTO ads_products (profile_id, asin, title, image_url, updated_at) VALUES (?, 'B0CCCCCCCC', 'C', 'https://evil.example/c.jpg', 't')", args: [profileId] },
    ], "write");
    vi.unstubAllEnvs();
  });

  it("needs a signed-in person", async () => {
    env();
    expect((await productImage(new Request("https://app.test/api/ads/product-image?asin=B0AAAAAAAA"))).status).toBe(401);
  });

  it("passes on the thumbnail from Amazon, so the browser never contacts Amazon", async () => {
    env();
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetch);
    const res = await productImage(signedIn("B0AAAAAAAA"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    // The browser asks again each time, so a signed-out viewer gets a 401, not a cached image.
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(fetch.mock.calls[0][0]).toBe("https://m.media-amazon.com/images/I/71a._SL160_.jpg");
  });

  it("refuses unknown products, non-Amazon image URLs and non-image replies", async () => {
    env();
    const fetch = vi.fn(async () => new Response("<html>", { headers: { "Content-Type": "text/html" } }));
    vi.stubGlobal("fetch", fetch);
    expect((await productImage(signedIn("B0ZZZZZZZZ"))).status).toBe(404);
    expect((await productImage(signedIn("not-an-asin"))).status).toBe(404);
    expect((await productImage(signedIn("B0CCCCCCCC"))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect((await productImage(signedIn("B0AAAAAAAA"))).status).toBe(502);
  });

  it("doesn't follow a redirect away from the checked Amazon URL", async () => {
    env();
    // Like fetch: follows the redirect unless told not to.
    const fetch = vi.fn(async (url, init = {}) => init.redirect === "manual"
      ? new Response(null, { status: 302, headers: { Location: "https://evil.example/x.jpg" } })
      : new Response(new Uint8Array([9]), { headers: { "Content-Type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetch);
    expect((await productImage(signedIn("B0AAAAAAAA"))).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://m.media-amazon.com/images/I/71a._SL160_.jpg", expect.objectContaining({ redirect: "manual" }));
  });
});
