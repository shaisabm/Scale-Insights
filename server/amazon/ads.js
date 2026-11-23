import { gunzipSync } from "node:zlib";
import { getAccessToken } from "./lwa.js";

const REPORT_MEDIA = "application/vnd.createasyncreportrequest.v3+json";

// POSTs that only read: report requests (they create a download, not a change to the account),
// the product metadata lookup, and the v3 list endpoints such as /sp/campaigns/list.
const READ_POSTS = [/^\/reporting\/reports$/, /^\/product\/metadata$/, /\/list$/];

export function isReadOnly(method, path) {
  if (method === "GET") return true;
  // Match the path alone: a query or fragment such as "#/list" must not make a write look like a read.
  return method === "POST" && READ_POSTS.some(re => re.test(path.split(/[?#]/)[0]));
}

/**
 * Agents only read from the real profile. A write may go to the test account's profile, or to
 * the real profile only in production when a signed-in person asked for it.
 */
export function assertAllowed({ method, path, profileId, testProfileId, production, humanApproved }) {
  if (isReadOnly(method, path)) return;
  if (testProfileId && String(profileId) === String(testProfileId)) return;
  if (production && humanApproved) return;
  throw new Error(`Blocked ${method} ${path}: outside production, Amazon Ads writes may only go to the test account.`);
}

/** Amazon Ads API client. Every request passes the write guard first. */
export function createAdsClient(cfg, { fetch = globalThis.fetch } = {}) {
  // `signal` lets the caller stop the request, reading its answer included.
  async function request(method, path, { profileId, body, contentType = "application/json", accept, humanApproved = false, signal } = {}) {
    assertAllowed({ method, path, profileId, testProfileId: cfg.testProfileId, production: cfg.production, humanApproved });
    const url = new URL(cfg.host + path);
    if (url.protocol !== "https:") throw new Error(`Refusing to send Amazon Ads credentials to ${url.origin}: the Ads API host must use https.`);
    const onTestAccount = Boolean(cfg.testProfileId) && String(profileId) === String(cfg.testProfileId);
    const token = await getAccessToken(
      { clientId: cfg.clientId, clientSecret: cfg.clientSecret, refreshToken: onTestAccount ? cfg.testRefreshToken : cfg.refreshToken },
      { fetch },
    );
    const headers = { Authorization: `Bearer ${token}`, "Amazon-Advertising-API-ClientId": cfg.clientId, Accept: accept || contentType };
    if (profileId) headers["Amazon-Advertising-API-Scope"] = String(profileId);
    if (body !== undefined) headers["Content-Type"] = contentType;
    const res = await fetch(url.href, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  }

  return {
    request,

    /** Requests an async report and returns its id. A duplicate of a pending request returns the existing id. */
    async createReport(profileId, spec) {
      const { status, data } = await request("POST", "/reporting/reports", { profileId, body: spec, contentType: REPORT_MEDIA });
      if (status === 200 && data && data.reportId) return data.reportId;
      const duplicate = status === 425 && /duplicate of\s*:?\s*([0-9a-f-]{36})/i.exec((data && data.detail) || "");
      if (duplicate) return duplicate[1];
      throw new Error(`Report request failed: HTTP ${status} ${JSON.stringify(data).slice(0, 300)}`);
    },

    /** Report status: { status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED", url, failureReason }. */
    async getReport(profileId, reportId) {
      const { status, data } = await request("GET", `/reporting/reports/${encodeURIComponent(reportId)}`, { profileId, accept: REPORT_MEDIA });
      if (status !== 200) throw new Error(`Report status failed: HTTP ${status} ${JSON.stringify(data).slice(0, 300)}`);
      return data;
    },

    /** Downloads a completed GZIP_JSON report from its pre-signed URL. */
    async downloadReport(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Report download failed: HTTP ${res.status}`);
      return JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"));
    },
  };
}
