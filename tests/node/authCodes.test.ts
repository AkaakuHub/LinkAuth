import { expect, test } from "vitest";
import {
  consumeAuthCode,
  putAuthCode,
} from "../../lambdas/user-api/src/authCodes.js";
import {
  createUserApiContext,
  parseJsonResponse,
} from "./userApiTestHelpers.js";

const nowSeconds = Math.floor(Date.now() / 1000);

test("Auth code can be consumed once by the same app before expiration", async () => {
  const { context } = createUserApiContext();
  await putAuthCode(context, {
    app_id: "hub",
    code: "auth-code",
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "admin",
    },
    expires_at: nowSeconds + 300,
  });

  const firstResponse = await consumeAuthCode(context, {
    app_id: "hub",
    code: "auth-code",
  });
  const secondResponse = await consumeAuthCode(context, {
    app_id: "hub",
    code: "auth-code",
  });

  expect(firstResponse.statusCode).toBe(200);
  expect(parseJsonResponse(firstResponse)).toEqual({
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "admin",
    },
  });
  expect(secondResponse.statusCode).toBe(401);
});

test("Auth code rejects a different app_id", async () => {
  const { context } = createUserApiContext();
  await putAuthCode(context, {
    app_id: "hub",
    code: "auth-code",
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "user",
    },
    expires_at: nowSeconds + 300,
  });

  const response = await consumeAuthCode(context, {
    app_id: "other",
    code: "auth-code",
  });

  expect(response.statusCode).toBe(401);
  expect(parseJsonResponse(response)).toEqual({ error: "invalid_auth_code" });
});

test("Auth code is not consumed by a different app_id", async () => {
  const { context } = createUserApiContext();
  await putAuthCode(context, {
    app_id: "hub",
    code: "auth-code",
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "user",
    },
    expires_at: nowSeconds + 300,
  });

  const wrongAppResponse = await consumeAuthCode(context, {
    app_id: "other",
    code: "auth-code",
  });
  const correctAppResponse = await consumeAuthCode(context, {
    app_id: "hub",
    code: "auth-code",
  });

  expect(wrongAppResponse.statusCode).toBe(401);
  expect(correctAppResponse.statusCode).toBe(200);
});

test("Auth code rejects expired codes", async () => {
  const { context } = createUserApiContext();
  await putAuthCode(context, {
    app_id: "hub",
    code: "auth-code",
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "user",
    },
    expires_at: nowSeconds - 1,
  });

  const response = await consumeAuthCode(context, {
    app_id: "hub",
    code: "auth-code",
  });

  expect(response.statusCode).toBe(401);
});
