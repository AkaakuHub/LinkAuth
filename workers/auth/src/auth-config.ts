import type { AuthNavigationConfig } from "../../shared/navigation.js";
import type { UserApiConfig } from "../../shared/user-api.js";

export type AuthEnv = UserApiConfig & {
  DOMAIN_NAME: string;
  ACCOUNT_URL: string;
  APP_URL: string;
  DISCORD_API_BASE: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  AUTH_CALLBACK_URL: string;
  SESSION_KID: string;
  SESSION_HMAC_SECRET: string;
  CSRF_HMAC_SECRET: string;
};

export type AuthConfig = {
  domainName: string;
  discord: {
    apiBase: string;
    clientId: string;
    clientSecret: string;
  };
  session: {
    kid: string;
    secret: string;
  };
  csrf: {
    secret: string;
  };
  navigation: AuthNavigationConfig;
  userApi: UserApiConfig;
};

export function withAuthConfig(
  handler: (request: Request, config: AuthConfig) => Promise<Response>,
): ExportedHandler<AuthEnv> {
  return {
    async fetch(request: Request, env: AuthEnv): Promise<Response> {
      return await handler(request, loadAuthConfig(env));
    },
  };
}

function loadAuthConfig(env: AuthEnv): AuthConfig {
  return {
    domainName: requiredBinding("DOMAIN_NAME", env.DOMAIN_NAME),
    discord: {
      apiBase: requiredBinding("DISCORD_API_BASE", env.DISCORD_API_BASE),
      clientId: requiredBinding("DISCORD_CLIENT_ID", env.DISCORD_CLIENT_ID),
      clientSecret: requiredBinding(
        "DISCORD_CLIENT_SECRET",
        env.DISCORD_CLIENT_SECRET,
      ),
    },
    session: {
      kid: requiredBinding("SESSION_KID", env.SESSION_KID),
      secret: requiredBinding("SESSION_HMAC_SECRET", env.SESSION_HMAC_SECRET),
    },
    csrf: {
      secret: requiredBinding("CSRF_HMAC_SECRET", env.CSRF_HMAC_SECRET),
    },
    navigation: {
      ACCOUNT_URL: requiredBinding("ACCOUNT_URL", env.ACCOUNT_URL),
      APP_URL: requiredBinding("APP_URL", env.APP_URL),
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

function requiredBinding(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
