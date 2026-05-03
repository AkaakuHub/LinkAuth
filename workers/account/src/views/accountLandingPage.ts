import { page } from "../../../shared/html.js";
import { icon } from "../../../shared/icons.js";
import { card, linkButton } from "../../../shared/ui.js";

export function accountLandingPage(discordAuthorizeUrl: string): Response {
  return page(
    "Account",
    `<div class="grid flex-1 place-items-center">${card({
      className: "grid w-full max-w-lg gap-5",
      children: `<div class="grid gap-2"><p class="text-sm font-semibold text-primary">Account</p><h1 class="text-3xl font-semibold leading-tight text-ink">アカウント管理</h1><p class="text-sm leading-7 text-muted">Discordでログインしてアカウント情報を管理します。</p></div>${linkButton(
        {
          href: discordAuthorizeUrl,
          children: `${icon("brand-discord", 20)}Discordでログイン`,
        },
      )}`,
    })}</div>`,
    200,
    noStoreHeaders(),
  );
}

export function noStoreHeaders(): Headers {
  return new Headers({
    "cache-control": "no-store, no-cache, max-age=0, must-revalidate",
    expires: "0",
    pragma: "no-cache",
  });
}
