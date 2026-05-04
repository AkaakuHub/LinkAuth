import { callbackUrl, redirectToUrl } from "../../../shared/navigation.js";
import type { AccountConfig } from "../accountConfig.js";

export type DiscordOAuthUser = {
  id: string;
};

export type DiscordOAuthResult = {
  user: DiscordOAuthUser;
  accessToken: string;
};

export function redirectToDiscordAuthorize(
  state: string,
  config: AccountConfig,
): Response {
  const authorize = new URL(`${config.discord.apiBase}/oauth2/authorize`);
  authorize.searchParams.set("client_id", config.discord.clientId);
  authorize.searchParams.set("redirect_uri", callbackUrl(config.navigation));
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "identify guilds.members.read");
  authorize.searchParams.set("state", state);
  return redirectToUrl(authorize);
}

export async function fetchDiscordOAuthResult(
  code: string,
  config: AccountConfig,
): Promise<DiscordOAuthResult | null> {
  try {
    const tokenResponse = await fetch(
      `${config.discord.apiBase}/oauth2/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.discord.clientId,
          client_secret: config.discord.clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: callbackUrl(config.navigation),
        }),
      },
    );
    if (!tokenResponse.ok) {
      return null;
    }
    const token = (await tokenResponse.json()) as { access_token?: unknown };
    if (typeof token.access_token !== "string") {
      return null;
    }
    const userResponse = await fetch(`${config.discord.apiBase}/users/@me`, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!userResponse.ok) {
      return null;
    }
    const user = (await userResponse.json()) as { id?: unknown };
    if (typeof user.id !== "string") {
      return null;
    }
    return {
      user: { id: user.id },
      accessToken: token.access_token,
    };
  } catch {
    return null;
  }
}

export async function fetchDiscordGuildMember(
  accessToken: string,
  config: AccountConfig,
): Promise<boolean> {
  try {
    for (const guildId of config.discord.guildIds) {
      const response = await fetch(
        `${config.discord.apiBase}/users/@me/guilds/${guildId}/member`,
        {
          headers: { authorization: `Bearer ${accessToken}` },
        },
      );
      if (response.ok) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
