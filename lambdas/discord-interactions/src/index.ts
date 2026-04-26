import { type DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import nacl from "tweetnacl";
import { loadDiscordInteractionsConfig } from "./config.js";

const config = loadDiscordInteractionsConfig();
const tableName = config.tableName;
const accountUrl = config.accountUrl;
const discordGuildId = config.discord.guildId;
const discordPublicKey = config.discord.publicKey;
const dynamodb: DynamoDBDocumentClient = config.dynamodb;

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

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : (event.body ?? "");
  if (!verifyDiscordSignature(event.headers, rawBody)) {
    return json(401, { error: "invalid_signature" });
  }

  const interaction = JSON.parse(rawBody) as DiscordInteraction;
  if (interaction.type === 1) {
    return json(200, { type: 1 });
  }
  if (interaction.type !== 2 || interaction.data?.name !== "register") {
    return discordMessage("未対応のコマンドです。");
  }
  if (interaction.guild_id !== discordGuildId) {
    return discordMessage("このサーバーでは登録できません。");
  }

  const user = interaction.member?.user;
  if (!user) {
    return discordMessage("ユーザー情報を取得できませんでした。");
  }

  const nowIso = new Date().toISOString();
  const displayName = normalizeDisplayName(
    user.global_name ?? user.username ?? user.id,
  );
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        pk: `USER#${user.id}`,
        sk: "PROFILE",
        discord_id: user.id,
        discord_username: user.username ?? "",
        display_name: displayName,
        role: "user",
        status: "active",
        guild_id: discordGuildId,
        guild_member_status: "active",
        guild_checked_at: nowIso,
        icon_source: user.avatar ? "discord" : "none",
        discord_avatar_hash: user.avatar ?? null,
        created_at: nowIso,
        updated_at: nowIso,
      },
    }),
  );

  return discordMessage(`登録しました。\nアカウントページ: ${accountUrl}`);
}

function verifyDiscordSignature(
  headers: Record<string, string | undefined>,
  rawBody: string,
): boolean {
  const signature = getHeader(headers, "x-signature-ed25519");
  const timestamp = getHeader(headers, "x-signature-timestamp");
  if (!signature || !timestamp) {
    return false;
  }
  const message = Buffer.from(`${timestamp}${rawBody}`, "utf8");
  return nacl.sign.detached.verify(
    message,
    Buffer.from(signature, "hex"),
    Buffer.from(discordPublicKey, "hex"),
  );
}

function discordMessage(content: string): APIGatewayProxyStructuredResultV2 {
  return json(200, {
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

function json(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function getHeader(
  headers: Record<string, string | undefined>,
  name: string,
): string | null {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value ?? null;
    }
  }
  return null;
}
