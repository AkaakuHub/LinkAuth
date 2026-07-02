import type { MockState } from "./authFlowTypes.js";

export function unusedR2Bucket(): R2Bucket {
  return {
    async createMultipartUpload(): Promise<R2MultipartUpload> {
      throw new Error("R2 multipart upload is not used in auth flow E2E");
    },
    async delete(): Promise<void> {},
    async get(): Promise<R2ObjectBody | null> {
      return null;
    },
    async head(): Promise<R2Object | null> {
      return null;
    },
    async list(): Promise<R2Objects> {
      return {
        delimitedPrefixes: [],
        objects: [],
        truncated: false,
      };
    },
    async put(): Promise<R2Object> {
      throw new Error("R2 put is not used in auth flow E2E");
    },
    resumeMultipartUpload(): R2MultipartUpload {
      throw new Error("R2 multipart upload is not used in auth flow E2E");
    },
  };
}

export function testD1Database(state: MockState): D1Database {
  return {
    batch<T = unknown>(): Promise<D1Result<T>[]> {
      throw new Error("D1 batch is not used in auth flow E2E");
    },
    dump(): Promise<ArrayBuffer> {
      throw new Error("D1 dump is not used in auth flow E2E");
    },
    exec(): Promise<D1ExecResult> {
      throw new Error("D1 exec is not used in auth flow E2E");
    },
    prepare(query: string): D1PreparedStatement {
      return testD1Statement(state, query);
    },
    withSession(): D1DatabaseSession {
      return {
        batch<T = unknown>(): Promise<D1Result<T>[]> {
          throw new Error("D1 session batch is not used in auth flow E2E");
        },
        getBookmark(): D1SessionBookmark | null {
          return null;
        },
        prepare(query: string): D1PreparedStatement {
          return testD1Statement(state, query);
        },
      };
    },
  };
}

function testD1Statement(state: MockState, query: string): D1PreparedStatement {
  let values: unknown[] = [];
  return {
    bind(...bindings: unknown[]): D1PreparedStatement {
      values = bindings;
      return this;
    },
    first<T = unknown>(): Promise<T | null> {
      return Promise.resolve(selectD1Row(state, query, values) as T | null);
    },
    raw(): Promise<unknown[]> {
      throw new Error("D1 raw is not used in auth flow E2E");
    },
    run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      return Promise.resolve(
        runD1Statement(state, query, values) as D1Result<T>,
      );
    },
    all<T = unknown>(): Promise<D1Result<T>> {
      return Promise.resolve({
        meta: {
          changed_db: false,
          changes: 0,
          duration: 0,
          last_row_id: 0,
          rows_read: 0,
          rows_written: 0,
          served_by: "test",
          size_after: 0,
        },
        results: selectD1Rows(state, query, values) as T[],
        success: true,
      });
    },
  } as D1PreparedStatement;
}

function selectD1Row(
  state: MockState,
  query: string,
  values: unknown[],
): Record<string, unknown> | null {
  if (query.startsWith("SELECT * FROM users WHERE discord_id = ?")) {
    return state.users.get(String(values[0])) ?? null;
  }
  if (query.startsWith("SELECT * FROM auth_codes WHERE code = ?")) {
    return state.authCodes.get(String(values[0])) ?? null;
  }
  if (query.startsWith("SELECT * FROM otp_challenges WHERE challenge_id = ?")) {
    return state.otpChallenges.get(String(values[0])) ?? null;
  }
  if (query.startsWith("DELETE FROM otp_challenges")) {
    const challengeId = String(values[0]);
    const row = state.otpChallenges.get(challengeId) ?? null;
    state.otpChallenges.delete(challengeId);
    return row;
  }
  if (query.startsWith("SELECT discord_id, token_hash, expires_at")) {
    return state.rememberTokens.get(String(values[0])) ?? null;
  }
  if (query.startsWith("SELECT token_id, discord_id, name, token_hash")) {
    return state.personalAccessTokens.get(String(values[0])) ?? null;
  }
  if (query.includes("FROM user_guild_memberships membership")) {
    const appId = String(values[0]);
    const discordId = String(values[1]);
    for (const accessKey of state.appGuildAccess) {
      const [accessAppId, guildId] = accessKey.split(":");
      if (
        accessAppId === appId &&
        state.guildMemberships.has(`${discordId}:${guildId}`)
      ) {
        return { 1: 1 };
      }
    }
    return null;
  }
  return null;
}

