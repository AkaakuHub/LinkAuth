export function normalizeDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (
    trimmed.length < 1 ||
    trimmed.length > 20 ||
    containsControlCharacter(trimmed)
  ) {
    return null;
  }
  return trimmed;
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
