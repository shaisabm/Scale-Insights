import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { json, parseCookies } from "./http.js";

// One shared password (APP_PASSWORD) signs a person in. The session is a signed cookie, so
// there is nothing to store server-side: "v1.<expiry in seconds>.<HMAC of the first two parts>".
export const SESSION_COOKIE = "sp_session";
const MAX_AGE = 30 * 24 * 3600;

const sign = (secret, payload) => createHmac("sha256", secret).update(payload).digest("base64url");

/** Constant-time comparison of two strings of any length. */
export function secretMatches(input, expected) {
  if (typeof input !== "string" || !expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

export function createSessionToken(secret, now = Date.now()) {
  const payload = `v1.${Math.floor(now / 1000) + MAX_AGE}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (!token || !secret) return false;
  const [version, expiry, signature] = String(token).split(".");
  if (version !== "v1" || !/^\d+$/.test(expiry || "") || !signature) return false;
  return secretMatches(signature, sign(secret, `${version}.${expiry}`)) && Number(expiry) * 1000 > now;
}

export const sessionCookie = token => `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
export const clearedSessionCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function isSignedIn(request, secret, now = Date.now()) {
  return verifySessionToken(parseCookies(request.headers.get("cookie"))[SESSION_COOKIE], secret, now);
}

/** A 401 response when the request has no valid session, otherwise null. */
export function requireUser(request, env = process.env) {
  if (!env.SESSION_SECRET) return json({ error: "Sign-in is not configured." }, 500);
  return isSignedIn(request, env.SESSION_SECRET) ? null : json({ error: "Sign in required." }, 401);
}
