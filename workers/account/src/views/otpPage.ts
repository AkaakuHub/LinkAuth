import { attr, page } from "../../../shared/html.js";
import { icon } from "../../../shared/icons.js";
import { button, card, textInput } from "../../../shared/ui.js";
import { noStoreHeaders } from "./accountLandingPage.js";

export function otpPage(challengeId: string, returnTo: string): Response {
  return page(
    "OTP認証",
    `<div class="grid flex-1 place-items-center">${card({
      className: "grid w-full max-w-lg gap-5",
      children: `<div class="grid gap-2"><p class="inline-flex items-center gap-2 text-sm font-semibold text-primary">${icon("brand-discord")}Discord</p><h1 class="text-3xl font-semibold leading-tight text-ink">OTP認証</h1><p class="text-sm leading-7 text-muted">Discord DMに届いた認証コードを入力してください。</p></div><form class="grid gap-4" method="post" action="/otp"><input type="hidden" name="challenge_id"${attr("value", challengeId)}><input type="hidden" name="return_to"${attr("value", returnTo)}><div class="grid gap-2"><label class="text-sm font-medium text-ink" for="otp-code">認証コード</label>${textInput(
        {
          attributes:
            ' id="otp-code" name="otp" type="text" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code" data-otp-input required autofocus',
        },
      )}</div><label class="inline-flex items-start gap-2 text-sm leading-6 text-ink"><input type="checkbox" name="remember_me" value="1" checked><span>この端末でログイン状態を保持する</span></label>${button(
        {
          type: "submit",
          children: `${icon("shield-check")}認証`,
        },
      )}</form><script src="/account-client.js" defer></script>`,
    })}</div>`,
    200,
    noStoreHeaders(),
  );
}
