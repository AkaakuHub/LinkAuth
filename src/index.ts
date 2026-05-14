import {
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
  avatar_url?: string;
  icon_source?: "discord" | "r2" | "none";
  icon_key?: string;
};

export function loadLinkAuthAppConfig(env: LinkAuthAppEnv): LinkAuthAppConfig {
  return loadLinkAuthAppConfigInternal(env);
}

export async function handleAppAuthRequest(input: {
  authFailedResponse: (url: URL) => Response | Promise<Response>;
  handleRequest: (input: {
    request: Request;
    url: URL;
    user: LinkAuthUser;
  }) => Response | Promise<Response>;
  config: LinkAuthAppConfig;
  loginResponse: (request: Request) => Response | Promise<Response>;
  request: Request;
}): Promise<Response> {
  return await handleAppAuthRequestInternal(input);
}
