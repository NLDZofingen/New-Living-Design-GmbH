import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

if (!process.env.BADPLANER_TEST_BUILD) throw new Error('BADPLANER_TEST_BUILD muss auf die kompilierten Testdateien zeigen.');
const buildRoot = resolve(process.env.BADPLANER_TEST_BUILD);
const { MAX_PHOTO_BASE64, MAX_PLAN_BASE64, MAX_SOURCE_IMAGE_BYTES, normalizeBase64, sniffImageMime, validateImageBytes } =
  await import(pathToFileURL(resolve(buildRoot, 'src/pages/badplaner/imageValidation.js')).href);
const { resizeImageFile, readFileNow, readRetry } = await import(pathToFileURL(resolve(buildRoot, 'src/pages/badplaner/resizeImage.js')).href);
// Die echten Wartezeiten (0,5 / 1 / 2 s) prueft ein eigener Test; hier kurz halten.
const DEFAULT_READ_DELAYS = [...readRetry.delaysMs];
readRetry.delaysMs = [1, 1, 1];

// Reale, lokal mit ImageMagick erzeugte weisse 1×1-Bilder. Keine Netzwerkfixtures.
const realImages = {
  'image/jpeg': '/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'image/png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAACklEQVQI12NoAAAAggCB3UNq9AAAAABJRU5ErkJggg==',
  'image/webp': 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=',
};

function put32(bytes, offset, value, littleEndian = false) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, littleEndian);
}

// Synthetische Header sind bewusst KEINE vollständig decodierbaren Bilder.
// Diese Tests prüfen Grenzen/Metadaten, nicht CRC, Entropiedaten oder Decoderintegrität.
function pngHeader(width = 1, height = 1) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  put32(bytes, 16, width);
  put32(bytes, 20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

function jpegHeader(width = 1, height = 1, marker = 0xc0) {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0,
    0xff, marker, 0, 17, 8, height >>> 8, height & 255, width >>> 8, width & 255,
    3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0,
  ]);
}

function webpContainer(chunks) {
  const size = 12 + chunks.reduce((total, { data }) => total + 8 + data.length + data.length % 2, 0);
  const bytes = new Uint8Array(size);
  bytes.set(Buffer.from('RIFF'));
  put32(bytes, 4, size - 8, true);
  bytes.set(Buffer.from('WEBP'), 8);
  let offset = 12;
  for (const { type, data } of chunks) {
    bytes.set(Buffer.from(type), offset);
    put32(bytes, offset + 4, data.length, true);
    bytes.set(data, offset + 8);
    offset += 8 + data.length + data.length % 2;
  }
  return bytes;
}

function webpHeader(type, width = 1, height = 1) {
  const data = new Uint8Array(type === 'VP8L' ? 5 : 10);
  if (type === 'VP8 ') {
    data.set([0x10, 0, 0, 0x9d, 0x01, 0x2a, width & 255, width >>> 8, height & 255, height >>> 8]);
  } else if (type === 'VP8L') {
    data[0] = 0x2f;
    put32(data, 1, (width - 1) + ((height - 1) * 16384), true);
  } else {
    const w = width - 1;
    const h = height - 1;
    data.set([0, 0, 0, 0, w & 255, (w >>> 8) & 255, (w >>> 16) & 255, h & 255, (h >>> 8) & 255, (h >>> 16) & 255]);
  }
  return webpContainer([{ type, data }]);
}

const rawLimits = { maxBytes: MAX_SOURCE_IMAGE_BYTES, maxPixels: 50_000_000, maxSide: 12_000 };

function stubGlobal(t, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  });
}

test('Base64: shared limits and canonical padded/unpadded groups', () => {
  assert.equal(MAX_PHOTO_BASE64, 2.5 * 1024 * 1024);
  assert.equal(MAX_PLAN_BASE64, 4 * 1024 * 1024);
  assert.equal(MAX_SOURCE_IMAGE_BYTES, 20 * 1024 * 1024);
  for (const value of ['Zg==', 'Zm8=', 'Zm9v', 'AAAA', '/w==', '//8=', '////']) {
    assert.equal(normalizeBase64(value, 4), value);
  }
});

