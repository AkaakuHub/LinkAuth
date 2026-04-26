import {
  getSingleCookie,
  sessionCookieName,
  verifySessionCookie,
} from "../../../shared/src/session.js";
import type { AccountConfig } from "./account-config.js";

export async function requireSession(
  request: Request,
  config: AccountConfig,
): Promise<{ discord_id: string } | null> {
  const value = getSingleCookie(
    request.headers.get("cookie"),
    sessionCookieName,
  );
  if (!value) {
    return null;
  }
  return await verifySessionCookie(
    value,
    { [config.session.kid]: config.session.secret },
    Math.floor(Date.now() / 1000),
  );
}
