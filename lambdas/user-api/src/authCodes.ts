import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { UserApiContext, UserProfile } from "./context.js";
import { httpError, type JsonBody, json } from "./http.js";
import { authCodeKey } from "./keys.js";
import { requireNumber, requireString } from "./validation.js";

type AuthCodeItem = {
  app_id?: string;
  discord_id?: string;
  display_name?: string;
  role?: "user" | "admin";
  expires_at?: number;
};

export async function putAuthCode(
  context: UserApiContext,
  body: JsonBody,
): Promise<void> {
  const code = requireString(body, "code");
  const user = requireUser(body);
  await context.dynamodb.send(
    new PutCommand({
      TableName: context.tableName,
      Item: {
        ...authCodeKey(code),
        code,
        app_id: requireString(body, "app_id"),
        discord_id: user.discord_id,
        display_name: user.display_name,
        role: user.role,
        created_at: new Date().toISOString(),
        expires_at: requireNumber(body, "expires_at"),
      },
      ConditionExpression:
        "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    }),
  );
}

export async function consumeAuthCode(
  context: UserApiContext,
  body: JsonBody,
): Promise<APIGatewayProxyStructuredResultV2> {
  const appId = requireString(body, "app_id");
  const code = requireString(body, "code");
  const result = await context.dynamodb.send(
    new DeleteCommand({
      TableName: context.tableName,
      Key: authCodeKey(code),
      ReturnValues: "ALL_OLD",
    }),
  );
  const item = result.Attributes as AuthCodeItem | undefined;
  if (
    !item ||
    item.app_id !== appId ||
    typeof item.discord_id !== "string" ||
    typeof item.display_name !== "string" ||
    (item.role !== "user" && item.role !== "admin") ||
    typeof item.expires_at !== "number" ||
    item.expires_at <= Math.floor(Date.now() / 1000)
  ) {
    return json(401, { error: "invalid_auth_code" });
  }
  return json(200, {
    user: {
      discord_id: item.discord_id,
      display_name: item.display_name,
      role: item.role,
    },
  });
}

function requireUser(
  body: JsonBody,
): Pick<UserProfile, "discord_id" | "display_name" | "role"> {
  const value = body.user;
  if (!value || typeof value !== "object") {
    throw httpError(400, "invalid_user");
  }
  const user = value as Record<string, unknown>;
  if (
    typeof user.discord_id !== "string" ||
    typeof user.display_name !== "string" ||
    (user.role !== "user" && user.role !== "admin")
  ) {
    throw httpError(400, "invalid_user");
  }
  return {
    discord_id: user.discord_id,
    display_name: user.display_name,
    role: user.role,
  };
}
