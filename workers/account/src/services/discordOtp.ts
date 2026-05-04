import type { AccountConfig } from "../accountConfig.js";

export type OtpSendResult = { ok: true } | { ok: false; reason: string };

export async function sendDiscordOtp(
  discordId: string,
  otpCode: string,
  config: AccountConfig,
): Promise<OtpSendResult> {
  try {
    const channelResponse = await fetch(
      `${config.discord.apiBase}/users/@me/channels`,
      {
        method: "POST",
        headers: {
          authorization: `Bot ${config.discord.botToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ recipient_id: discordId }),
      },
    );
    if (!channelResponse.ok) {
      return {
        ok: false,
        reason: await discordError("create_dm", channelResponse),
      };
    }
    const channel = (await channelResponse.json()) as { id?: unknown };
    if (typeof channel.id !== "string") {
      return { ok: false, reason: "create_dm returned no channel id" };
    }
    const messageResponse = await fetch(
      `${config.discord.apiBase}/channels/${channel.id}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bot ${config.discord.botToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ content: `認証コード: ${otpCode}` }),
      },
    );
    if (!messageResponse.ok) {
      return {
        ok: false,
        reason: await discordError("send_dm", messageResponse),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "discord request failed" };
  }
}

async function discordError(
  action: string,
  response: Response,
): Promise<string> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { code?: unknown; message?: unknown };
    if (parsed.code === 50278) {
      return `${action} ${response.status}: DISCORD_BOT_TOKENのBotが対象Discordサーバーに参加していません`;
    }
    if (typeof parsed.message === "string") {
      return `${action} ${response.status}: ${parsed.message}`;
    }
  } catch {
    return `${action} ${response.status}: ${body}`;
  }
  return `${action} ${response.status}: ${body}`;
}
