import { authPanel, authShell } from "./lib/authUi.js";
import { formActionOrigins, page } from "./lib/html.js";
import { icon } from "./lib/icons.js";
import { linkButton } from "./lib/ui.js";

export function accountLandingPage(
  config: { apps: { callbackUrl: string }[] },
  discordAuthorizeUrl: string,
  options: { allowLocalhostCsp: boolean },
): Response {
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
    { ...options, formActionOrigins: formActionOrigins(config.apps) },
  );
}

export function noStoreHeaders(): Headers {
  return new Headers({
    "cache-control": "no-store, no-cache, max-age=0, must-revalidate",
    expires: "0",
    pragma: "no-cache",
  });
}
