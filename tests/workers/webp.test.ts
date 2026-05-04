import { expect, test } from "vitest";
import { isWebp512 } from "../../workers/account/src/media/webp.js";

test("WebP validation accepts a 512 square VP8X canvas", () => {
  expect(isWebp512(vp8xWebp(512, 512))).toBe(true);
});

test("WebP validation rejects non-512 VP8X canvases", () => {
  expect(isWebp512(vp8xWebp(256, 512))).toBe(false);
  expect(isWebp512(vp8xWebp(512, 256))).toBe(false);
});

test("WebP validation rejects RIFF WEBP files without a supported image chunk", () => {
  expect(
    isWebp512(
      new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x0a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
        0x45, 0x58, 0x49, 0x46, 0x00, 0x00, 0x00, 0x00,
      ]),
    ),
  ).toBe(false);
});

function vp8xWebp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  writeAscii(bytes, 0, "RIFF");
  writeUint32LittleEndian(bytes, 4, 22);
  writeAscii(bytes, 8, "WEBP");
  writeAscii(bytes, 12, "VP8X");
  writeUint32LittleEndian(bytes, 16, 10);
  writeUint24LittleEndian(bytes, 24, width - 1);
  writeUint24LittleEndian(bytes, 27, height - 1);
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function writeUint24LittleEndian(
  bytes: Uint8Array,
  offset: number,
  value: number,
): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
}

function writeUint32LittleEndian(
  bytes: Uint8Array,
  offset: number,
  value: number,
): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}
