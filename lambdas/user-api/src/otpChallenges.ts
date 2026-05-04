import { createHmac } from "node:crypto";
import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { UserApiContext } from "./context.js";
import { httpError, type JsonBody, json } from "./http.js";
import { otpChallengeKey } from "./keys.js";
import { requireNumber, requireString } from "./validation.js";

type OtpChallengeItem = {
  discord_id?: string;
  app_id?: string;
  return_to?: string;
  otp_hash?: string;
  expires_at?: number;
};

export async function putOtpChallenge(
  context: UserApiContext,
  body: JsonBody,
): Promise<void> {
  const challengeId = requireString(body, "challenge_id");
  const otp = requireOtp(body, "otp");
  await context.dynamodb.send(
    new PutCommand({
      TableName: context.tableName,
      Item: {
        ...otpChallengeKey(challengeId),
        challenge_id: challengeId,
        discord_id: requireString(body, "discord_id"),
        ...optionalStringItem(body, "app_id"),
        return_to: requireString(body, "return_to"),
        otp_hash: hashOtp(context.otpHashSecret, challengeId, otp),
        created_at: new Date().toISOString(),
        expires_at: requireNumber(body, "expires_at"),
      },
      ConditionExpression:
        "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    }),
  );
}

export async function consumeOtpChallenge(
  context: UserApiContext,
  body: JsonBody,
): Promise<APIGatewayProxyStructuredResultV2> {
  const challengeId = requireString(body, "challenge_id");
  const otp = requireOtp(body, "otp");
  const result = await context.dynamodb.send(
    new DeleteCommand({
      TableName: context.tableName,
      Key: otpChallengeKey(challengeId),
      ReturnValues: "ALL_OLD",
    }),
  );
  const item = result.Attributes as OtpChallengeItem | undefined;
  if (
    !item ||
    typeof item.discord_id !== "string" ||
    typeof item.return_to !== "string" ||
    typeof item.otp_hash !== "string" ||
    typeof item.expires_at !== "number" ||
    item.expires_at <= Math.floor(Date.now() / 1000) ||
    item.otp_hash !== hashOtp(context.otpHashSecret, challengeId, otp)
  ) {
    return json(401, { error: "invalid_otp" });
  }
  if (item.app_id !== undefined && typeof item.app_id !== "string") {
    return json(401, { error: "invalid_otp" });
  }
  return json(200, {
    discord_id: item.discord_id,
    ...(item.app_id ? { app_id: item.app_id } : {}),
    return_to: item.return_to,
  });
}

function requireOtp(body: JsonBody, key: string): string {
  const value = requireString(body, key);
  if (!/^[0-9]{6}$/.test(value)) {
    throw httpError(400, `invalid_${key}`);
  }
  return value;
}

function hashOtp(secret: string, challengeId: string, otp: string): string {
  return createHmac("sha256", secret)
    .update(`${challengeId}.${otp}`, "utf8")
    .digest("hex");
}

function optionalStringItem(
  body: JsonBody,
  key: string,
): Record<string, string> {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? { [key]: value } : {};
}
