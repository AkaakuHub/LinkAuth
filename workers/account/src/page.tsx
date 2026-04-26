import { page } from "../../shared/html.js";
import type { User } from "../../shared/userApi.js";
import type { AccountConfig } from "./accountConfig.js";
import { createAccountTokens } from "./accountTokens.js";
import { AccountView } from "./accountView.js";

export async function accountPage(
  user: User,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const tokens = await createAccountTokens(user, url, config);
  return page("Account", <AccountView user={user} tokens={tokens} />);
}
