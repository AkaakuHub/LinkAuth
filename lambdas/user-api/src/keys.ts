export function profileKey(discordId: string): { pk: string; sk: string } {
  return { pk: `USER#${discordId}`, sk: "PROFILE" };
}

export function rememberKey(tokenId: string): { pk: string; sk: string } {
  return { pk: `REMEMBER#${tokenId}`, sk: "REMEMBER" };
}

export function authCodeKey(code: string): { pk: string; sk: string } {
  return { pk: `AUTH_CODE#${code}`, sk: "AUTH_CODE" };
}

export function otpChallengeKey(challengeId: string): {
  pk: string;
  sk: string;
} {
  return { pk: `OTP#${challengeId}`, sk: "OTP" };
}
