import { httpError, type JsonBody } from "./http.js";

export function normalizeDisplayName(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length < 1 ||
    trimmed.length > 20 ||
    containsControlCharacter(trimmed)
  ) {
    throw httpError(400, "invalid_display_name");
  }
  return trimmed;
}

export function requireString(body: JsonBody, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) {
    throw httpError(400, `invalid_${key}`);
  }
  return value;
}

export function requireNumber(body: JsonBody, key: string): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw httpError(400, `invalid_${key}`);
  }
  return value;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 31 || codePoint === 127) {
      return true;
    }
  }
  return false;
}
