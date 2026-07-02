export type TestServer = {
  origin: string;
  close(): Promise<void>;
};

export type MockUser = {
  discord_id: string;
  display_name: string;
  icon_key: string | null;
  icon_source: "r2" | "none";
  role: "user" | "admin";
  status: "active" | "disabled" | "deleted";
  disabled_reason?: string | null;
};

export type MockState = {
  appGuildAccess: Set<string>;
  authCodes: Map<string, Record<string, unknown>>;
  guildMemberships: Set<string>;
  users: Map<string, MockUser>;
  otpChallenges: Map<string, Record<string, unknown>>;
  personalAccessTokens: Map<string, Record<string, unknown>>;
  rememberTokens: Map<string, Record<string, unknown>>;
  lastOtp: string | null;
  otpSendCount: number;
  rememberCreateCount: number;
};

export const user = {
  discord_id: "123456789",
  display_name: "Akaaku",
  icon_key: null,
  icon_source: "none",
  role: "admin",
  status: "active",
} satisfies MockUser;
