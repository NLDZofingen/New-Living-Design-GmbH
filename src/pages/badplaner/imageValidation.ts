/**
 * Gemeinsame, laufzeitunabhängige Vorprüfung für Browser und API.
 * Prüft Base64, Dateisignatur und begrenzte Bildheader – KEIN vollständiger
 * Bilddecoder: Pixeldaten, PNG-CRC und komprimierte Daten werden nicht geprüft.
 */
export const MAX_PHOTO_BASE64 = 2.5 * 1024 * 1024;
export const MAX_PLAN_BASE64 = 4 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export interface ImageLimits {
  maxBytes?: number;
  maxPixels?: number;
  maxSide?: number;
}
export interface ImageMetadata {
  width: number;
  height: number;
  mime: ImageMime;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BAD_HEADER = 'Die Bilddatei ist beschädigt oder hat einen ungültigen Bildheader.';
const MAX_HEADER_CHUNKS = 4096;

/** Akzeptiert ausschliesslich nichtleeres, kanonisches Base64 ohne data:-Prefix. */
export function normalizeBase64(data: string, maxChars: number): string {
  if (!Number.isSafeInteger(maxChars) || maxChars <= 0) throw new Error('Ungültige Dateigrösse.');
  if (typeof data !== 'string' || data.length === 0) throw new Error('Die Bilddaten fehlen.');
  if (data.length > maxChars) throw new Error('Die Datei ist zu gross. Bitte wählen Sie eine kleinere Datei.');
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new Error('Die Datei enthält ungültige Base64-Daten.');
  }
  // Auch nicht genutzte Bits müssen null sein: z. B. Zh== ist nicht kanonisch.
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const lastValue = BASE64_ALPHABET.indexOf(data[data.length - padding - 1]);
  if ((padding === 2 && (lastValue & 15) !== 0) || (padding === 1 && (lastValue & 3) !== 0)) {
    throw new Error('Die Datei enthält ungültige Base64-Daten.');
  }
  return data;
}

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return offset + expected.length <= bytes.length && expected.every((value, index) => bytes[offset + index] === value);
}

