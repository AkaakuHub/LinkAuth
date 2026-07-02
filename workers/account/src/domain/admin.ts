import type { AccountConfig } from "../accountConfig.js";
import type { User } from "./user.js";

export function isAccountAdmin(config: AccountConfig, user: User): boolean {
  return config.adminDiscordIds.includes(user.discord_id);
}
