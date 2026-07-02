import { createCsrfToken } from "../../../../src/csrf.js";
import type { AccountConfig } from "../accountConfig.js";
import type { User } from "../domain/user.js";
import { assertSecret, requestOrigin } from "./requestContext.js";

export type AccountTokens = {
  profile: string;
  avatar: string;
  logout: string;
  delete: string;
  token: string;
  appGuildAccess: string;
};

export async function createAccountTokens(
  user: User,
  url: URL,
  config: AccountConfig,
): Promise<AccountTokens> {
  const origin = requestOrigin(url, config.domainName);
  const now = Math.floor(Date.now() / 1000);
  assertSecret("CSRF_HMAC_SECRET", config.csrf.secret);

  return {
    profile: await createCsrfToken({
      discordId: user.discord_id,
      origin,
      action: "profile",
      kid: config.csrf.kid,
      secret: config.csrf.secret,
      now,
    }),
    avatar: await createCsrfToken({
      discordId: user.discord_id,
      origin,
      action: "avatar",
      kid: config.csrf.kid,
      secret: config.csrf.secret,
      now,
    }),
    logout: await createCsrfToken({
      discordId: user.discord_id,
      origin,
      action: "logout",
      kid: config.csrf.kid,
      secret: config.csrf.secret,
      now,
    }),
    delete: await createCsrfToken({
      discordId: user.discord_id,
      origin,
      action: "delete",
      kid: config.csrf.kid,
      secret: config.csrf.secret,
      now,
    }),
    token: await createCsrfToken({
      discordId: user.discord_id,
      origin,
      action: "token",
      kid: config.csrf.kid,
      secret: config.csrf.secret,
      now,
    }),
    appGuildAccess: await createCsrfToken({
      discordId: user.discord_id,
      origin,
      action: "app-guild-access",
      kid: config.csrf.kid,
      secret: config.csrf.secret,
      now,
    }),
  };
}
