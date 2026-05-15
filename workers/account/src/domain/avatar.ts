import { sha256Hex } from "../../../../src/crypto.js";

export async function createAvatarIconKey(
  discordId: string,
  body: Uint8Array,
): Promise<string> {
  return `icons/${discordId}/avatar-${await sha256Hex(body)}.webp`;
}

export function isPublicAvatarIconKey(key: string): boolean {
  return /^icons\/[0-9]+\/avatar-[a-f0-9]{64}\.webp$/.test(key);
}
