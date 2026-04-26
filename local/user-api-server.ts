import { createServer } from "node:http";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { handler } from "../lambdas/user-api/src/index.js";
import { requiredLocalUrlPort } from "./env.js";

const port = requiredLocalUrlPort("USER_API_URL");

createServer(async (request, response) => {
  const requestUrl = requireValue(request.url, "request.url");
  const host = requireStringValue(request.headers.host, "host");
  const method = requireValue(request.method, "request.method");
  const sourceIp = requireValue(request.socket.remoteAddress, "remoteAddress");
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  const url = new URL(requestUrl, `http://${host}`);
  const result = await handler({
    version: "2.0",
    routeKey: `${method} ${url.pathname}`,
    rawPath: url.pathname,
    rawQueryString: url.searchParams.toString(),
    headers: normalizeHeaders(request.headers),
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: host,
      domainPrefix: "local",
      http: {
        method,
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp,
        userAgent: requireStringValue(
          request.headers["user-agent"],
          "user-agent",
        ),
      },
      requestId: crypto.randomUUID(),
      routeKey: `${method} ${url.pathname}`,
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    isBase64Encoded: false,
    body: body.toString("utf8"),
  } satisfies APIGatewayProxyEventV2);

  response.statusCode = requireValue(result.statusCode, "statusCode");
  const headers = requireValue(result.headers, "headers");
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      response.setHeader(key, String(value));
    }
  }
  response.end(requireValue(result.body, "body"));
}).listen(port, () => {
  console.log(`user-api local listening on http://localhost:${port}`);
});

function requireValue<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requireStringValue(
  value: string | string[] | undefined,
  name: string,
): string {
  if (typeof value !== "string") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeHeaders(
  headers: typeof import("node:http").IncomingMessage.prototype.headers,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized[key] = value.join(",");
    } else if (value !== undefined) {
      normalized[key] = value;
    }
  }
  return normalized;
}
