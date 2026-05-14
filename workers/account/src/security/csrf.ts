import { type CsrfAction, verifyCsrfToken } from "../../../../src/csrf.js";
import type { AccountConfig } from "../accountConfig.js";
import { requestOrigin } from "./requestContext.js";

export async function verifyFormCsrf(
  request: Request,
  url: URL,
  config: AccountConfig,
  discordId: string,
  action: CsrfAction,
): Promise<boolean> {
  const origin = request.headers.get("origin");
  if (origin !== requestOrigin(url, config.domainName)) {
    return false;
  }
  const form = await request.clone().formData();
  return await verifyCsrfToken({
    token: String(form.get("csrf_token") ?? ""),
    discordId,
    origin,
    action,
    kid: config.csrf.kid,
    secret: config.csrf.secret,
    now: Math.floor(Date.now() / 1000),
  });
}

export async function verifyHeaderCsrf(
  request: Request,
  url: URL,
  config: AccountConfig,
  discordId: string,
  action: CsrfAction,
): Promise<boolean> {
  const origin = request.headers.get("origin");
  if (origin !== requestOrigin(url, config.domainName)) {
    return false;
  }
  return await verifyCsrfToken({
    token: request.headers.get("x-csrf-token"),
    discordId,
    origin,
    action,
    kid: config.csrf.kid,
    secret: config.csrf.secret,
    now: Math.floor(Date.now() / 1000),
  });
}
