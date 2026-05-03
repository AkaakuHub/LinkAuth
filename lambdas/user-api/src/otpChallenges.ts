import { createHash } from "node:crypto";
import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { UserApiContext } from "./context.js";
import { type JsonBody, json } from "./http.js";
import { otpChallengeKey } from "./keys.js";
import { requireNumber, requireString } from "./validation.js";

type OtpChallengeItem = {
  discord_id?: string;
  otp_hash?: string;
  expires_at?: number;
};

export async function putOtpChallenge(
  context: UserApiContext,
  body: JsonBody,
): Promise<void> {
  const challengeId = requireString(body, "challenge_id");
  await context.dynamodb.send(
    new PutCommand({
      TableName: context.tableName,
      Item: {
        ...otpChallengeKey(challengeId),
        challenge_id: challengeId,
        discord_id: requireString(body, "discord_id"),
        otp_hash: await hashOtp(requireString(body, "otp")),
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
  const otp = requireString(body, "otp");
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
    typeof item.otp_hash !== "string" ||
    typeof item.expires_at !== "number" ||
    item.expires_at <= Math.floor(Date.now() / 1000) ||
    item.otp_hash !== (await hashOtp(otp))
  ) {
    return json(401, { error: "invalid_otp" });
  }
  return json(200, { discord_id: item.discord_id });
}

async function hashOtp(otp: string): Promise<string> {
  return createHash("sha256").update(otp, "utf8").digest("hex");
}
