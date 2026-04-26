import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getHeader } from "./http.js";

export type InternalHmacConfig = {
  kid: string;
  secret: string;
};

export function verifyInternalSignature(
  event: APIGatewayProxyEventV2,
  rawBody: Buffer,
  config: InternalHmacConfig,
): boolean {
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
  return safeEqual(signature, expectedSignature);
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
