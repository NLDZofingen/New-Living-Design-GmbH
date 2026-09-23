/** Deterministic static-output checks. This is not browser/layout QA. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const page = (route = '') => readFileSync(path.join(dist, route, 'index.html'), 'utf8');
const home = page();
const products = page('produkte');
const main = home.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
assert.ok(main, 'Home has a prerendered main landmark');
assert.match(home, /data-prerendered="\/"/);
assert.match(main, /<h1\b[^>]*>Bad, Küchen,[\s\S]*?Platten[\s\S]*?Wellness\.[\s\S]*?<\/h1>/);
assert.equal([...main.matchAll(/<h1\b/g)].length, 1);
for (const anchor of ['bad', 'kuechen', 'platten', 'wellness']) {
  assert.ok(main.includes(`href="/produkte#${anchor}"`), `Home links to ${anchor}`);
  assert.ok(products.includes(`id="${anchor}"`), `Product target ${anchor} exists`);
}
assert.match(products, /Bad, Küchen, Platten[\s\S]*?Wellness/);
assert.match(products, /Küchenberatung anfragen/);
assert.match(products, /3D-Planung/);
assert.match(products, /Platten für Wand und Boden/);
assert.match(products, /Wellness für Ihr Zuhause/);
assert.match(products, /Badberatung anfragen/);
assert.match(products, /Plattenberatung anfragen/);
assert.match(products, /Wellness-Beratung anfragen/);
assert.doesNotMatch(products, /<h3[^>]*>Bodenbeläge<\/h3>/);
const ordered = ['sortiment-title', 'showroom-title', 'references-title', 'planner-title', 'renovation-title', 'contact-title'];
for (let index = 1; index < ordered.length; index += 1) {
  assert.ok(main.indexOf(`id="${ordered[index - 1]}"`) < main.indexOf(`id="${ordered[index]}"`), `Home order: ${ordered[index - 1]} before ${ordered[index]}`);
}
assert.doesNotMatch(main, /Online Buchen|eigene Equipe|Traumhadbad|30 Sekunden|23 Bewertungen|Häufige Fragen|href="\/blog/i);
assert.match(main, /Ausstellungsberatung anfragen/);
assert.match(main, /href="\/badplaner"/);
assert.match(main, /weitere Bilder zeigen das Sortiment unserer Lieferanten/);
assert.match(main, /wohnraum-boden-marmoroptik/);
assert.match(main, /kueche-insel-messing/);
for (const amount of ["21&#x27;300", "27&#x27;700", "36&#x27;800"]) assert.ok(main.includes(amount), `Existing package amount ${amount} is retained`);

const references = [...main.matchAll(/href="\/referenzen#([^"]+)"/g)].map((match) => match[1]);
assert.equal(references.length, 3);
for (const id of references) assert.ok(page('referenzen').includes(`id="${id}"`), `Reference target ${id} exists`);
const images = [...main.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
assert.equal(images.length, 8, 'One real showroom image, four category images, three reference images');
for (const src of images) {
  assert.ok(src.startsWith('/assets/') || src.startsWith('/referenzen/'));
  assert.ok(existsSync(path.join(dist, decodeURIComponent(src))), `Materialized asset: ${src}`);
}
assert.doesNotMatch(main, /class="[^"]*\bundefined\b/);

const header = home.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
assert.ok(header);
const desktop = header.match(/<nav\b[^>]*class="nav-desktop"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
assert.ok(desktop);
const links = [...desktop.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(links, ['/produkte#bad', '/produkte#kuechen', '/produkte#platten', '/produkte#wellness', '/badplaner', '/referenzen', '/ueber-uns']);
assert.match(header, /aria-expanded="false"/);
assert.match(header, /aria-controls="[^"]+"/);
assert.match(header, /aria-label="Menü öffnen"/);
assert.doesNotMatch(header, /Online Buchen/);
assert.match(header, /href="\/kontakt"[^>]*>Beratung anfragen/);
const footer = home.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1];
assert.ok(footer);
assert.doesNotMatch(footer, /eigene Equipe/i);
for (const route of ['badumbau-zofingen', 'dienstleistungen', 'partner', 'blog', 'booking', 'kontakt']) assert.ok(footer.includes(`href="/${route}"`));

const jsonLd = [...home.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
assert.ok(jsonLd.length > 0);
assert.doesNotMatch(JSON.stringify(jsonLd), /eigene Equipe/i);
assert.match(JSON.stringify(jsonLd), /Bad, Küchen, Platten und Wellness/);

const css = readFileSync(path.join(root, 'src/pages/home/Home.module.css'), 'utf8');
const source = readFileSync(path.join(root, 'src/pages/home/Home.tsx'), 'utf8');
for (const [, name] of source.matchAll(/styles\.([A-Za-z][A-Za-z0-9]*)/g)) assert.ok(css.includes(`.${name}`), `CSS module defines ${name}`);
assert.match(css, /prefers-reduced-motion/);
assert.match(readFileSync(path.join(root, 'src/components/header/Header.css'), 'utf8'), /min-width: 1100px/);

const badplaner = readFileSync(path.join(root, 'src/pages/badplaner/Badplaner.tsx'), 'utf8');
assert.match(badplaner, /Welchen Raum möchten Sie gestalten\?/);
assert.match(badplaner, /Beratung \/ Besichtigung anfragen/);
assert.match(badplaner, /const PositionPanel/);
assert.match(badplaner, /availableAccentPlacements/);
assert.match(badplaner, /room === 'badezimmer' && <PositionPanel id="nassbereich"/);
const whatsapp = readFileSync(path.join(root, 'src/components/whatsapp/WhatsAppButton.tsx'), 'utf8');
assert.match(whatsapp, /Ihre Produkte und eine Beratung in Ihrer Ausstellung/);
assert.doesNotMatch(whatsapp, /interessiere mich für einen Badumbau/);

console.log('Static checks passed: four sales areas, category/reference anchors, 8 local images, product CTAs, room-aware Badplaner panels, generic WhatsApp, prices and SEO. Browser/layout QA remains separate.');
