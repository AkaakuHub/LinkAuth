import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { UserApiContext } from "./context.js";
import { type JsonBody, json } from "./http.js";
import { rememberKey } from "./keys.js";
import { getActiveUser } from "./users.js";
import { requireNumber, requireString } from "./validation.js";

export async function putRememberToken(
  context: UserApiContext,
  body: JsonBody,
): Promise<void> {
  const discordId = requireString(body, "discord_id");
  await context.dynamodb.send(
    new PutCommand({
      TableName: context.tableName,
      Item: {
        pk: `USER#${discordId}`,
        sk: `REMEMBER#${requireString(body, "token_id")}`,
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
  const discordId = requireString(body, "discord_id");
  const tokenId = requireString(body, "token_id");
  const oldTokenHash = requireString(body, "old_token_hash");
  const newTokenHash = requireString(body, "new_token_hash");
  const result = await context.dynamodb.send(
    new GetCommand({
      TableName: context.tableName,
      Key: rememberKey(discordId, tokenId),
    }),
  );
  const item = result.Item as
    | { token_hash?: string; expires_at?: number }
    | undefined;
  if (
    !item ||
    item.expires_at === undefined ||
    item.expires_at <= Math.floor(Date.now() / 1000) ||
    item.token_hash !== oldTokenHash
  ) {
    await deleteRememberToken(context, discordId, tokenId);
    return json(401, { error: "invalid_remember_token" });
  }
  const user = await getActiveUser(context, discordId, true);
  if (!user) {
    return json(401, { error: "inactive_user" });
  }
  await context.dynamodb.send(
    new UpdateCommand({
      TableName: context.tableName,
      Key: rememberKey(discordId, tokenId),
      UpdateExpression:
        "SET token_hash = :token_hash, last_used_at = :last_used_at, expires_at = :expires_at",
      ExpressionAttributeValues: {
        ":token_hash": newTokenHash,
        ":last_used_at": new Date().toISOString(),
        ":expires_at": requireNumber(body, "expires_at"),
      },
    }),
  );
  return json(200, { user });
}

export async function deleteRememberToken(
  context: UserApiContext,
  discordId: string,
  tokenId: string,
): Promise<void> {
  await context.dynamodb.send(
    new DeleteCommand({
      TableName: context.tableName,
      Key: rememberKey(discordId, tokenId),
    }),
  );
}

export async function deleteAllRememberTokens(
  context: UserApiContext,
  discordId: string,
): Promise<void> {
  const result = await context.dynamodb.send(
    new QueryCommand({
      TableName: context.tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :remember)",
      ExpressionAttributeValues: {
        ":pk": `USER#${discordId}`,
        ":remember": "REMEMBER#",
      },
    }),
  );
  for (const item of result.Items ?? []) {
    await context.dynamodb.send(
      new DeleteCommand({
        TableName: context.tableName,
        Key: { pk: item.pk, sk: item.sk },
      }),
    );
  }
}