function runD1Statement(
  state: MockState,
  query: string,
  values: unknown[],
): D1Result {
  let changes = 0;
  if (query.includes("INSERT OR IGNORE INTO auth_codes")) {
    state.authCodes.set(String(values[0]), {
      app_id: values[1],
      discord_id: String(values[2]),
      display_name: String(values[3]),
      role: values[4] === "admin" ? "admin" : "user",
      icon_source: values[5],
      icon_key: values[6],
      session_persistent: values[7],
      expires_at: values[9],
    });
    changes = 1;
  } else if (query.startsWith("DELETE FROM auth_codes")) {
    changes = state.authCodes.delete(String(values[0])) ? 1 : 0;
  } else if (query.includes("INSERT INTO otp_rate_limits")) {
    changes = 1;
  } else if (query.includes("INSERT OR IGNORE INTO otp_challenges")) {
    state.otpChallenges.set(String(values[0]), {
      challenge_id: values[0],
      discord_id: values[1],
      app_id: values[2],
      return_to: values[3],
      otp_hash: values[4],
      expires_at: values[6],
    });
    changes = 1;
  } else if (query.startsWith("DELETE FROM otp_challenges")) {
    changes = state.otpChallenges.delete(String(values[0])) ? 1 : 0;
  } else if (query.includes("INSERT OR IGNORE INTO remember_tokens")) {
    state.rememberTokens.set(String(values[0]), {
      discord_id: String(values[1]),
      token_hash: String(values[2]),
      expires_at: values[5],
    });
    state.rememberCreateCount += 1;
    changes = 1;
  } else if (query.startsWith("UPDATE remember_tokens")) {
    const token = state.rememberTokens.get(String(values[3]));
    if (token?.token_hash === values[4]) {
      state.rememberTokens.set(String(values[3]), {
        ...token,
        token_hash: String(values[0]),
        expires_at: values[2],
      });
      changes = 1;
    }
  } else if (query.startsWith("DELETE FROM remember_tokens WHERE discord_id")) {
    for (const [tokenId, token] of state.rememberTokens) {
      if (token.discord_id === String(values[0])) {
        state.rememberTokens.delete(tokenId);
        changes += 1;
      }
    }
  } else if (query.startsWith("DELETE FROM remember_tokens")) {
    changes = state.rememberTokens.delete(String(values[0])) ? 1 : 0;
  } else if (query.includes("INSERT OR IGNORE INTO personal_access_tokens")) {
    state.personalAccessTokens.set(String(values[0]), {
      token_id: String(values[0]),
      discord_id: String(values[1]),
      name: String(values[2]),
      token_hash: String(values[3]),
      scopes: String(values[4]),
      created_at: String(values[5]),
      last_used_at: null,
      expires_at: values[6],
      revoked_at: null,
    });
    changes = 1;
  } else if (query.includes("INSERT INTO users")) {
    const discordId = String(values[0]);
    const storedUser = state.users.get(discordId);
    state.users.set(discordId, {
      discord_id: discordId,
      display_name: storedUser?.display_name ?? String(values[2]),
      icon_key: storedUser?.icon_key ?? null,
      icon_source: storedUser?.icon_source ?? "none",
      role: storedUser?.role ?? "user",
      status: "active",
      disabled_reason: null,
    });
    changes = 1;
  } else if (query.includes("INSERT INTO user_guild_memberships")) {
    state.guildMemberships.add(`${String(values[0])}:${String(values[1])}`);
    changes = 1;
  } else if (query.startsWith("UPDATE personal_access_tokens")) {
    const token = state.personalAccessTokens.get(String(values[1]));
    if (token?.discord_id === String(values[2]) && token.revoked_at === null) {
      state.personalAccessTokens.set(String(values[1]), {
        ...token,
        revoked_at: String(values[0]),
      });
      changes = 1;
    }
  } else if (query.startsWith("DELETE FROM personal_access_tokens")) {
    for (const [tokenId, token] of state.personalAccessTokens) {
      if (token.discord_id === String(values[0])) {
        state.personalAccessTokens.delete(tokenId);
        changes += 1;
      }
    }
  } else if (query.startsWith("UPDATE users SET status = 'deleted'")) {
    const storedUser = state.users.get(String(values[2]));
    if (storedUser) {
      state.users.set(String(values[2]), {
        ...storedUser,
        status: "deleted",
      });
      changes = 1;
    }
  }
  return {
    meta: {
      changed_db: true,
      changes,
      duration: 0,
      last_row_id: 0,
      rows_read: 0,
      rows_written: changes,
      served_by: "test",
      size_after: 0,
    },
    results: [],
    success: true,
  };
}

function selectD1Rows(
  state: MockState,
  query: string,
  values: unknown[],
): Record<string, unknown>[] {
  if (query.includes("FROM personal_access_tokens")) {
    return [...state.personalAccessTokens.values()].filter(
      (token) => token.discord_id === String(values[0]),
    );
  }
  if (query.includes("FROM app_guild_access")) {
    return [...state.appGuildAccess]
      .map((accessKey) => {
        const [app_id, guild_id] = accessKey.split(":");
        return { app_id, guild_id };
      })
      .filter((access) => access.app_id === String(values[0]));
  }
  return [];
}
