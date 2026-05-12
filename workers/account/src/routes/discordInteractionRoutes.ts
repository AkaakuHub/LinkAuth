import nacl from "tweetnacl";
import type { AccountConfig } from "../accountConfig.js";
import { registerDiscordUser } from "../data/users.js";

type DiscordInteraction = {
  type: number;
  guild_id?: string;
  member?: {
    user?: {
      id: string;
      username?: string;
      global_name?: string | null;
      avatar?: string | null;
    };
  };
  data?: {
    name?: string;
  };
};

export async function discordInteraction(
  request: Request,
  config: AccountConfig,
): Promise<Response> {
  const rawBody = await request.text();
  if (!verifyDiscordSignature(request.headers, rawBody, config)) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }
  const interaction = JSON.parse(rawBody) as DiscordInteraction;
  if (interaction.type === 1) {
    return Response.json({ type: 1 });
  }
  if (interaction.type !== 2 || interaction.data?.name !== "register") {
    return discordMessage("未対応のコマンドです。");
  }
  if (
    !interaction.guild_id ||
    !config.discord.guildIds.includes(interaction.guild_id)
  ) {
    return discordMessage("このサーバーでは登録できません。");
  }
  const user = interaction.member?.user;
  if (!user) {
    return discordMessage("ユーザー情報を取得できませんでした。");
  }
  const displayName = normalizeDisplayName(
    user.global_name ?? user.username ?? user.id,
  );
  await registerDiscordUser(config, {
    avatarHash: user.avatar ?? null,
    discordId: user.id,
    discordUsername: user.username ?? "",
    displayName,
    guildId: interaction.guild_id,
  });
  return discordMessage(
    `登録しました。\nアカウントページ: ${config.navigation.ACCOUNT_URL}`,
  );
}

function verifyDiscordSignature(
  headers: Headers,
  rawBody: string,
  config: AccountConfig,
): boolean {
  const signature = headers.get("x-signature-ed25519");
  const timestamp = headers.get("x-signature-timestamp");
  if (!signature || !timestamp) {
    return false;
  }
  const message = new TextEncoder().encode(`${timestamp}${rawBody}`);
  return nacl.sign.detached.verify(
    message,
    hexToBytes(signature),
    hexToBytes(config.discord.publicKey),
  );
}

function discordMessage(content: string): Response {
  return Response.json({
    type: 4,
    data: {
      content,
      flags: 64,
    },
  });
}

function normalizeDisplayName(value: string): string {
  const trimmed = [...value.trim()]
    .filter((character) => !isControlCharacter(character))
    .join("");
  return trimmed.slice(0, 20) || "user";
}

function isControlCharacter(value: string): boolean {
  const codePoint = value.charCodeAt(0);
  return codePoint <= 31 || codePoint === 127;
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
