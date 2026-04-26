import type { LoginNavigationConfig } from "../../shared/navigation.js";

type AppEnv = {
  ACCOUNT_URL: string;
  AUTH_LOGIN_URL: string;
  SESSION_KID: string;
  SESSION_HMAC_SECRET: string;
};

export type AppConfig = {
  accountUrl: string;
  session: {
    kid: string;
    secret: string;
  };
  navigation: LoginNavigationConfig;
};

export function withAppConfig(
  handler: (request: Request, config: AppConfig) => Promise<Response>,
): ExportedHandler<AppEnv> {
  return {
    async fetch(request: Request, env: AppEnv): Promise<Response> {
      return await handler(request, loadAppConfig(env));
    },
  };
}

function loadAppConfig(env: AppEnv): AppConfig {
  return {
    accountUrl: requiredBinding("ACCOUNT_URL", env.ACCOUNT_URL),
    session: {
      kid: requiredBinding("SESSION_KID", env.SESSION_KID),
      secret: requiredBinding("SESSION_HMAC_SECRET", env.SESSION_HMAC_SECRET),
    },
    navigation: {
      AUTH_LOGIN_URL: requiredBinding("AUTH_LOGIN_URL", env.AUTH_LOGIN_URL),
    },
  };
}

function requiredBinding(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
