import { clearedSessionCookie } from "../server/auth.js";
import { json } from "../server/http.js";

export function POST() {
  return json({ signedIn: false }, 200, { "Set-Cookie": clearedSessionCookie });
}
