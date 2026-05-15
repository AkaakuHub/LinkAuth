import {
  getAppSessionCookieName as getLinkAuthSessionCookieNameInternal,
  getAppSessionToken as getLinkAuthSessionTokenInternal,
  getAppSessionUser as getLinkAuthSessionUserInternal,
  getAppUser as getLinkAuthUserInternal,
  handleAppAuthRequest as handleAppAuthRequestInternal,
  loadLinkAuthAppConfig as loadLinkAuthAppConfigInternal,
} from "./appAuth.js";

export type LinkAuthAppConfig = {
  appId: string;
  accountUrl: string;
  session: {
    kid: string;
    secret: string;
  };
};

export type LinkAuthAppEnv = {
  ACCOUNT_URL: string;
  APP_ID: string;
  APP_SESSION_HMAC_SECRET: string;
  SESSION_KID: string;
};

export type LinkAuthUser = {
  discord_id: string;
  display_name: string;
  role: "user" | "admin";
  status: "active";
  avatar_url: string | null;
  icon_source: "r2" | "none";
  icon_key: string | null;
};

export type LinkAuthSessionOnlyMatcher = (input: {
  request: Request;
  url: URL;
}) => boolean | Promise<boolean>;

export function loadLinkAuthAppConfig(env: LinkAuthAppEnv): LinkAuthAppConfig {
  return loadLinkAuthAppConfigInternal(env);
}

export async function getLinkAuthUser(input: {
  config: LinkAuthAppConfig;
  request: Request;
}): Promise<LinkAuthUser | null> {
  return await getLinkAuthUserInternal(input);
}

export function getLinkAuthSessionCookieName(appId: string): string {
  return getLinkAuthSessionCookieNameInternal(appId);
}

export function getLinkAuthSessionToken(input: {
  config: LinkAuthAppConfig;
  request: Request;
}): string | null {
  return getLinkAuthSessionTokenInternal(input);
}

export async function getLinkAuthSessionUser(input: {
  config: LinkAuthAppConfig;
  request: Request;
}): Promise<LinkAuthUser | null> {
  return await getLinkAuthSessionUserInternal(input);
}

export async function handleAppAuthRequest(input: {
  authFailedResponse: (url: URL) => Response | Promise<Response>;
  handleRequest: (input: {
    request: Request;
    url: URL;
    user: LinkAuthUser;
  }) => Response | Promise<Response>;
  config: LinkAuthAppConfig;
  localSessionOnly?: LinkAuthSessionOnlyMatcher;
  loginResponse: (request: Request) => Response | Promise<Response>;
  request: Request;
}): Promise<Response> {
  return await handleAppAuthRequestInternal(input);
}
