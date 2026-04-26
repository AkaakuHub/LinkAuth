import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

export type JsonBody = Record<string, unknown>;

export function parseJsonBody(event: APIGatewayProxyEventV2): Buffer {
  return event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64")
    : Buffer.from(event.body ?? "", "utf8");
}

export function parseBody(rawBody: Buffer): JsonBody {
  return rawBody.length > 0
    ? (JSON.parse(rawBody.toString("utf8")) as JsonBody)
    : {};
}

export function json(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

export function httpError(
  statusCode: number,
  reason: string,
): Error & { statusCode: number; reason: string } {
  const error = new Error(reason) as Error & {
    statusCode: number;
    reason: string;
  };
  error.statusCode = statusCode;
  error.reason = reason;
  return error;
}

export function isHttpError(
  error: unknown,
): error is Error & { statusCode: number; reason: string } {
  return (
    error instanceof Error &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number" &&
    "reason" in error &&
    typeof (error as { reason: unknown }).reason === "string"
  );
}

export function getHeader(
  headers: Record<string, string | undefined>,
  name: string,
): string | null {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value ?? null;
    }
  }
  return null;
}
