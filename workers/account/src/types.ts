import type { UserApiConfig } from "../../shared/userApi.js";

export type Env = UserApiConfig & {
  ASSETS: R2Bucket;
  DOMAIN_NAME: string;
  ACCOUNT_URL: string;
  ALLOWED_RETURN_TO_ORIGINS: string;
  AUTH_LOGIN_URL: string;
  AUTH_CALLBACK_URL: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  SESSION_KID: string;
  SESSION_HMAC_SECRET: string;
  CSRF_KID: string;
  CSRF_HMAC_SECRET: string;
};