test('Base64: rejects bad alphabet, misplaced padding, nonzero unused bits and whitespace', () => {
  for (const value of ['', 'Zg', 'Zm8', 'Zg=', '=Zg=', 'Z=g=', 'Zg===', 'Zg==AAAA', '====', 'Zg==\n', ' Zg==', 'Zg== ', 'Zh==', 'Zm9=', '____', '----', 'data:image/png;base64,AAAA']) {
    assert.throws(() => normalizeBase64(value, 100), Error, JSON.stringify(value));
  }
  assert.throws(() => normalizeBase64(null, 100), /Bilddaten/);
  assert.throws(() => normalizeBase64('AAAA', 3), /gross/);
  for (const limit of [0, -1, Infinity, NaN, 4.5]) assert.throws(() => normalizeBase64('AAAA', limit), /Dateigrösse/);
});

for (const [mime, base64] of Object.entries(realImages)) {
  test(`real small fixture: ${mime}`, () => {
    const bytes = Buffer.from(normalizeBase64(base64, 1000), 'base64');
    assert.equal(sniffImageMime(bytes), mime);
    assert.deepEqual(validateImageBytes(bytes, mime), { width: 1, height: 1, mime });
  });
}

test('MIME must be supported and match the signature; empty MIME only sniffed explicitly', () => {
  assert.equal(sniffImageMime(new Uint8Array()), null);
  assert.equal(sniffImageMime(Buffer.from('GIF89a')), null);
  assert.throws(() => validateImageBytes(pngHeader(), 'image/jpeg'), /stimmen nicht/);
  for (const mime of ['', 'image/jpg', 'image/gif', 'image/svg+xml', 'application/pdf', null]) {
    assert.throws(() => validateImageBytes(pngHeader(), mime), /JPEG/);
  }
  assert.equal(validateImageBytes(pngHeader(), ' IMAGE/PNG ').mime, 'image/png');
});

test('byte views honor their own offset and length', () => {
  const bytes = new Uint8Array(45);
  bytes.set(pngHeader(12, 23), 5);
  assert.deepEqual(validateImageBytes(bytes.subarray(5, 38), 'image/png'), { width: 12, height: 23, mime: 'image/png' });
  assert.throws(() => validateImageBytes(bytes.subarray(5, 35), 'image/png'), /Bildheader/);
});

test('PNG header validation allows valid dimensions, without claiming complete image decoding', () => {
  assert.deepEqual(validateImageBytes(pngHeader(1800, 1800), 'image/png'), { width: 1800, height: 1800, mime: 'image/png' });
  assert.deepEqual(validateImageBytes(pngHeader(10000, 5000), 'image/png', rawLimits), { width: 10000, height: 5000, mime: 'image/png' });
  assert.deepEqual(validateImageBytes(pngHeader(12000, 1), 'image/png', rawLimits), { width: 12000, height: 1, mime: 'image/png' });
});

test('dimensions and byte caps are enforced, including raw predecode caps', () => {
  for (const [width, height, limits] of [[1801, 1], [0, 10], [10, 0], [65535, 65535], [0xffffffff, 1], [12001, 1, rawLimits], [10000, 5001, rawLimits]]) {
    assert.throws(() => validateImageBytes(pngHeader(width, height), 'image/png', limits), Error);
  }
  assert.throws(() => validateImageBytes(pngHeader(100, 101), 'image/png', { maxPixels: 10000 }), /auflösung/);
  assert.equal(validateImageBytes(pngHeader(), 'image/png', { maxBytes: 33 }).width, 1);
  assert.throws(() => validateImageBytes(pngHeader(), 'image/png', { maxBytes: 32 }), /gross/);
  assert.throws(() => validateImageBytes(new Uint8Array(MAX_SOURCE_IMAGE_BYTES + 1), 'image/png', rawLimits), /gross/);
  for (const key of ['maxBytes', 'maxPixels', 'maxSide']) {
    for (const value of [0, -1, NaN, Infinity, 0.5]) assert.throws(() => validateImageBytes(pngHeader(), 'image/png', { [key]: value }), /Bildgrenzen/);
  }
});

