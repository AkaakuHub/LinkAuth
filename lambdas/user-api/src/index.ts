import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { loadUserApiConfig } from "./config.js";
import type { UserApiContext } from "./context.js";
import { isHttpError, json, parseBody, parseJsonBody } from "./http.js";
import { verifyInternalSignature } from "./internal-auth.js";
import {
  deleteAllRememberTokens,
  deleteRememberToken,
  putRememberToken,
  rotateRememberToken,
} from "./remember-tokens.js";
import {
  deleteUser,
  getActiveUser,
  updateUserAvatar,
  updateUserProfile,
} from "./users.js";
import { requireString } from "./validation.js";

const config = loadUserApiConfig();
const context: UserApiContext = {
  tableName: config.tableName,
  discordGuildId: config.discord.guildId,
  discordBotToken: config.discord.botToken,
  dynamodb: config.dynamodb,
};

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    return await handle(event);
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

async function handle(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const rawBody = parseJsonBody(event);
  if (!verifyInternalSignature(event, rawBody, config.internalHmac)) {
    return json(401, { error: "invalid_signature" });
  }

  const path = event.rawPath;
  const body = parseBody(rawBody);

  if (path === "/users/get" || path === "/users/verify-active") {
    const user = await getActiveUser(
      context,
      requireString(body, "discord_id"),
      true,
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
    await deleteRememberToken(
      context,
      requireString(body, "discord_id"),
      requireString(body, "token_id"),
    );
    return json(200, { ok: true });
  }
  if (path === "/remember/delete-all") {
    await deleteAllRememberTokens(context, requireString(body, "discord_id"));
    return json(200, { ok: true });
  }

  return json(404, { error: "not_found" });
}
