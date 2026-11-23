const TOKEN_URL = "https://api.amazon.com/auth/o2/token";

// Access tokens last an hour. Cache them per refresh token and renew a minute early.
const cache = new Map();
// Token requests in flight, per refresh token, so concurrent cache misses share one request.
const inflight = new Map();

/** Login with Amazon access token for a refresh token. */
export async function getAccessToken({ clientId, clientSecret, refreshToken }, { fetch = globalThis.fetch, now = Date.now } = {}) {
  const hit = cache.get(refreshToken);
  if (hit && hit.expiresAt - 60_000 > now()) return hit.token;
  if (!inflight.has(refreshToken)) {
    const request = (async () => {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.access_token) throw new Error(`Login with Amazon token request failed: HTTP ${res.status} ${body.error || ""}`.trim());
      cache.set(refreshToken, { token: body.access_token, expiresAt: now() + (body.expires_in || 3600) * 1000 });
      return body.access_token;
    })();
    // Forget the request once it settles, so a failure can be retried by the next call.
    const shared = request.finally(() => {
      if (inflight.get(refreshToken) === shared) inflight.delete(refreshToken);
    });
    inflight.set(refreshToken, shared);
  }
  return inflight.get(refreshToken);
}

export function clearTokenCache() {
  cache.clear();
  inflight.clear();
}
