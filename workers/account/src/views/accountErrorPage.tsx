import { IconAlertTriangle, IconHome } from "@tabler/icons-react";
import {
  deleteCookie,
  rememberCookieName,
  sessionCookieName,
} from "../../../../shared/src/session.js";
import { page } from "../../../shared/html.js";
import { authHomeUrl } from "../../../shared/navigation.js";
import { Card, LinkButton } from "../../../shared/ui.js";
import type { AccountConfig } from "../accountConfig.js";
import { noStoreHeaders } from "./accountLandingPage.js";

export function inactiveAccountPage(config: AccountConfig): Promise<Response> {
  const headers = noStoreHeaders();
  headers.append(
    "set-cookie",
    deleteCookie(sessionCookieName, config.domainName),
  );
  headers.append(
    "set-cookie",
    deleteCookie(rememberCookieName, config.domainName),
  );

  return page(
    "認証できません",
    <div className="grid flex-1 place-items-center">
      <Card className="grid w-full max-w-lg gap-5">
        <div className="grid gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-danger">
            <IconAlertTriangle aria-hidden size={18} />
            認証できません
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-ink">
            登録が有効ではありません
          </h1>
          <p className="text-sm leading-7 text-muted">
            このDiscordアカウントは未登録、無効化済み、または削除済みです。サーバーで登録し直してからログインしてください。
          </p>
        </div>
        <LinkButton href={authHomeUrl(config.navigation)} variant="secondary">
          <IconHome aria-hidden size={20} />
          アカウントトップへ戻る
        </LinkButton>
      </Card>
    </div>,
    401,
    headers,
  );
}
