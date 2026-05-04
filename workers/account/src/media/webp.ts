export function isWebp512(bytes: Uint8Array): boolean {
  const size = webpCanvasSize(bytes);
  return size?.width === 512 && size.height === 512;
}

function webpCanvasSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (
    bytes.length < 30 ||
    fourcc(bytes, 0) !== "RIFF" ||
    fourcc(bytes, 8) !== "WEBP"
  ) {
    return null;
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = fourcc(bytes, offset);
    const chunkSize = uint32LittleEndian(bytes, offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > bytes.length) {
      return null;
    }
    const size = chunkCanvasSize(bytes, chunkType, dataOffset, chunkSize);
    if (size) {
      return size;
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  return null;
}

function chunkCanvasSize(
  bytes: Uint8Array,
  chunkType: string,
  dataOffset: number,
  chunkSize: number,
): { width: number; height: number } | null {
  if (chunkType === "VP8X" && chunkSize >= 10) {
    return {
      width: uint24LittleEndian(bytes, dataOffset + 4) + 1,
      height: uint24LittleEndian(bytes, dataOffset + 7) + 1,
    };
  }
  if (
    chunkType === "VP8 " &&
    chunkSize >= 10 &&
    bytes[dataOffset + 3] === 0x9d &&
    bytes[dataOffset + 4] === 0x01 &&
    bytes[dataOffset + 5] === 0x2a
  ) {
    return {
      width: uint16LittleEndian(bytes, dataOffset + 6) & 0x3fff,
      height: uint16LittleEndian(bytes, dataOffset + 8) & 0x3fff,
    };
  }
  if (chunkType === "VP8L" && chunkSize >= 5 && bytes[dataOffset] === 0x2f) {
    const byte0 = bytes[dataOffset + 1] ?? 0;
    const byte1 = bytes[dataOffset + 2] ?? 0;
    const byte2 = bytes[dataOffset + 3] ?? 0;
    const byte3 = bytes[dataOffset + 4] ?? 0;
    return {
      width: 1 + byte0 + ((byte1 & 0x3f) << 8),
      height: 1 + ((byte1 & 0xc0) >> 6) + (byte2 << 2) + ((byte3 & 0x0f) << 10),
    };
  }
  return null;
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function uint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function uint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

function uint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  );
}
