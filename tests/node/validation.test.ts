import { expect, test } from "vitest";
import {
  normalizeDisplayName,
  requireNumber,
  requireString,
} from "../../lambdas/user-api/src/validation.js";

test("normalizeDisplayName trims valid display names", () => {
  expect(normalizeDisplayName("  Akaaku  ")).toBe("Akaaku");
});

test("normalizeDisplayName rejects empty values", () => {
  expect(() => normalizeDisplayName("   ")).toThrow("invalid_display_name");
});

test("normalizeDisplayName rejects values longer than 20 characters", () => {
  expect(() => normalizeDisplayName("a".repeat(21))).toThrow(
    "invalid_display_name",
  );
});

test("normalizeDisplayName rejects control characters", () => {
  expect(() => normalizeDisplayName("Akaaku\nHub")).toThrow(
    "invalid_display_name",
  );
});

test("requireString returns non-empty strings", () => {
  expect(requireString({ code: "auth-code" }, "code")).toBe("auth-code");
});

test("requireString rejects missing or empty strings", () => {
  expect(() => requireString({ code: "" }, "code")).toThrow("invalid_code");
  expect(() => requireString({}, "code")).toThrow("invalid_code");
});

test("requireNumber returns finite numbers", () => {
  expect(requireNumber({ expires_at: 123 }, "expires_at")).toBe(123);
});

test("requireNumber rejects non-finite numbers", () => {
  expect(() => requireNumber({ expires_at: Number.NaN }, "expires_at")).toThrow(
    "invalid_expires_at",
  );
});
