import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const buildRoot = resolve(process.env.BADPLANER_TEST_BUILD);
const { imagesLoad } = await import(pathToFileURL(resolve(buildRoot, 'src/pages/badplaner/imagesLoad.js')).href);

// Kleines Image-Double: die Datei "gibt es", wenn sie in `files` steht.
function fakeImage(files) {
  return class {
    naturalWidth = 0;
    set src(value) { setTimeout(() => { if (files[value]) { this.naturalWidth = files[value]; this.onload(); } else this.onerror(); }, 0); }
  };
}

test('Vorher/Nachher erscheint nur, wenn beide Bilder wirklich laden', async (t) => {
  const original = globalThis.Image;
  t.after(() => { globalThis.Image = original; });
  globalThis.Image = fakeImage({ '/v.jpg': 800, '/n.jpg': 800 });
  assert.equal(await imagesLoad(['/v.jpg', '/n.jpg']), true);
  globalThis.Image = fakeImage({ '/v.jpg': 800 });
  assert.equal(await imagesLoad(['/v.jpg', '/n.jpg']), false, 'eine fehlende Datei versteckt den Block');
  globalThis.Image = fakeImage({ '/v.jpg': 800, '/n.jpg': 0 });
  assert.equal(await imagesLoad(['/v.jpg', '/n.jpg']), false, 'ein leeres Bild zaehlt als kaputt');
});
