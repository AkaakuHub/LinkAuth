import { page } from "../../shared/html.js";
import type { User } from "../../shared/user-api.js";
import type { AccountConfig } from "./account-config.js";
import { createAccountTokens } from "./account-tokens.js";
import { renderAccountView } from "./account-view.js";

export async function accountPage(
  user: User,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const tokens = await createAccountTokens(user, url, config);
  return page("Account", renderAccountView(user, tokens));
}
