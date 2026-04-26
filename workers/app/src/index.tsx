import { IconApps, IconLogin, IconSettings } from "@tabler/icons-react";
import {
  getSingleCookie,
  sessionCookieName,
  verifySessionCookie,
} from "../../../shared/src/session.js";
import { page } from "../../shared/html.js";
import { Card, LinkButton } from "../../shared/ui.js";
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
  const loginUrl = new URL(config.navigation.AUTH_LOGIN_URL);
  loginUrl.searchParams.set("return_to", request.url);
  if (!payload) {
    return page(
      "Service",
      <div className="grid flex-1 place-items-center">
        <Card className="grid w-full max-w-lg gap-5">
          <div className="grid gap-3">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
              <IconApps aria-hidden size={18} />
              Service
            </p>
            <div className="grid gap-1">
              <h1 className="text-3xl font-semibold leading-tight text-ink">
                サービストップ
              </h1>
              <p className="text-sm text-muted">
                ログインすると認証済み表示を確認できます。
              </p>
            </div>
          </div>
          <LinkButton href={loginUrl.toString()}>
            <IconLogin aria-hidden size={18} />
            ログイン
          </LinkButton>
        </Card>
      </div>,
    );
  }
  const accountUrl = new URL(config.accountUrl);
  accountUrl.searchParams.set(
    "return_to",
    new URL("/", request.url).toString(),
  );
  return page(
    "App",
    <div className="grid flex-1 place-items-center">
      <Card className="grid w-full max-w-lg gap-5">
        <div className="grid gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <IconApps aria-hidden size={18} />
            App
          </p>
          <div className="grid gap-1">
            <h1 className="text-3xl font-semibold leading-tight text-ink">
              ログイン済みです
            </h1>
            <p className="text-sm text-muted">{payload.display_name}</p>
          </div>
        </div>
        <LinkButton href={accountUrl.toString()} variant="secondary">
          <IconSettings aria-hidden size={18} />
          アカウント管理
        </LinkButton>
      </Card>
    </div>,
  );
}
