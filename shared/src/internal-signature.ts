import { hmacSha256, sha256Hex } from "./crypto.js";
import { hexEncode, timingSafeEqual } from "./encoding.js";

export type InternalHeaders = {
  "X-Internal-Key-Id": string;
  "X-Internal-Timestamp": string;
  "X-Internal-Nonce": string;
  "X-Internal-Content-SHA256": string;
  "X-Internal-Signature": string;
};

export async function createInternalHeaders(input: {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Uint8Array;
  kid: string;
  secret: string;
  nonce: string;
  timestamp: string;
}): Promise<InternalHeaders> {
  const payloadHash = await sha256Hex(input.body);
  const canonicalRequest = canonicalizeInternalRequest({
    method: input.method,
    path: input.path,
    query: input.query,
    payloadHash,
    kid: input.kid,
    nonce: input.nonce,
    timestamp: input.timestamp,
  });
  const signature = hexEncode(await hmacSha256(input.secret, canonicalRequest));
  return {
    "X-Internal-Key-Id": input.kid,
    "X-Internal-Timestamp": input.timestamp,
    "X-Internal-Nonce": input.nonce,
    "X-Internal-Content-SHA256": payloadHash,
    "X-Internal-Signature": signature,
  };
}

export async function verifyInternalHeaders(input: {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Uint8Array;
  headers: Headers;
  secrets: Record<string, string>;
  nowMs: number;
}): Promise<boolean> {
  const kid = input.headers.get("x-internal-key-id");
  const timestamp = input.headers.get("x-internal-timestamp");
  const nonce = input.headers.get("x-internal-nonce");
  const payloadHash = input.headers.get("x-internal-content-sha256");
  const signature = input.headers.get("x-internal-signature");
  if (!kid || !timestamp || !nonce || !payloadHash || !signature) {
    return false;
  }
  const secret = input.secrets[kid];
  if (!secret) {
    return false;
  }
  const requestTime = Date.parse(timestamp);
  if (
    !Number.isFinite(requestTime) ||
    Math.abs(input.nowMs - requestTime) > 300_000
  ) {
    return false;
  }
  const actualHash = await sha256Hex(input.body);
  if (!timingSafeEqual(payloadHash, actualHash)) {
    return false;
  }
  const canonicalRequest = canonicalizeInternalRequest({
    method: input.method,
    path: input.path,
    query: input.query,
    payloadHash,
    kid,
    nonce,
    timestamp,
  });
  const expectedSignature = hexEncode(
    await hmacSha256(secret, canonicalRequest),
  );
  return timingSafeEqual(signature, expectedSignature);
}

function canonicalizeInternalRequest(input: {
  method: string;
  path: string;
  query: URLSearchParams;
  payloadHash: string;
  kid: string;
  nonce: string;
  timestamp: string;
}): string {
  const query = [...input.query.entries()]
    .sort(
      ([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    )
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
  return [
    input.method.toUpperCase(),
    input.path,
    query,
    `x-internal-content-sha256:${input.payloadHash}`,
    `x-internal-key-id:${input.kid}`,
    `x-internal-nonce:${input.nonce}`,
    `x-internal-timestamp:${input.timestamp}`,
    "",
    "x-internal-content-sha256;x-internal-key-id;x-internal-nonce;x-internal-timestamp",
    input.payloadHash,
  ].join("\n");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