/** Für lokale Dateien ohne MIME-Angabe; Dateiendungen werden nicht vertraut. */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (hasBytes(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (hasBytes(bytes, 0, [82, 73, 70, 70]) && hasBytes(bytes, 8, [87, 69, 66, 80])) return 'image/webp';
  return null;
}

function requireBytes(bytes: Uint8Array, offset: number, length: number): void {
  if (offset < 0 || length < 0 || offset + length > bytes.length) throw new Error(BAD_HEADER);
}

function uint16BE(bytes: Uint8Array, offset: number): number {
  requireBytes(bytes, offset, 2);
  return bytes[offset] * 256 + bytes[offset + 1];
}

function uint24LE(bytes: Uint8Array, offset: number): number {
  requireBytes(bytes, offset, 3);
  return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
}

function uint32(bytes: Uint8Array, offset: number, littleEndian = false): number {
  requireBytes(bytes, offset, 4);
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, littleEndian);
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  requireBytes(bytes, 0, 33); // Signatur + vollständiger IHDR inkl. CRC-Feld
  if (uint32(bytes, 8) !== 13 || !hasBytes(bytes, 12, [73, 72, 68, 82])) throw new Error(BAD_HEADER);
  const allowedDepths: Record<number, readonly number[]> = {
    0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16],
  };
  if (!allowedDepths[bytes[25]]?.includes(bytes[24]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) {
    throw new Error(BAD_HEADER);
  }
  const width = uint32(bytes, 16);
  const height = uint32(bytes, 20);
  if (width > 0x7fffffff || height > 0x7fffffff) throw new Error(BAD_HEADER);
  return { width, height };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  let offset = 2;
  for (let segments = 0; segments < MAX_HEADER_CHUNKS && offset < bytes.length; segments += 1) {
    if (bytes[offset++] !== 0xff) throw new Error(BAD_HEADER);
    // Füllbytes sind erlaubt, ihre Anzahl bleibt durch maxBytes begrenzt.
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    requireBytes(bytes, offset, 1);
    const marker = bytes[offset++];
    if (marker === 0x01) continue; // TEM hat kein Längenfeld.
    if (marker === 0 || marker === 0xd8 || marker === 0xd9 || marker === 0xda || (marker >= 0xd0 && marker <= 0xd7)) {
      throw new Error(BAD_HEADER); // Kein Frameheader vor den Bilddaten.
    }
    const length = uint16BE(bytes, offset);
    if (length < 2) throw new Error(BAD_HEADER);
    requireBytes(bytes, offset, length);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (length < 11) throw new Error(BAD_HEADER);
      const components = bytes[offset + 7];
      if (components < 1 || components > 4 || length !== 8 + 3 * components || bytes[offset + 2] < 1 || bytes[offset + 2] > 16) {
        throw new Error(BAD_HEADER);
      }
      return { width: uint16BE(bytes, offset + 5), height: uint16BE(bytes, offset + 3) };
    }
    offset += length;
  }
  throw new Error(BAD_HEADER);
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } {
  requireBytes(bytes, 0, 20);
  if (uint32(bytes, 4, true) + 8 !== bytes.length) throw new Error(BAD_HEADER);
  let dimensions: { width: number; height: number } | undefined;
  let offset = 12;
  for (let chunks = 0; chunks < MAX_HEADER_CHUNKS && offset < bytes.length; chunks += 1) {
    requireBytes(bytes, offset, 8);
    const length = uint32(bytes, offset + 4, true);
    const payload = offset + 8;
    requireBytes(bytes, payload, length + (length % 2));
    if (hasBytes(bytes, offset, [86, 80, 56, 88])) { // VP8X: erweiterter Canvasheader
      if (offset !== 12 || length !== 10 || (bytes[payload] & 0xc1) !== 0 || !hasBytes(bytes, payload + 1, [0, 0, 0])) {
        throw new Error(BAD_HEADER);
      }
      dimensions = { width: uint24LE(bytes, payload + 4) + 1, height: uint24LE(bytes, payload + 7) + 1 };
    } else if (hasBytes(bytes, offset, [86, 80, 56, 32])) { // VP8: verlustbehafteter Keyframe
      if (length < 10 || (bytes[payload] & 1) !== 0 || !hasBytes(bytes, payload + 3, [0x9d, 0x01, 0x2a])) {
        throw new Error(BAD_HEADER);
      }
      const frame = {
        width: (bytes[payload + 6] + bytes[payload + 7] * 256) & 0x3fff,
        height: (bytes[payload + 8] + bytes[payload + 9] * 256) & 0x3fff,
      };
      if (dimensions && (frame.width !== dimensions.width || frame.height !== dimensions.height)) throw new Error(BAD_HEADER);
      dimensions = frame;
    } else if (hasBytes(bytes, offset, [86, 80, 56, 76])) { // VP8L: verlustfreier Header
      if (length < 5 || bytes[payload] !== 0x2f) throw new Error(BAD_HEADER);
      const bits = uint32(bytes, payload + 1, true);
      if ((bits >>> 29) !== 0) throw new Error(BAD_HEADER);
      const frame = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      if (dimensions && (frame.width !== dimensions.width || frame.height !== dimensions.height)) throw new Error(BAD_HEADER);
      dimensions = frame;
    }
    offset = payload + length + (length % 2);
  }
  if (offset !== bytes.length || !dimensions) throw new Error(BAD_HEADER);
  return dimensions;
}

/**
 * API-Defaults passen zu maximal 1800 × 1800 px und 4 MiB Base64.
 * Vor Browser-Decodierung für Rohdateien explizit 20 MiB / 50 MP / 12000 px setzen.
 * Ein erfolgreiches Ergebnis bestätigt Header, nicht vollständige Bildintegrität.
 */
export function validateImageBytes(bytes: Uint8Array, mime: string, limits: ImageLimits = {}): ImageMetadata {
  const { maxBytes = MAX_PLAN_BASE64 * 3 / 4, maxPixels = 3_300_000, maxSide = 1800 } = limits;
  if (![maxBytes, maxPixels, maxSide].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('Ungültige Bildgrenzen.');
  }
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error(BAD_HEADER);
  if (bytes.length > maxBytes) throw new Error('Die Bilddatei ist zu gross. Bitte wählen Sie eine kleinere Datei.');
  const expected = typeof mime === 'string' ? mime.trim().toLowerCase() : '';
  if (expected !== 'image/jpeg' && expected !== 'image/png' && expected !== 'image/webp') {
    throw new Error('Bitte wählen Sie ein JPEG-, PNG- oder WebP-Bild.');
  }
  if (sniffImageMime(bytes) !== expected) throw new Error('Dateityp und Bildinhalt stimmen nicht überein.');
  const dimensions = expected === 'image/png' ? pngDimensions(bytes) : expected === 'image/jpeg' ? jpegDimensions(bytes) : webpDimensions(bytes);
  const { width, height } = dimensions;
  if (!width || !height) throw new Error(BAD_HEADER);
  if (width > maxSide || height > maxSide || width * height > maxPixels) {
    throw new Error('Die Bildauflösung ist zu gross. Bitte wählen Sie ein kleineres Bild.');
  }
  return { width, height, mime: expected };
}
