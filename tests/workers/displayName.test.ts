import { expect, test } from "vitest";
import { normalizeDisplayName } from "../../workers/account/src/domain/displayName.js";

test("normalizeDisplayName trims valid display names", () => {
  expect(normalizeDisplayName("  Akaaku  ")).toBe("Akaaku");
});

test("normalizeDisplayName rejects empty values", () => {
  expect(normalizeDisplayName("   ")).toBeNull();
});

test("normalizeDisplayName rejects values longer than 20 characters", () => {
  expect(normalizeDisplayName("a".repeat(21))).toBeNull();
});

test("normalizeDisplayName rejects control characters", () => {
  expect(normalizeDisplayName("Akaaku\nHub")).toBeNull();
});