test('PNG: truncated/malformed IHDR, invalid color/depth/methods', () => {
  for (const length of [0, 8, 16, 24, 32]) assert.throws(() => validateImageBytes(pngHeader().slice(0, length), 'image/png'), Error);
  for (const [offset, value] of [[11, 12], [12, 0], [24, 3], [25, 1], [26, 1], [27, 1], [28, 2]]) {
    const bytes = pngHeader();
    bytes[offset] = value;
    assert.throws(() => validateImageBytes(bytes, 'image/png'), /Bildheader/);
  }
});

test('JPEG: baseline/progressive frames and bounded APP skipping', () => {
  for (const marker of [0xc0, 0xc1, 0xc2]) {
    assert.deepEqual(validateImageBytes(jpegHeader(640, 480, marker), 'image/jpeg'), { width: 640, height: 480, mime: 'image/jpeg' });
  }
  const padded = Uint8Array.from([0xff, 0xd8, 0xff, ...jpegHeader(10, 20).slice(2)]);
  assert.equal(validateImageBytes(padded, 'image/jpeg').height, 20);
});

test('JPEG: truncated/zero-length segments, missing SOF, invalid components and zero dimensions', () => {
  for (const length of [0, 3, 5, 9, 13, 26]) assert.throws(() => validateImageBytes(jpegHeader().slice(0, length), 'image/jpeg'), Error);
  for (const [offset, value] of [[5, 0], [5, 255], [9, 0xda], [9, 0xd9], [9, 0x00], [11, 16], [17, 0], [17, 5], [12, 0]]) {
    const bytes = jpegHeader();
    bytes[offset] = value;
    assert.throws(() => validateImageBytes(bytes, 'image/jpeg'), /Bildheader/);
  }
  assert.throws(() => validateImageBytes(jpegHeader(0, 1), 'image/jpeg'), /Bildheader/);
  const tooMany = Uint8Array.from([0xff, 0xd8, ...Array.from({ length: 4097 }, () => [0xff, 0xe0, 0, 2]).flat(), ...jpegHeader().slice(8)]);
  assert.throws(() => validateImageBytes(tooMany, 'image/jpeg'), /Bildheader/);
});

for (const type of ['VP8 ', 'VP8L', 'VP8X']) {
  test(`WebP ${type}: header dimensions and limits`, () => {
    assert.deepEqual(validateImageBytes(webpHeader(type, 640, 480), 'image/webp'), { width: 640, height: 480, mime: 'image/webp' });
    assert.throws(() => validateImageBytes(webpHeader(type, 1801, 1), 'image/webp'), /auflösung/);
    assert.throws(() => validateImageBytes(webpHeader(type).slice(0, -1), 'image/webp'), /Bildheader/);
  });
}

test('WebP: RIFF/chunk bounds, frame signatures, version and reserved bits', () => {
  for (const [type, offset, value] of [['VP8 ', 4, 0], ['VP8 ', 16, 255], ['VP8 ', 20, 1], ['VP8 ', 23, 0], ['VP8L', 20, 0], ['VP8L', 24, 224], ['VP8X', 20, 128], ['VP8X', 21, 1]]) {
    const bytes = webpHeader(type);
    bytes[offset] = value;
    assert.throws(() => validateImageBytes(bytes, 'image/webp'), /Bildheader/);
  }
  assert.throws(() => validateImageBytes(webpContainer([{ type: 'JUNK', data: new Uint8Array(1) }]), 'image/webp'), /Bildheader/);
  const header = webpHeader('VP8L', 7, 9);
  const withMetadata = webpContainer([{ type: 'JUNK', data: new Uint8Array(3) }, { type: 'VP8L', data: header.slice(20, 25) }]);
  assert.equal(validateImageBytes(withMetadata, 'image/webp').width, 7);
  const conflict = webpContainer([{ type: 'VP8X', data: webpHeader('VP8X', 7, 9).slice(20, 30) }, { type: 'VP8L', data: webpHeader('VP8L').slice(20, 25) }]);
  assert.throws(() => validateImageBytes(conflict, 'image/webp'), /Bildheader/);
});

test('hostile short inputs fail with Error, without out-of-bounds reads', () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
    const bytes = Buffer.from(realImages[mime], 'base64');
    for (let size = 0; size < 20; size += 1) assert.throws(() => validateImageBytes(bytes.slice(0, size), mime), Error);
  }
});

