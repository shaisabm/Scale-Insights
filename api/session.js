import { isSignedIn } from "../server/auth.js";
import { json } from "../server/http.js";

export function GET(request) {
  return json({ signedIn: Boolean(process.env.SESSION_SECRET) && isSignedIn(request, process.env.SESSION_SECRET) });
}
