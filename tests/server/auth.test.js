import { describe, expect, it, vi } from "vitest";
import { POST as login } from "../../api/login.js";
import { POST as logout } from "../../api/logout.js";
import { GET as session } from "../../api/session.js";
import { SESSION_COOKIE, createSessionToken, requireUser, secretMatches, verifySessionToken } from "../../server/auth.js";

const SECRET = "session-secret";
const NOW = Date.UTC(2026, 10, 22);
const withCookie = token => new Request("https://app.test/api/x", { headers: { cookie: `other=1; ${SESSION_COOKIE}=${token}` } });
const loginRequest = body => new Request("https://app.test/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("secretMatches", () => {
  it("matches equal strings only", () => {
    expect(secretMatches("open sesame", "open sesame")).toBe(true);
    expect(secretMatches("open sesam", "open sesame")).toBe(false);
    expect(secretMatches("", "open sesame")).toBe(false);
    expect(secretMatches(undefined, "open sesame")).toBe(false);
    expect(secretMatches("anything", "")).toBe(false);
  });
});

describe("session tokens", () => {
  it("accepts a fresh token signed with the same secret", () => {
    expect(verifySessionToken(createSessionToken(SECRET, NOW), SECRET, NOW)).toBe(true);
  });

  it("rejects another secret, a changed expiry, an expired token and junk", () => {
    const token = createSessionToken(SECRET, NOW);
    const [version, expiry, signature] = token.split(".");
    expect(verifySessionToken(token, "other-secret", NOW)).toBe(false);
    expect(verifySessionToken(`${version}.${Number(expiry) + 3600}.${signature}`, SECRET, NOW)).toBe(false);
    expect(verifySessionToken(token, SECRET, NOW + 31 * 86_400_000)).toBe(false);
    expect(verifySessionToken("v1.abc.def", SECRET, NOW)).toBe(false);
    expect(verifySessionToken("", SECRET, NOW)).toBe(false);
  });
});

describe("requireUser", () => {
  it("returns 401 without a valid session and null with one", async () => {
    const env = { SESSION_SECRET: SECRET };
    const denied = requireUser(new Request("https://app.test/api/x"), env);
    expect(denied.status).toBe(401);
    expect(await denied.json()).toEqual({ error: "Sign in required." });
    expect(requireUser(withCookie(createSessionToken(SECRET)), env)).toBeNull();
  });

  it("returns 500 when no session secret is configured", () => {
    expect(requireUser(withCookie("x"), {}).status).toBe(500);
  });
});

describe("POST /api/login", () => {
  it("sets a session cookie for the right password", async () => {
    vi.stubEnv("APP_PASSWORD", "correct horse");
    vi.stubEnv("SESSION_SECRET", SECRET);
    const res = await login(loginRequest({ password: "correct horse" }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=v1\\.`));
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    const token = cookie.split(";")[0].split("=")[1];
    expect(verifySessionToken(token, SECRET)).toBe(true);
  });

  it("refuses a wrong or missing password without a cookie", async () => {
    vi.stubEnv("APP_PASSWORD", "correct horse");
    vi.stubEnv("SESSION_SECRET", SECRET);
    for (const body of [{ password: "wrong" }, {}, "not json"]) {
      const res = await login(loginRequest(body));
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("returns 500 when sign-in isn't configured", async () => {
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect((await login(loginRequest({ password: "" }))).status).toBe(500);
  });
});

describe("logout and session", () => {
  it("logout clears the cookie", () => {
    expect(logout().headers.get("set-cookie")).toMatch(new RegExp(`^${SESSION_COOKIE}=;.*Max-Age=0`));
  });

  it("session reports whether the cookie is valid", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect(await session(withCookie(createSessionToken(SECRET))).json()).toEqual({ signedIn: true });
    expect(await session(withCookie("v1.1.bad")).json()).toEqual({ signedIn: false });
  });
});