test('client rejects file type/size and hostile dimensions before decoding', async (t) => {
  let reads = 0;
  let decodes = 0;
  stubGlobal(t, 'createImageBitmap', async () => { decodes += 1; throw new Error('Must not decode'); });
  const fake = (type, size, bytes = pngHeader()) => ({ type, size, arrayBuffer: async () => { reads += 1; return bytes.buffer; } });
  await assert.rejects(resizeImageFile(fake('image/svg+xml', 100)), /JPEG/);
  assert.equal(reads, 0);
  // Die Grösse zählt nach dem Lesen, an den echten Bytes.
  await assert.rejects(resizeImageFile(fake('image/png', 1, new Uint8Array(MAX_SOURCE_IMAGE_BYTES + 1))), /20 MB/);
  await assert.rejects(resizeImageFile(fake('image/png', 33, pngHeader(10000, 5001))), /auflösung/);
  await assert.rejects(resizeImageFile(fake('image/jpeg', 33)), /stimmen nicht/);
  assert.equal(decodes, 0);
});

test('a file the browser cannot read byte by byte is still decoded', async (t) => {
  // Android wirft für manche Dateien aus dem Dateiwähler NotReadableError,
  // sowohl bei arrayBuffer() als auch im FileReader. Der Decoder bekommt
  // dieselbe Datei aber oft trotzdem auf.
  const unreadable = () => { const err = new Error('The requested file could not be read'); err.name = 'NotReadableError'; throw err; };
  const bitmap = { width: 800, height: 600, close() {} };
  let decodedFromFile = 0;
  stubGlobal(t, 'createImageBitmap', async (source) => { if (source === file) decodedFromFile += 1; return bitmap; });
  stubGlobal(t, 'FileReader', class { readAsArrayBuffer() { this.onerror(); } });
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => `data:image/jpeg;base64,${realImages['image/jpeg']}` };
  stubGlobal(t, 'document', { createElement: () => canvas });
  const file = { type: 'image/jpeg', size: 4096, arrayBuffer: unreadable };
  const image = await resizeImageFile(file, 400);
  assert.equal(decodedFromFile, 1);
  assert.equal(image.width, 400);
  assert.equal(image.height, 300);
  assert.equal(image.base64, realImages['image/jpeg']);
});

test('an unreadable file that no decoder opens reports it in German', async (t) => {
  const unreadable = () => { const err = new Error('The requested file could not be read'); err.name = 'NotReadableError'; throw err; };
  stubGlobal(t, 'createImageBitmap', async () => { throw new Error('decode failed'); });
  stubGlobal(t, 'FileReader', class { readAsArrayBuffer() { this.onerror(); } });
  stubGlobal(t, 'URL', { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} });
  stubGlobal(t, 'Image', class { set src(_value) { setTimeout(() => this.onerror(), 0); } });
  const file = { type: 'image/jpeg', size: 4096, arrayBuffer: unreadable };
  await assert.rejects(resizeImageFile(file), (err) => err.name === 'Error' && /nicht lesen/.test(err.message));
});

test('bytes are read before file.size is touched (Android snapshot bug)', async (t) => {
  // Chrome auf Android: wer zuerst size abfragt, bekommt danach bei jedem
  // Lesen NotReadableError, wenn die Fotoauswahl andere Metadaten liefert.
  const order = [];
  stubGlobal(t, 'createImageBitmap', async () => ({ width: 10, height: 10, close() {} }));
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => `data:image/jpeg;base64,${realImages['image/jpeg']}` };
  stubGlobal(t, 'document', { createElement: () => canvas });
  const bytes = Buffer.from(realImages['image/jpeg'], 'base64');
  const file = {
    type: 'image/jpeg',
    get size() { order.push('size'); return bytes.length; },
    arrayBuffer: async () => { order.push('read'); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length); },
  };
  await resizeImageFile(file, 400);
  assert.deepEqual(order.slice(0, 1), ['read']);
  order.length = 0;
  const copy = await readFileNow({ name: 'bad.JPG', type: 'image/jpeg', get size() { order.push('size'); return 1; }, arrayBuffer: file.arrayBuffer });
  assert.deepEqual(order, ['read']);
  assert.equal(copy.size, bytes.length);
  assert.equal(copy.name, 'bad.JPG');
});

