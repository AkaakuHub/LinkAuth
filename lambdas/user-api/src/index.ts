import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { consumeAuthCode, putAuthCode } from "./authCodes.js";
import { loadUserApiConfig } from "./config.js";
import type { UserApiContext } from "./context.js";
import { isHttpError, json, parseBody, parseJsonBody } from "./http.js";
import { verifyInternalSignature } from "./internalAuth.js";
import { consumeOtpChallenge, putOtpChallenge } from "./otpChallenges.js";
import {
  deleteAllRememberTokens,
  deleteRememberToken,
  putRememberToken,
  rotateRememberToken,
} from "./rememberTokens.js";
import {
  deleteUser,
  getActiveUser,
  updateUserAvatar,
  updateUserProfile,
} from "./users.js";
import { requireString } from "./validation.js";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const config = loadUserApiConfig();
    const context: UserApiContext = {
      tableName: config.tableName,
      discordGuildIds: config.discord.guildIds,
      discordBotToken: config.discord.botToken,
      otpHashSecret: config.internalHmac.secret,
      dynamodb: config.dynamodb,
    };
    return await handleUserApiRequest(event, context, config.internalHmac);
  } catch (error) {
    if (isHttpError(error)) {
      return json(error.statusCode, { error: error.reason });
    }
    console.error(
      JSON.stringify({ route: event.rawPath, reason_code: "unhandled_error" }),
    );
    return json(500, { error: "internal_error" });
  }
}

export async function handleUserApiRequest(
  event: APIGatewayProxyEventV2,
  context: UserApiContext,
  internalHmac: { kid: string; secret: string },
): Promise<APIGatewayProxyStructuredResultV2> {
  const rawBody = parseJsonBody(event);
  if (!(await verifyInternalSignature(event, rawBody, internalHmac, context))) {
    return json(401, { error: "invalid_signature" });
  }

  const path = event.rawPath;
  const body = parseBody(rawBody);

  if (path === "/users/get") {
    const user = await getActiveUser(
      context,
      requireString(body, "discord_id"),
      false,
    );
    return user ? json(200, { user }) : json(401, { error: "inactive_user" });
  }
  if (path === "/users/verify-active") {
    const user = await getActiveUser(
      context,
      requireString(body, "discord_id"),
      true,
    );
    return user ? json(200, { user }) : json(401, { error: "inactive_user" });
  }
  if (path === "/users/verify-current-membership") {
    const user = await getActiveUser(
      context,
      requireString(body, "discord_id"),
      "current",
    );
    return user ? json(200, { user }) : json(401, { error: "inactive_user" });
  }
  if (path === "/users/update-profile") {
    return json(200, await updateUserProfile(context, body));
  }
  if (path === "/users/update-avatar") {
    return json(200, await updateUserAvatar(context, body));
  }
  if (path === "/users/delete") {
    const discordId = requireString(body, "discord_id");
    await deleteUser(context, body);
    await deleteAllRememberTokens(context, discordId);
    return json(200, { ok: true });
  }
  if (path === "/remember/create") {
    await putRememberToken(context, body);
    return json(200, { ok: true });
  }
  if (path === "/remember/rotate") {
    return await rotateRememberToken(context, body);
  }
  if (path === "/remember/delete") {
    await deleteRememberToken(context, requireString(body, "token_id"));
    return json(200, { ok: true });
  }
  if (path === "/remember/delete-all") {
    await deleteAllRememberTokens(context, requireString(body, "discord_id"));
    return json(200, { ok: true });
  }
  if (path === "/auth-code/create") {
    await putAuthCode(context, body);
    return json(200, { ok: true });
  }
  if (path === "/auth-code/consume") {
    return await consumeAuthCode(context, body);
  }
  if (path === "/otp-challenge/create") {
    await putOtpChallenge(context, body);
    return json(200, { ok: true });
  }
  if (path === "/otp-challenge/consume") {
    return await consumeOtpChallenge(context, body);
  }

  return json(404, { error: "not_found" });
}
