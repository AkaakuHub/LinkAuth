import {
  deleteCookie,
  rememberCookieName,
  sessionCookieName,
} from "../../../../../src/session.js";
import type { AccountConfig } from "../../accountConfig.js";
import { authHomeUrl } from "../../domain/navigation.js";
import { authPanel, authShell } from "../lib/authUi.js";
import { formActionOrigins, page } from "../lib/html.js";
import { icon } from "../lib/icons.js";
import { linkButton } from "../lib/ui.js";
import { noStoreHeaders } from "./accountLandingPage.js";

export function inactiveAccountPage(
  config: AccountConfig,
  returnTo?: string,
): Response {
  return accountErrorPage(config, {
    title: "利用資格がありません",
    description:
      "このDiscordアカウントは、現在この認証基盤の利用条件を満たしていません。",
    returnTo,
  });
}

export function authFailedPage(
  config: AccountConfig,
  returnTo?: string,
): Response {
  return accountErrorPage(config, {
    title: "認証に失敗しました",
    description:
      "認証リクエストが無効、期限切れ、またはすでに使用済みです。もう一度ログインしてください。",
    returnTo,
  });
}

export function otpRateLimitedPage(
  config: AccountConfig,
  returnTo?: string,
): Response {
  return accountErrorPage(
    config,
    {
      title: "認証コードの発行回数が多すぎます",
      description:
        "短時間に認証コードを複数回発行したため、しばらく待ってからもう一度ログインしてください。",
      returnTo,
    },
    429,
  );
}

export function otpDeliveryFailedPage(
  config: AccountConfig,
  returnTo?: string,
): Response {
  return accountErrorPage(config, {
    title: "認証コードを送信できませんでした",
    description:
      "DiscordのDMへ認証コードを送信できませんでした。対象サーバーからのDM受信設定、Botのブロック状態、Discordの一時的な障害を確認してください。",
    returnTo,
  });
}

function accountErrorPage(
  config: AccountConfig,
  content: { title: string; description: string; returnTo: string | undefined },
  status = 401,
): Response {
  const headers = noStoreHeaders();
  headers.append("set-cookie", deleteCookie(sessionCookieName));
  headers.append("set-cookie", deleteCookie(rememberCookieName));
  const returnUrl = content.returnTo ?? authHomeUrl(config.navigation);
  const returnLabel = content.returnTo ? "戻る" : "アカウントトップへ戻る";

  return page(
    "認証できません",
    authShell(
      authPanel({
        iconName: "alert-triangle",
        label: "認証できません",
        title: content.title,
        description: content.description,
        tone: "danger",
        children: linkButton({
          href: returnUrl,
          className: "w-full",
          variant: "secondary",
          children: `${icon(content.returnTo ? "arrow-left" : "home", 20)}${returnLabel}`,
        }),
      }),
    ),
    status,
    headers,
    {
      allowLocalhostCsp: config.environment === "local",
      formActionOrigins: formActionOrigins(config.apps),
    },
  );
}
