import { page } from "../../shared/html.js";
import type { User } from "../../shared/userApi.js";
import type { AccountConfig } from "./accountConfig.js";
import { noStoreHeaders } from "./accountLandingPage.js";
import { createAccountTokens } from "./accountTokens.js";
import { AccountView } from "./accountView.js";

export async function accountPage(
  user: User,
  url: URL,
  config: AccountConfig,
  returnTo: string,
): Promise<Response> {
  const tokens = await createAccountTokens(user, url, config);
  const showBackLink = returnTo !== config.navigation.ACCOUNT_URL;
  return page(
    "Account",
    <AccountView
      user={user}
      tokens={tokens}
      returnTo={returnTo}
      showBackLink={showBackLink}
    />,
    200,
    noStoreHeaders(),
  );
}
