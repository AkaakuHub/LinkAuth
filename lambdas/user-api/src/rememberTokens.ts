import { timingSafeEqual } from "node:crypto";
import type { QueryCommandOutput } from "@aws-sdk/lib-dynamodb";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { UserApiContext } from "./context.js";
import { httpError, type JsonBody, json } from "./http.js";
import { rememberKey } from "./keys.js";
import { getActiveUser } from "./users.js";
import { requireNumber, requireString } from "./validation.js";

export async function putRememberToken(
  context: UserApiContext,
  body: JsonBody,
): Promise<void> {
  const discordId = requireString(body, "discord_id");
  const user = await getActiveUser(context, discordId, false);
  if (!user) {
    throw httpError(401, "inactive_user");
  }
  await context.dynamodb.send(
    new PutCommand({
      TableName: context.tableName,
      Item: {
        ...rememberKey(requireString(body, "token_id")),
        discord_id: discordId,
        gsi1pk: `USER#${discordId}`,
        gsi1sk: `REMEMBER#${requireString(body, "token_id")}`,
        token_id: requireString(body, "token_id"),
        token_hash: requireString(body, "token_hash"),
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
        expires_at: requireNumber(body, "expires_at"),
      },
      ConditionExpression:
        "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    }),
  );
}

export async function rotateRememberToken(
  context: UserApiContext,
  body: JsonBody,
): Promise<APIGatewayProxyStructuredResultV2> {
  const tokenId = requireString(body, "token_id");
  const oldTokenHash = requireString(body, "old_token_hash");
  const newTokenHash = requireString(body, "new_token_hash");
  const result = await context.dynamodb.send(
    new GetCommand({
      TableName: context.tableName,
      Key: rememberKey(tokenId),
    }),
  );
  const item = result.Item as
    | { discord_id?: string; token_hash?: string; expires_at?: number }
    | undefined;
  if (
    !item ||
    typeof item.discord_id !== "string" ||
    typeof item.expires_at !== "number" ||
    item.expires_at <= Math.floor(Date.now() / 1000) ||
    typeof item.token_hash !== "string" ||
    !safeEqual(item.token_hash, oldTokenHash)
  ) {
    await deleteRememberToken(context, tokenId);
    return json(401, { error: "invalid_remember_token" });
  }
  const user = await getActiveUser(context, item.discord_id, true);
  if (!user) {
    return json(401, { error: "inactive_user" });
  }
  try {
    await context.dynamodb.send(
      new UpdateCommand({
        TableName: context.tableName,
        Key: rememberKey(tokenId),
        UpdateExpression:
          "SET token_hash = :token_hash, last_used_at = :last_used_at, expires_at = :expires_at",
        ConditionExpression: "token_hash = :old_token_hash",
        ExpressionAttributeValues: {
          ":old_token_hash": oldTokenHash,
          ":token_hash": newTokenHash,
          ":last_used_at": new Date().toISOString(),
          ":expires_at": requireNumber(body, "expires_at"),
        },
      }),
    );
  } catch {
    return json(401, { error: "invalid_remember_token" });
  }
  return json(200, { user });
}

export async function deleteRememberToken(
  context: UserApiContext,
  tokenId: string,
): Promise<void> {
  await context.dynamodb.send(
    new DeleteCommand({
      TableName: context.tableName,
      Key: rememberKey(tokenId),
    }),
  );
}

export async function deleteAllRememberTokens(
  context: UserApiContext,
  discordId: string,
): Promise<void> {
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result: QueryCommandOutput = await context.dynamodb.send(
      new QueryCommand({
        TableName: context.tableName,
        IndexName: "gsi1",
        KeyConditionExpression:
          "gsi1pk = :pk AND begins_with(gsi1sk, :remember)",
        ExpressionAttributeValues: {
          ":pk": `USER#${discordId}`,
          ":remember": "REMEMBER#",
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    await deleteRememberTokenItems(context, result.Items ?? []);
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
}

async function deleteRememberTokenItems(
  context: UserApiContext,
  items: Record<string, unknown>[],
): Promise<void> {
  for (const item of items) {
    await context.dynamodb.send(
      new DeleteCommand({
        TableName: context.tableName,
        Key: { pk: item.pk, sk: item.sk },
      }),
    );
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
