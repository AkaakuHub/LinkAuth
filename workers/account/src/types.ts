import type { UserApiConfig } from "../../shared/userApi.js";

export type Env = UserApiConfig & {
  ASSETS: R2Bucket;
  DOMAIN_NAME: string;
  ACCOUNT_URL: string;
  AUTH_APPS: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_GUILD_IDS: string;
  DISCORD_API_BASE?: string;
  SESSION_KID: string;
  SESSION_HMAC_SECRET: string;
  CSRF_KID: string;
  CSRF_HMAC_SECRET: string;
};
