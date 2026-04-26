import type {
  AuthNavigationConfig,
  LoginNavigationConfig,
} from "../../shared/navigation.js";
import type { UserApiConfig } from "../../shared/userApi.js";
import type { Env } from "./types.js";

const discordApiBase = "https://discord.com/api/v10";

export type AccountConfig = {
  domainName: string;
  assets: R2Bucket;
  discord: {
    apiBase: string;
    clientId: string;
    clientSecret: string;
  };
  csrf: {
    kid: string;
    secret: string;
  };
  session: {
    kid: string;
    secret: string;
  };
  navigation: AuthNavigationConfig & LoginNavigationConfig;
  userApi: UserApiConfig;
};

export function loadAccountConfig(env: Env): AccountConfig {
  return {
    domainName: requiredBinding("DOMAIN_NAME", env.DOMAIN_NAME),
    assets: env.ASSETS,
    discord: {
      apiBase: discordApiBase,
      clientId: requiredBinding("DISCORD_CLIENT_ID", env.DISCORD_CLIENT_ID),
      clientSecret: requiredBinding(
        "DISCORD_CLIENT_SECRET",
        env.DISCORD_CLIENT_SECRET,
      ),
    },
    csrf: {
      kid: requiredBinding("CSRF_KID", env.CSRF_KID),
      secret: requiredBinding("CSRF_HMAC_SECRET", env.CSRF_HMAC_SECRET),
    },
    session: {
      kid: requiredBinding("SESSION_KID", env.SESSION_KID),
      secret: requiredBinding("SESSION_HMAC_SECRET", env.SESSION_HMAC_SECRET),
    },
    navigation: {
      ACCOUNT_URL: requiredBinding("ACCOUNT_URL", env.ACCOUNT_URL),
      ALLOWED_RETURN_TO_ORIGINS: requiredBinding(
        "ALLOWED_RETURN_TO_ORIGINS",
        env.ALLOWED_RETURN_TO_ORIGINS,
      ),
      AUTH_LOGIN_URL: requiredBinding("AUTH_LOGIN_URL", env.AUTH_LOGIN_URL),
      AUTH_CALLBACK_URL: requiredBinding(
        "AUTH_CALLBACK_URL",
        env.AUTH_CALLBACK_URL,
      ),
    },
    userApi: {
      USER_API_URL: requiredBinding("USER_API_URL", env.USER_API_URL),
      INTERNAL_HMAC_KID: requiredBinding(
        "INTERNAL_HMAC_KID",
        env.INTERNAL_HMAC_KID,
      ),
      INTERNAL_HMAC_SECRET: requiredBinding(
        "INTERNAL_HMAC_SECRET",
        env.INTERNAL_HMAC_SECRET,
      ),
    },
  };
}

export function withAccountConfig(
  handler: (request: Request, config: AccountConfig) => Promise<Response>,
): ExportedHandler<Env> {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      return await handler(request, loadAccountConfig(env));
    },
  };
}

function requiredBinding(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
