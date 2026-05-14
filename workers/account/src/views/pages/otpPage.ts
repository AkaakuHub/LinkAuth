import type { AccountConfig } from "../../accountConfig.js";
import { authPanel, authShell } from "../lib/authUi.js";
import { attr, formActionOrigins, page } from "../lib/html.js";
import { icon } from "../lib/icons.js";
import { button, textInput } from "../lib/ui.js";
import { noStoreHeaders } from "./accountLandingPage.js";

export function otpPage(
  config: AccountConfig,
  challengeId: string,
  returnTo: string,
  appId?: string,
): Response {
  const appInput = appId
    ? `<input type="hidden" name="app_id"${attr("value", appId)}>`
    : "";
  return page(
    "OTP認証",
    authShell(
      authPanel({
        label: "Discord",
        title: "OTP認証",
        description: "Discord DMに届いた6桁の認証コードを入力してください。",
        children: `<form class="grid gap-5" method="post" action="/otp"><input type="hidden" name="challenge_id"${attr("value", challengeId)}><input type="hidden" name="return_to"${attr("value", returnTo)}>${appInput}<div class="grid gap-2"><label class="text-sm font-medium text-ink" for="otp-code">認証コード</label>${textInput(
          {
            className: "text-center text-xl font-semibold",
            attributes:
              ' id="otp-code" name="otp" type="text" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code" data-otp-input required autofocus',
          },
        )}</div><label class="inline-flex items-start gap-3 rounded-md border border-line bg-haze px-3 py-3 text-sm leading-6 text-ink"><input class="mt-1 accent-primary" type="checkbox" name="remember_me" value="1" checked><span>この端末でログイン状態を保持する</span></label>${button(
          {
            type: "submit",
            className: "w-full",
            children: `${icon("shield-check")}認証`,
          },
        )}</form><script src="/account-client.js" defer></script>`,
      }),
    ),
    200,
    noStoreHeaders(),
    {
      allowLocalhostCsp: config.environment === "local",
      formActionOrigins: formActionOrigins(config.apps),
    },
  );
}
