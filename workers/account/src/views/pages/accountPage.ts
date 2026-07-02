import type { AccountConfig } from "../../accountConfig.js";
import { listAppGuildAccess } from "../../data/appGuildAccess.js";
import { listPersonalAccessTokens } from "../../data/personalAccessTokens.js";
import type { User } from "../../domain/user.js";
import { createAccountTokens } from "../../security/accountTokens.js";
import { accountView } from "../account/accountView.js";
import { formActionOrigins, page } from "../lib/html.js";
import { noStoreHeaders } from "./accountLandingPage.js";

export async function accountPage(
  user: User,
  url: URL,
  config: AccountConfig,
  returnTo: string,
  issuedToken: string | undefined = undefined,
): Promise<Response> {
  const tokens = await createAccountTokens(user, url, config);
  const personalAccessTokens = await listPersonalAccessTokens(
    config,
    user.discord_id,
  );
  const appGuildAccess =
    user.role === "admin" ? await listAppGuildAccess(config) : [];
  const showBackLink = returnTo !== config.navigation.ACCOUNT_URL;
  return page(
    "Account",
    accountView({
      issuedToken,
      appGuildAccess,
      apps: config.apps,
      guildIds: config.discord.guildIds,
      personalAccessTokens,
      user,
      tokens,
      returnTo,
      showBackLink,
    }),
    200,
    noStoreHeaders(),
    {
      allowLocalhostCsp: config.environment === "local",
      formActionOrigins: formActionOrigins(config.apps),
    },
  );
}
