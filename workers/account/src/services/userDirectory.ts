import {
  callUserApi,
  type User,
  UserApiError,
} from "../../../shared/userApi.js";
import type { AccountConfig } from "../accountConfig.js";

export async function verifyActiveUser(
  discordId: string,
  config: AccountConfig,
): Promise<{ user: User } | null> {
  return await activeUser(config, "/users/verify-active", discordId);
}

export async function getActiveUser(
  discordId: string,
  config: AccountConfig,
): Promise<{ user: User } | null> {
  return await activeUser(config, "/users/get", discordId);
}

async function activeUser(
  config: AccountConfig,
  path: "/users/get" | "/users/verify-active",
  discordId: string,
): Promise<{ user: User } | null> {
  try {
    return await callUserApi<{ user: User }>(config.userApi, path, {
      discord_id: discordId,
    });
  } catch (error) {
    if (error instanceof UserApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}
