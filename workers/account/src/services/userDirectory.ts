import type { AccountConfig } from "../accountConfig.js";
import { getActiveUser as findActiveUser } from "../data/users.js";
import type { User } from "../domain/user.js";

export async function verifyActiveUser(
  discordId: string,
  config: AccountConfig,
): Promise<{ user: User } | null> {
  return await activeMemberUser(discordId, config, true);
}

export async function verifyCurrentMemberUser(
  discordId: string,
  config: AccountConfig,
): Promise<{ user: User } | null> {
  return await activeMemberUser(discordId, config, "current");
}

export async function verifyMemberUser(
  discordId: string,
  config: AccountConfig,
): Promise<{ user: User } | null> {
  return await activeMemberUser(discordId, config, true);
}

async function activeMemberUser(
  discordId: string,
  config: AccountConfig,
  checkGuild: boolean | "current",
): Promise<{ user: User } | null> {
  try {
    const user = await findActiveUser(config, discordId, checkGuild);
    return user ? { user } : null;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "left_guild" || error.message === "guild_check_failed")
    ) {
      return null;
    }
    throw error;
  }
}

export async function getActiveUser(
  discordId: string,
  config: AccountConfig,
): Promise<{ user: User } | null> {
  const user = await findActiveUser(config, discordId, false);
  return user ? { user } : null;
}
