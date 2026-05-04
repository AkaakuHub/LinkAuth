import { createHash, createHmac } from "node:crypto";
import { expect, test } from "vitest";
import {
  consumeOtpChallenge,
  putOtpChallenge,
} from "../../lambdas/user-api/src/otpChallenges.js";
import {
  createUserApiContext,
  parseJsonResponse,
} from "./userApiTestHelpers.js";

const nowSeconds = Math.floor(Date.now() / 1000);

test("OTP challenge accepts the correct six digit code once before expiration", async () => {
  const { context, items } = createUserApiContext();
  await putOtpChallenge(context, {
    challenge_id: "challenge",
    discord_id: "123456789",
    app_id: "hub",
    otp: "123456",
    return_to: "https://app.example.com/_auth/callback",
    expires_at: nowSeconds + 300,
  });
  expect(items.get("OTP#challenge\nOTP")?.otp_hash).toBe(
    createHmac("sha256", context.otpHashSecret)
      .update("challenge.123456", "utf8")
      .digest("hex"),
  );
  expect(items.get("OTP#challenge\nOTP")?.otp_hash).not.toBe(
    createHash("sha256").update("123456", "utf8").digest("hex"),
  );

  const firstResponse = await consumeOtpChallenge(context, {
    challenge_id: "challenge",
    otp: "123456",
  });
  const secondResponse = await consumeOtpChallenge(context, {
    challenge_id: "challenge",
    otp: "123456",
  });

  expect(firstResponse.statusCode).toBe(200);
  expect(parseJsonResponse(firstResponse)).toEqual({
    app_id: "hub",
    discord_id: "123456789",
    return_to: "https://app.example.com/_auth/callback",
  });
  expect(secondResponse.statusCode).toBe(401);
});

test("OTP challenge rejects a wrong code and consumes the challenge", async () => {
  const { context } = createUserApiContext();
  await putOtpChallenge(context, {
    challenge_id: "challenge",
    discord_id: "123456789",
    otp: "123456",
    return_to: "https://app.example.com/",
    expires_at: nowSeconds + 300,
  });

  const wrongResponse = await consumeOtpChallenge(context, {
    challenge_id: "challenge",
    otp: "654321",
  });
  const correctResponse = await consumeOtpChallenge(context, {
    challenge_id: "challenge",
    otp: "123456",
  });

  expect(wrongResponse.statusCode).toBe(401);
  expect(correctResponse.statusCode).toBe(401);
});

test("OTP challenge rejects expired challenges", async () => {
  const { context } = createUserApiContext();
  await putOtpChallenge(context, {
    challenge_id: "challenge",
    discord_id: "123456789",
    otp: "123456",
    return_to: "https://app.example.com/",
    expires_at: nowSeconds - 1,
  });

  const response = await consumeOtpChallenge(context, {
    challenge_id: "challenge",
    otp: "123456",
  });

  expect(response.statusCode).toBe(401);
});

test("OTP challenge rejects malformed codes at creation", async () => {
  const { context } = createUserApiContext();

  await expect(
    putOtpChallenge(context, {
      challenge_id: "challenge",
      discord_id: "123456789",
      otp: "abcdef",
      return_to: "https://app.example.com/",
      expires_at: nowSeconds + 300,
    }),
  ).rejects.toThrow("invalid_otp");
});

test("OTP challenge rejects credentialed return_to values at creation", async () => {
  const { context } = createUserApiContext();

  await expect(
    putOtpChallenge(context, {
      challenge_id: "challenge",
      discord_id: "123456789",
      otp: "123456",
      return_to: "https://user:pass@app.example.com/",
      expires_at: nowSeconds + 300,
    }),
  ).rejects.toThrow("invalid_return_to");
});
