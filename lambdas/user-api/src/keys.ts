export function profileKey(discordId: string): { pk: string; sk: string } {
  return { pk: `USER#${discordId}`, sk: "PROFILE" };
}

export function rememberKey(
  discordId: string,
  tokenId: string,
): { pk: string; sk: string } {
  return { pk: `USER#${discordId}`, sk: `REMEMBER#${tokenId}` };
}
