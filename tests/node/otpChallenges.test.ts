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
  const { context } = createUserApiContext();
  await putOtpChallenge(context, {
    challenge_id: "challenge",
    discord_id: "123456789",
    app_id: "hub",
    otp: "123456",
    return_to: "https://app.example.com/_auth/callback",
    expires_at: nowSeconds + 300,
  });

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
