import { authPanel, authShell } from "../../../shared/authUi.js";
import { page } from "../../../shared/html.js";
import { icon } from "../../../shared/icons.js";
import { linkButton } from "../../../shared/ui.js";

export function accountLandingPage(discordAuthorizeUrl: string): Response {
  return page(
    "Account",
    authShell(
      authPanel({
        iconName: "shield-check",
        label: "LinkAuth",
        title: "アカウント管理",
        description: "Discordで本人確認し、アカウント情報を安全に管理します。",
        children: linkButton({
          href: discordAuthorizeUrl,
          className: "w-full",
          children: `${icon("brand-discord", 20)}Discordでログイン`,
        }),
      }),
    ),
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
