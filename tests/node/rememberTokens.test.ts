import { expect, test } from "vitest";
import {
  deleteAllRememberTokens,
  putRememberToken,
  rotateRememberToken,
} from "../../lambdas/user-api/src/rememberTokens.js";
import {
  createUserApiContext,
  parseJsonResponse,
} from "./userApiTestHelpers.js";

const nowSeconds = Math.floor(Date.now() / 1000);
const activeUser = {
  pk: "USER#123456789",
  sk: "PROFILE",
  discord_id: "123456789",
  display_name: "Akaaku",
  guild_checked_at: new Date().toISOString(),
  guild_member_status: "active",
  role: "admin",
  status: "active",
} as const;

test("Remember token rotates when the stored hash matches", async () => {
  const { context, items } = createUserApiContext([activeUser]);
  await putRememberToken(context, {
    discord_id: "123456789",
    token_id: "remember-id",
    token_hash: "old-hash",
    expires_at: nowSeconds + 300,
  });

  const response = await rotateRememberToken(context, {
    token_id: "remember-id",
    old_token_hash: "old-hash",
    new_token_hash: "new-hash",
    expires_at: nowSeconds + 600,
  });

  expect(response.statusCode).toBe(200);
  expect(parseJsonResponse(response)).toEqual({ user: activeUser });
  expect(items.get("REMEMBER#remember-id\nREMEMBER")?.token_hash).toBe(
    "new-hash",
  );
});

test("Remember token rejects and deletes a mismatched token", async () => {
  const { context, items } = createUserApiContext([activeUser]);
  await putRememberToken(context, {
    discord_id: "123456789",
    token_id: "remember-id",
    token_hash: "old-hash",
    expires_at: nowSeconds + 300,
  });

  const response = await rotateRememberToken(context, {
    token_id: "remember-id",
    old_token_hash: "wrong-hash",
    new_token_hash: "new-hash",
    expires_at: nowSeconds + 600,
  });

  expect(response.statusCode).toBe(401);
  expect(items.has("REMEMBER#remember-id\nREMEMBER")).toBe(false);
});

test("Remember token rejects disabled users", async () => {
  const { context, items } = createUserApiContext([activeUser]);
  await putRememberToken(context, {
    discord_id: "123456789",
    token_id: "remember-id",
    token_hash: "old-hash",
    expires_at: nowSeconds + 300,
  });
  const user = items.get("USER#123456789\nPROFILE");
  if (!user) {
    throw new Error("Active user is missing");
  }
  user.status = "disabled";

  const response = await rotateRememberToken(context, {
    token_id: "remember-id",
    old_token_hash: "old-hash",
    new_token_hash: "new-hash",
    expires_at: nowSeconds + 600,
  });

  expect(response.statusCode).toBe(401);
  expect(parseJsonResponse(response)).toEqual({ error: "inactive_user" });
});

test("Remember token creation rejects inactive users", async () => {
  const { context } = createUserApiContext([
    {
      ...activeUser,
      status: "deleted",
    },
  ]);

  await expect(
    putRememberToken(context, {
      discord_id: "123456789",
      token_id: "remember-id",
      token_hash: "old-hash",
      expires_at: nowSeconds + 300,
    }),
  ).rejects.toThrow("inactive_user");
});

test("Remember token rejects and deletes expired tokens", async () => {
  const { context, items } = createUserApiContext([activeUser]);
  await putRememberToken(context, {
    discord_id: "123456789",
    token_id: "remember-id",
    token_hash: "old-hash",
    expires_at: nowSeconds - 1,
  });

  const response = await rotateRememberToken(context, {
    token_id: "remember-id",
    old_token_hash: "old-hash",
    new_token_hash: "new-hash",
    expires_at: nowSeconds + 600,
  });

  expect(response.statusCode).toBe(401);
  expect(parseJsonResponse(response)).toEqual({
    error: "invalid_remember_token",
  });
  expect(items.has("REMEMBER#remember-id\nREMEMBER")).toBe(false);
});

test("Remember token rejects missing numeric expiration and deletes the token", async () => {
  const { context, items } = createUserApiContext([
    activeUser,
    {
      pk: "REMEMBER#remember-id",
      sk: "REMEMBER",
      discord_id: "123456789",
      gsi1pk: "USER#123456789",
      gsi1sk: "REMEMBER#remember-id",
      token_hash: "old-hash",
      token_id: "remember-id",
    },
  ]);

  const response = await rotateRememberToken(context, {
    token_id: "remember-id",
    old_token_hash: "old-hash",
    new_token_hash: "new-hash",
    expires_at: nowSeconds + 600,
  });

  expect(response.statusCode).toBe(401);
  expect(items.has("REMEMBER#remember-id\nREMEMBER")).toBe(false);
});

test("Remember token delete-all removes only remember tokens for the user", async () => {
  const { context, items } = createUserApiContext([
    activeUser,
    {
      pk: "REMEMBER#one",
      sk: "REMEMBER",
      discord_id: "123456789",
      gsi1pk: "USER#123456789",
      gsi1sk: "REMEMBER#one",
      token_hash: "hash-one",
      token_id: "one",
    },
    {
      pk: "REMEMBER#two",
      sk: "REMEMBER",
      discord_id: "123456789",
      gsi1pk: "USER#123456789",
      gsi1sk: "REMEMBER#two",
      token_hash: "hash-two",
      token_id: "two",
    },
    {
      pk: "REMEMBER#other",
      sk: "REMEMBER",
      discord_id: "other",
      gsi1pk: "USER#other",
      gsi1sk: "REMEMBER#other",
      token_hash: "hash-other",
      token_id: "other",
    },
  ]);

  await deleteAllRememberTokens(context, "123456789");

  expect(items.has("REMEMBER#one\nREMEMBER")).toBe(false);
  expect(items.has("REMEMBER#two\nREMEMBER")).toBe(false);
  expect(items.has("USER#123456789\nPROFILE")).toBe(true);
  expect(items.has("REMEMBER#other\nREMEMBER")).toBe(true);
});

test("Remember token delete-all removes every query page", async () => {
  const { context, items, setQueryPageSize } = createUserApiContext([
    activeUser,
    {
      pk: "REMEMBER#one",
      sk: "REMEMBER",
      discord_id: "123456789",
      gsi1pk: "USER#123456789",
      gsi1sk: "REMEMBER#one",
      token_hash: "hash-one",
      token_id: "one",
    },
    {
      pk: "REMEMBER#two",
      sk: "REMEMBER",
      discord_id: "123456789",
      gsi1pk: "USER#123456789",
      gsi1sk: "REMEMBER#two",
      token_hash: "hash-two",
      token_id: "two",
    },
  ]);
  setQueryPageSize(1);

  await deleteAllRememberTokens(context, "123456789");

  expect(items.has("REMEMBER#one\nREMEMBER")).toBe(false);
  expect(items.has("REMEMBER#two\nREMEMBER")).toBe(false);
});
