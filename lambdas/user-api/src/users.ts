import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { UserApiContext, UserProfile } from "./context.js";
import { httpError, type JsonBody } from "./http.js";
import { profileKey } from "./keys.js";
import { normalizeDisplayName, requireString } from "./validation.js";

export async function getActiveUser(
  context: UserApiContext,
  discordId: string,
  checkGuild: boolean,
): Promise<UserProfile | null> {
  const result = await context.dynamodb.send(
    new GetCommand({
      TableName: context.tableName,
      Key: profileKey(discordId),
    }),
  );
  const user = result.Item as UserProfile | undefined;
  if (!user || user.status !== "active") {
    return null;
  }
  if (checkGuild) {
    await verifyGuildMembership(context, user);
  }
  return user;
}

export async function updateUserProfile(
  context: UserApiContext,
  body: JsonBody,
): Promise<ResponsePayload> {
  const discordId = requireString(body, "discord_id");
  const displayName = normalizeDisplayName(requireString(body, "display_name"));
  await requireActiveUser(context, discordId);
  await context.dynamodb.send(
    new UpdateCommand({
      TableName: context.tableName,
      Key: profileKey(discordId),
      UpdateExpression:
        "SET display_name = :display_name, updated_at = :updated_at",
      ExpressionAttributeValues: {
        ":display_name": displayName,
        ":updated_at": new Date().toISOString(),
      },
    }),
  );
  return { ok: true };
}

export async function updateUserAvatar(
  context: UserApiContext,
  body: JsonBody,
): Promise<ResponsePayload> {
  const discordId = requireString(body, "discord_id");
  await requireActiveUser(context, discordId);
  await context.dynamodb.send(
    new UpdateCommand({
      TableName: context.tableName,
      Key: profileKey(discordId),
      UpdateExpression:
        "SET icon_source = :icon_source, icon_key = :icon_key, updated_at = :updated_at",
      ExpressionAttributeValues: {
        ":icon_source": requireString(body, "icon_source"),
        ":icon_key": requireString(body, "icon_key"),
        ":updated_at": new Date().toISOString(),
      },
    }),
  );
  return { ok: true };
}

export async function deleteUser(
  context: UserApiContext,
  body: JsonBody,
): Promise<ResponsePayload> {
  const discordId = requireString(body, "discord_id");
  const nowIso = new Date().toISOString();
  await context.dynamodb.send(
    new UpdateCommand({
      TableName: context.tableName,
      Key: profileKey(discordId),
      UpdateExpression:
        "SET #status = :status, deleted_at = :deleted_at, updated_at = :updated_at",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "deleted",
        ":deleted_at": nowIso,
        ":updated_at": nowIso,
      },
    }),
  );
  return { ok: true };
}

async function requireActiveUser(
  context: UserApiContext,
  discordId: string,
): Promise<UserProfile> {
  const user = await getActiveUser(context, discordId, true);
  if (!user) {
    throw httpError(401, "inactive_user");
  }
  return user;
}

async function verifyGuildMembership(
  context: UserApiContext,
  user: UserProfile,
): Promise<void> {
  const checkedAt = user.guild_checked_at
    ? Date.parse(user.guild_checked_at)
    : 0;
  if (
    user.guild_member_status === "active" &&
    Number.isFinite(checkedAt) &&
    Date.now() - checkedAt <= 600_000
  ) {
    return;
  }
  const membership = await fetchActiveGuildMember(context, user.discord_id);
  const nowIso = new Date().toISOString();
  if (membership === "active") {
    await context.dynamodb.send(
      new UpdateCommand({
        TableName: context.tableName,
        Key: profileKey(user.discord_id),
        UpdateExpression:
          "SET guild_member_status = :status, guild_checked_at = :checked_at",
        ExpressionAttributeValues: {
          ":status": "active",
          ":checked_at": nowIso,
        },
      }),
    );
    return;
  }
  if (membership === "left") {
    await context.dynamodb.send(
      new UpdateCommand({
        TableName: context.tableName,
        Key: profileKey(user.discord_id),
        UpdateExpression:
          "SET #status = :disabled, disabled_reason = :reason, guild_member_status = :left, guild_checked_at = :checked_at",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":disabled": "disabled",
          ":reason": "left_guild",
          ":left": "left",
          ":checked_at": nowIso,
        },
      }),
    );
    throw httpError(401, "left_guild");
  }
  if (membership === "unavailable") {
    throw httpError(503, "discord_unavailable");
  }
  throw httpError(401, "guild_check_failed");
}

async function fetchActiveGuildMember(
  context: UserApiContext,
  discordId: string,
): Promise<"active" | "left" | "unavailable" | "failed"> {
  let foundMissingMember = false;
  for (const guildId of context.discordGuildIds) {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`,
      {
        headers: { authorization: `Bot ${context.discordBotToken}` },
      },
    );
    if (response.status === 200) {
      return "active";
    }
    if (response.status === 404) {
      foundMissingMember = true;
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      return "unavailable";
    }
    return "failed";
  }
  return foundMissingMember ? "left" : "failed";
}

type ResponsePayload = {
  ok: true;
};
