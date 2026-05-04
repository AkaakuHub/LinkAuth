import {
  deleteCookie,
  rememberCookieName,
  sessionCookieName,
} from "../../../../shared/src/session.js";
import { page } from "../../../shared/html.js";
import { icon } from "../../../shared/icons.js";
import { authHomeUrl } from "../../../shared/navigation.js";
import { card, linkButton } from "../../../shared/ui.js";
import type { AccountConfig } from "../accountConfig.js";
import { noStoreHeaders } from "./accountLandingPage.js";

export function inactiveAccountPage(config: AccountConfig): Response {
  return accountErrorPage(config, {
    title: "利用資格がありません",
    description:
      "このDiscordアカウントは、現在この認証基盤の利用条件を満たしていません。",
  });
}

export function authFailedPage(config: AccountConfig): Response {
  return accountErrorPage(config, {
    title: "認証に失敗しました",
    description:
      "認証リクエストが無効、期限切れ、またはすでに使用済みです。もう一度ログインしてください。",
  });
}

export function otpDeliveryFailedPage(config: AccountConfig): Response {
  return accountErrorPage(config, {
    title: "認証コードを送信できませんでした",
    description:
      "DiscordのDMへ認証コードを送信できませんでした。対象サーバーからのDM受信設定、Botのブロック状態、Discordの一時的な障害を確認してください。",
  });
}

function accountErrorPage(
  config: AccountConfig,
  content: { title: string; description: string },
): Response {
  const headers = noStoreHeaders();
  headers.append("set-cookie", deleteCookie(sessionCookieName));
  headers.append("set-cookie", deleteCookie(rememberCookieName));

  return page(
    "認証できません",
    `<div class="grid flex-1 place-items-center">${card({
      className: "grid w-full max-w-lg gap-5",
      children: `<div class="grid gap-2"><p class="inline-flex items-center gap-2 text-sm font-semibold text-danger">${icon("alert-triangle")}認証できません</p><h1 class="text-3xl font-semibold leading-tight text-ink">${content.title}</h1><p class="text-sm leading-7 text-muted">${content.description}</p></div>${linkButton(
        {
          href: authHomeUrl(config.navigation),
          variant: "secondary",
          children: `${icon("home", 20)}アカウントトップへ戻る`,
        },
      )}`,
    })}</div>`,
    401,
    headers,
  );
}
