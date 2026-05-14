import { sha256Hex } from "../../../../src/crypto.js";

export type User = {
  discord_id: string;
  discord_username?: string;
  display_name: string;
  role: "user" | "admin";
  status: "active" | "disabled" | "deleted";
  icon_source?: "discord" | "r2" | "none";
  icon_key?: string;
  discord_avatar_hash?: string | null;
};

export async function hashToken(value: string): Promise<string> {
  return await sha256Hex(new TextEncoder().encode(value));
}
