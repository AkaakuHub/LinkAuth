import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { UserApiContext } from "./context.js";
import { httpError, type JsonBody, json } from "./http.js";
import { otpChallengeKey, otpRateLimitKey } from "./keys.js";
import { requireNumber, requireString } from "./validation.js";

type OtpChallengeItem = {
  discord_id?: string;
  app_id?: string;
  return_to?: string;
  otp_hash?: string;
  expires_at?: number;
};

const otpIssueLimit = 2;
const otpIssueWindowSeconds = 60;

type OtpIssueSlot = "first" | "second";

type OtpRateLimitItem = {
  first_issued_at?: number;
  second_issued_at?: number;
};

export async function putOtpChallenge(
  context: UserApiContext,
  body: JsonBody,
): Promise<void> {
  const challengeId = requireString(body, "challenge_id");
  const discordId = requireString(body, "discord_id");
  const otp = requireOtp(body, "otp");
  const nowSeconds = Math.floor(Date.now() / 1000);
  await consumeOtpIssueQuota(context, discordId, challengeId, nowSeconds);
  await context.dynamodb.send(
    new PutCommand({
      TableName: context.tableName,
      Item: {
        ...otpChallengeKey(challengeId),
        challenge_id: challengeId,
        discord_id: discordId,
        ...optionalStringItem(body, "app_id"),
        return_to: requireReturnTo(body),
        otp_hash: hashOtp(context.otpHashSecret, challengeId, otp),
        created_at: new Date().toISOString(),
        expires_at: requireNumber(body, "expires_at"),
      },
      ConditionExpression:
        "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    }),
  );
}

async function consumeOtpIssueQuota(
  context: UserApiContext,
  discordId: string,
  challengeId: string,
  nowSeconds: number,
): Promise<void> {
  const key = otpRateLimitKey(discordId);
  const cutoffSeconds = nowSeconds - otpIssueWindowSeconds;
  for (let attempt = 0; attempt < otpIssueLimit; attempt += 1) {
    const result = await context.dynamodb.send(
      new GetCommand({
        TableName: context.tableName,
        Key: key,
      }),
    );
    const item = result.Item as OtpRateLimitItem | undefined;
    if (countActiveOtpIssues(item, cutoffSeconds) >= otpIssueLimit) {
      throw httpError(429, "otp_rate_limited");
    }
    const slot = chooseOtpIssueSlot(item, cutoffSeconds);
    if (!slot) {
      throw httpError(429, "otp_rate_limited");
    }
    try {
      await context.dynamodb.send(
        new UpdateCommand({
          TableName: context.tableName,
          Key: key,
          UpdateExpression: `SET ${slot}_issued_at = :now, ${slot}_challenge_id = :challenge_id, updated_at = :updated_at, expires_at = :expires_at`,
          ConditionExpression: `attribute_not_exists(${slot}_issued_at) OR ${slot}_issued_at <= :cutoff`,
          ExpressionAttributeValues: {
            ":challenge_id": challengeId,
            ":cutoff": cutoffSeconds,
            ":expires_at": nowSeconds + otpIssueWindowSeconds,
            ":now": nowSeconds,
            ":updated_at": new Date(nowSeconds * 1000).toISOString(),
          },
        }),
      );
      return;
    } catch (error) {
      if (!isConditionalCheckFailed(error)) {
        throw error;
      }
      if (attempt === otpIssueLimit - 1) {
        throw httpError(429, "otp_rate_limited");
      }
    }
  }
}

function countActiveOtpIssues(
  item: OtpRateLimitItem | undefined,
  cutoffSeconds: number,
): number {
  return [item?.first_issued_at, item?.second_issued_at].filter(
    (issuedAt) => typeof issuedAt === "number" && issuedAt > cutoffSeconds,
  ).length;
}

function chooseOtpIssueSlot(
  item: OtpRateLimitItem | undefined,
  cutoffSeconds: number,
): OtpIssueSlot | null {
  if (!isActiveOtpIssue(item?.first_issued_at, cutoffSeconds)) {
    return "first";
  }
  if (!isActiveOtpIssue(item?.second_issued_at, cutoffSeconds)) {
    return "second";
  }
  return null;
}

function isActiveOtpIssue(
  issuedAt: number | undefined,
  cutoffSeconds: number,
): boolean {
  return typeof issuedAt === "number" && issuedAt > cutoffSeconds;
}

function isConditionalCheckFailed(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ConditionalCheckFailedException" ||
      error.message === "ConditionalCheckFailed")
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
    !safeEqual(item.otp_hash, hashOtp(context.otpHashSecret, challengeId, otp))
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

function requireReturnTo(body: JsonBody): string {
  const value = requireString(body, "return_to");
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      throw httpError(400, "invalid_return_to");
    }
    return url.toString();
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    throw httpError(400, "invalid_return_to");
  }
}

function requireOtp(body: JsonBody, key: string): string {
  const value = requireString(body, key);
  if (!/^[0-9]{6}$/.test(value)) {
    throw httpError(400, `invalid_${key}`);
  }
  return value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
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
