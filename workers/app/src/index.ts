import {
  getSingleCookie,
  sessionCookieName,
  verifySessionCookie,
} from "../../../shared/src/session.js";
import { page } from "../../shared/html.js";
import { redirectToLogin } from "../../shared/navigation.js";
import { type AppConfig, withAppConfig } from "./app-config.js";

export default withAppConfig(handleAppRequest);

async function handleAppRequest(
  request: Request,
  config: AppConfig,
): Promise<Response> {
  const session = getSingleCookie(
    request.headers.get("cookie"),
    sessionCookieName,
  );
  const payload = session
    ? await verifySessionCookie(
        session,
        { [config.session.kid]: config.session.secret },
        Math.floor(Date.now() / 1000),
      )
    : null;
  if (!payload) {
    return redirectToLogin(config.navigation, request.url);
  }
  return page(
    "App",
    `<h1>App</h1><section class="panel">ログイン済みです。${payload.display_name}</section>`,
  );
}
