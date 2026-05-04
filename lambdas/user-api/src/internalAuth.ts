import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { UserApiContext } from "./context.js";
import { getHeader } from "./http.js";

type InternalHmacConfig = {
  kid: string;
  secret: string;
};

export async function verifyInternalSignature(
  event: APIGatewayProxyEventV2,
  rawBody: Buffer,
  config: InternalHmacConfig,
  context: UserApiContext,
): Promise<boolean> {
  const kid = getHeader(event.headers, "x-internal-key-id");
  const timestamp = getHeader(event.headers, "x-internal-timestamp");
  const nonce = getHeader(event.headers, "x-internal-nonce");
  const payloadHash = getHeader(event.headers, "x-internal-content-sha256");
  const signature = getHeader(event.headers, "x-internal-signature");
  if (
    kid !== config.kid ||
    !timestamp ||
    !nonce ||
    !payloadHash ||
    !signature
  ) {
    return false;
  }
  const requestTime = Date.parse(timestamp);
  if (
    !Number.isFinite(requestTime) ||
    Math.abs(Date.now() - requestTime) > 300_000
  ) {
    return false;
  }
  const actualHash = createHash("sha256").update(rawBody).digest("hex");
  if (!safeEqual(payloadHash, actualHash)) {
    return false;
  }
  const canonicalRequest = canonicalizeInternalRequest(
    event.requestContext.http.method,
    event.rawPath,
    new URLSearchParams(event.rawQueryString ?? ""),
    payloadHash,
    kid,
    nonce,
    timestamp,
  );
  const expectedSignature = createHmac("sha256", config.secret)
    .update(canonicalRequest)
    .digest("hex");
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }
  return await consumeNonce(context, config.kid, nonce);
}

function canonicalizeInternalRequest(
  method: string,
  path: string,
  query: URLSearchParams,
  payloadHash: string,
  kid: string,
  nonce: string,
  timestamp: string,
): string {
  const canonicalQuery = [...query.entries()]
    .sort(
      ([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    )
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
  return [
    method.toUpperCase(),
    path,
    canonicalQuery,
    `x-internal-content-sha256:${payloadHash}`,
    `x-internal-key-id:${kid}`,
    `x-internal-nonce:${nonce}`,
    `x-internal-timestamp:${timestamp}`,
    "",
    "x-internal-content-sha256;x-internal-key-id;x-internal-nonce;x-internal-timestamp",
    payloadHash,
  ].join("\n");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function consumeNonce(
  context: UserApiContext,
  kid: string,
  nonce: string,
): Promise<boolean> {
  try {
    await context.dynamodb.send(
      new PutCommand({
        TableName: context.tableName,
        Item: {
          pk: `INTERNAL_NONCE#${kid}`,
          sk: `NONCE#${nonce}`,
          created_at: new Date().toISOString(),
          expires_at: Math.floor(Date.now() / 1000) + 300,
        },
        ConditionExpression:
          "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      }),
    );
    return true;
  } catch {
    return false;
  }
}
