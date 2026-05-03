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
  return accountErrorPage(config, {
    title: "利用資格がありません",
    description:
      "このDiscordアカウントは、現在この認証基盤の利用条件を満たしていません。",
  });
}

export function authFailedPage(config: AccountConfig): Promise<Response> {
  return accountErrorPage(config, {
    title: "認証に失敗しました",
    description:
      "認証リクエストが無効、期限切れ、またはすでに使用済みです。もう一度ログインしてください。",
  });
}

export function otpDeliveryFailedPage(
  config: AccountConfig,
): Promise<Response> {
  return accountErrorPage(config, {
    title: "認証コードを送信できませんでした",
    description:
      "DiscordのDMへ認証コードを送信できませんでした。DiscordのDM設定、対象サーバーへの参加状態、Botの参加状態を確認してください。",
  });
}

function accountErrorPage(
  config: AccountConfig,
  content: { title: string; description: string },
): Promise<Response> {
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
            {content.title}
          </h1>
          <p className="text-sm leading-7 text-muted">{content.description}</p>
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
