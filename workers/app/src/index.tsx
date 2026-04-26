import { IconApps } from "@tabler/icons-react";
import {
  getSingleCookie,
  sessionCookieName,
  verifySessionCookie,
} from "../../../shared/src/session.js";
import { page } from "../../shared/html.js";
import { redirectToLogin } from "../../shared/navigation.js";
import { Card } from "../../shared/ui.js";
import { type AppConfig, withAppConfig } from "./appConfig.js";

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
    <div className="grid flex-1 place-items-center">
      <Card className="w-full max-w-lg">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
          <IconApps aria-hidden size={18} />
          App
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-ink">
          ログイン済みです
        </h1>
        <p className="mt-4 text-sm text-muted">{payload.display_name}</p>
      </Card>
    </div>,
  );
}
