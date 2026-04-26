import type { UserApiConfig } from "../../shared/userApi.js";

export type Env = UserApiConfig & {
  ASSETS: R2Bucket;
  DOMAIN_NAME: string;
  AUTH_LOGIN_URL: string;
  SESSION_KID: string;
  SESSION_HMAC_SECRET: string;
  CSRF_KID: string;
  CSRF_HMAC_SECRET: string;
};
