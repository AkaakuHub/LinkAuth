import { parseCommaSeparatedList } from "../../../shared/src/commaSeparated.js";
import type {
  AuthBaseNavigationConfig,
  AuthNavigationConfig,
} from "../../shared/navigation.js";
import type { UserApiConfig } from "../../shared/userApi.js";
import type { Env } from "./types.js";

const discordApiBase = "https://discord.com/api/v10";

export type AccountConfig = {
  domainName: string;
  apps: AppDefinition[];
  assets: R2Bucket;
  discord: {
    apiBase: string;
    clientId: string;
    clientSecret: string;
    botToken: string;
    guildIds: string[];
  };
  csrf: {
    kid: string;
    secret: string;
  };
  session: {
    kid: string;
    secret: string;
  };
  navigation: AuthNavigationConfig & AuthBaseNavigationConfig;
  userApi: UserApiConfig;
};

export type AppDefinition = {
  appId: string;
  callbackUrl: string;
  sessionVerifySecret?: string;
};

export function loadAccountConfig(env: Env): AccountConfig {
  const accountUrl = requiredBinding("ACCOUNT_URL", env.ACCOUNT_URL);
  const apps = parseAppDefinitions(requiredBinding("AUTH_APPS", env.AUTH_APPS));
  return {
    domainName: requiredBinding("DOMAIN_NAME", env.DOMAIN_NAME),
    apps,
    assets: env.ASSETS,
    discord: {
      apiBase: env.DISCORD_API_BASE || discordApiBase,
      clientId: requiredBinding("DISCORD_CLIENT_ID", env.DISCORD_CLIENT_ID),
      clientSecret: requiredBinding(
        "DISCORD_CLIENT_SECRET",
        env.DISCORD_CLIENT_SECRET,
      ),
      botToken: requiredBinding("DISCORD_BOT_TOKEN", env.DISCORD_BOT_TOKEN),
      guildIds: parseCommaSeparatedList(
        "DISCORD_GUILD_IDS",
        requiredBinding("DISCORD_GUILD_IDS", env.DISCORD_GUILD_IDS),
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
      ACCOUNT_URL: accountUrl,
      ALLOWED_RETURN_TO_ORIGINS: appOrigins(apps),
      AUTH_BASE_URL: accountUrl,
      AUTH_CALLBACK_URL: new URL("/callback", accountUrl).toString(),
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

function parseAppDefinitions(value: string): AppDefinition[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("AUTH_APPS must be an array");
  }
  return parsed.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("AUTH_APPS item is invalid");
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.app_id !== "string" ||
      typeof record.callback_url !== "string" ||
      (record.session_verify_secret !== undefined &&
        typeof record.session_verify_secret !== "string")
    ) {
      throw new Error("AUTH_APPS item is invalid");
    }
    const app = {
      appId: record.app_id,
      callbackUrl: record.callback_url,
    };
    return record.session_verify_secret
      ? { ...app, sessionVerifySecret: record.session_verify_secret }
      : app;
  });
}

function appOrigins(apps: AppDefinition[]): string {
  return [...new Set(apps.map((app) => new URL(app.callbackUrl).origin))].join(
    ",",
  );
}
