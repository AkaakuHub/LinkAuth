type AppEnv = {
  APP_ID: string;
  DOMAIN_NAME: string;
  ACCOUNT_URL: string;
  SESSION_KID: string;
  APP_SESSION_HMAC_SECRET: string;
};

export type AppConfig = {
  appId: string;
  domainName: string;
  accountUrl: string;
  session: {
    kid: string;
    secret: string;
  };
  navigation: {
    AUTH_BASE_URL: string;
  };
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
    appId: requiredBinding("APP_ID", env.APP_ID),
    domainName: requiredBinding("DOMAIN_NAME", env.DOMAIN_NAME),
    accountUrl: requiredBinding("ACCOUNT_URL", env.ACCOUNT_URL),
    session: {
      kid: requiredBinding("SESSION_KID", env.SESSION_KID),
      secret: requiredBinding(
        "APP_SESSION_HMAC_SECRET",
        env.APP_SESSION_HMAC_SECRET,
      ),
    },
    navigation: {
      AUTH_BASE_URL: requiredBinding("ACCOUNT_URL", env.ACCOUNT_URL),
    },
  };
}

function requiredBinding(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
