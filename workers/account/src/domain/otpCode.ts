export function createOtpCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const value =
    ((bytes[0] ?? 0) << 24) |
    ((bytes[1] ?? 0) << 16) |
    ((bytes[2] ?? 0) << 8) |
    (bytes[3] ?? 0);
  return String(Math.abs(value) % 1_000_000).padStart(6, "0");
}