test('the failure code is complete and names type, size and extension', async (t) => {
  const unreadable = () => { const err = new Error('The requested file could not be read'); err.name = 'NotReadableError'; throw err; };
  stubGlobal(t, 'createImageBitmap', async () => { const err = new Error('x'); err.name = 'InvalidStateError'; throw err; });
  stubGlobal(t, 'FileReader', class { readAsArrayBuffer() { this.error = Object.assign(new Error('x'), { name: 'NotReadableError' }); this.onerror(); } });
  stubGlobal(t, 'URL', { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} });
  stubGlobal(t, 'Image', class { set src(_value) { setTimeout(() => this.onerror(), 0); } });
  const file = { name: 'PXL_20260920.jpg', type: 'image/jpeg', size: 4096, arrayBuffer: unreadable };
  const expected = /\(Code buf:NotReadableError\/fr:NotReadableError\/leseversuche:4\/bmpX:InvalidStateError\/bmp:InvalidStateError\/img:Error\/lauf1:Error\/lauf2:Error · Typ image\/jpeg · 4096 B · \.jpg\)$/;
  await assert.rejects(resizeImageFile(file), (err) => expected.test(err.message));
  await assert.rejects(readFileNow(file), (err) => /nicht lesen\. \(Code buf:NotReadableError\/fr:NotReadableError\/leseversuche:4 · Typ image\/jpeg · 4096 B · \.jpg\)$/.test(err.message));
});

test('a photo that fails twice is read on the third attempt, before any error', async (t) => {
  // Diego, 20.09. in Produktion: dasselbe Foto scheiterte zweimal und ging beim dritten Mal.
  assert.deepEqual(DEFAULT_READ_DELAYS, [500, 1000, 2000]);
  let reads = 0;
  stubGlobal(t, 'createImageBitmap', async () => ({ width: 10, height: 10, close() {} }));
  stubGlobal(t, 'FileReader', class { readAsArrayBuffer() { this.error = Object.assign(new Error('x'), { name: 'NotReadableError' }); this.onerror(); } });
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => `data:image/jpeg;base64,${realImages['image/jpeg']}` };
  stubGlobal(t, 'document', { createElement: () => canvas });
  const bytes = Buffer.from(realImages['image/jpeg'], 'base64');
  const file = { name: 'a.jpg', type: 'image/jpeg', size: bytes.length, arrayBuffer: async () => {
    reads += 1;
    if (reads < 3) throw Object.assign(new Error('x'), { name: 'NotReadableError' });
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
  } };
  const image = await resizeImageFile(file, 400);
  assert.equal(reads, 3);
  assert.equal(image.base64, realImages['image/jpeg']);
  reads = 0;
  const copy = await readFileNow(file);
  assert.equal(reads, 3);
  assert.equal(copy.size, bytes.length);
});

test('client sniffs missing MIME, returns oriented dimensions and always closes bitmap', async (t) => {
  let closed = 0;
  let encoded = realImages['image/jpeg'];
  const bitmap = { width: 600, height: 1200, close: () => { closed += 1; } };
  stubGlobal(t, 'createImageBitmap', async () => bitmap);
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => `data:image/jpeg;base64,${encoded}` };
  stubGlobal(t, 'document', { createElement: () => canvas });
  const bytes = pngHeader(1200, 600);
  const file = { type: '', size: bytes.length, arrayBuffer: async () => bytes.buffer };
  const image = await resizeImageFile(file, 600);
  assert.equal(image.width, 300);
  assert.equal(image.height, 600);
  assert.equal(image.base64, encoded);
  assert.equal(closed, 1);

  encoded = 'AAAA'.repeat(MAX_PHOTO_BASE64 / 4 + 1);
  await assert.rejects(resizeImageFile(file), /gross/);
  assert.equal(closed, 2);
  encoded = realImages['image/jpeg'];
  canvas.getContext = () => null;
  await assert.rejects(resizeImageFile(file), /Canvas/);
  assert.equal(closed, 3);
});
