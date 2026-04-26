import { callbackUrl, redirectToUrl } from "../../shared/navigation.js";
import type { AuthConfig } from "./authConfig.js";

export type DiscordOAuthUser = {
  id: string;
};

export function redirectToDiscordAuthorize(
  state: string,
  config: AuthConfig,
): Response {
  const authorize = new URL(`${config.discord.apiBase}/oauth2/authorize`);
  authorize.searchParams.set("client_id", config.discord.clientId);
  authorize.searchParams.set("redirect_uri", callbackUrl(config.navigation));
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);
  return redirectToUrl(authorize);
}

export async function fetchDiscordOAuthUser(
  code: string,
  config: AuthConfig,
): Promise<DiscordOAuthUser | null> {
  const tokenResponse = await fetch(`${config.discord.apiBase}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl(config.navigation),
    }),
  });
  if (!tokenResponse.ok) {
    return null;
  }
  const token = (await tokenResponse.json()) as { access_token: string };
  const userResponse = await fetch(`${config.discord.apiBase}/users/@me`, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!userResponse.ok) {
    return null;
  }
  return (await userResponse.json()) as DiscordOAuthUser;
}
