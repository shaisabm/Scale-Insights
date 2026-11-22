import { createSessionToken, secretMatches, sessionCookie } from "../server/auth.js";
import { json } from "../server/http.js";

export async function POST(request) {
  const { APP_PASSWORD, SESSION_SECRET } = process.env;
  if (!APP_PASSWORD || !SESSION_SECRET) return json({ error: "Sign-in is not configured." }, 500);
  const body = await request.json().catch(() => ({}));
  if (!secretMatches(body && body.password, APP_PASSWORD)) return json({ error: "Wrong password." }, 401);
  return json({ signedIn: true }, 200, { "Set-Cookie": sessionCookie(createSessionToken(SESSION_SECRET)) });
}
