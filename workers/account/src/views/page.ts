import { page } from "../../../shared/html.js";
import type { User } from "../../../shared/userApi.js";
import type { AccountConfig } from "../accountConfig.js";
import { createAccountTokens } from "../security/accountTokens.js";
import { noStoreHeaders } from "./accountLandingPage.js";
import { accountView } from "./accountView.js";

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
    accountView({
      user,
      tokens,
      returnTo,
      showBackLink,
    }),
    200,
    noStoreHeaders(),
  );
}
