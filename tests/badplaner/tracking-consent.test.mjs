/**
 * Einwilligung: Statistik und Marketing sind getrennt.
 *
 * Kernregel: Wer nur der Statistik zustimmt, bekommt ausschliesslich die
 * Messung (analytics_storage). Die drei Werbesignale von Google
 * (ad_storage, ad_user_data, ad_personalization) und der Meta Pixel haengen
 * am Marketing und bleiben dann gesperrt.
 *
 * Geprueft werden alle Kombinationen: keine Einwilligung, nur Statistik,
 * nur Marketing, beide, und der Widerruf ohne Neuladen der Seite.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.ok(process.env.BADPLANER_TEST_BUILD, 'BADPLANER_TEST_BUILD must point to the compiled test tree');
const build = process.env.BADPLANER_TEST_BUILD;

// tracking.ts holt Cookies aus react-cookie-consent. Der kompilierte Testbaum
// liegt ausserhalb des Repos und sieht dessen node_modules nicht, darum hier
// ein winziger Ersatz mit einem Cookie-Glas im Speicher.
const stubDirectory = resolve(build, 'node_modules/react-cookie-consent');
mkdirSync(stubDirectory, { recursive: true });
writeFileSync(
  resolve(stubDirectory, 'package.json'),
  JSON.stringify({ name: 'react-cookie-consent', type: 'module', main: 'index.js' }),
);
writeFileSync(
  resolve(stubDirectory, 'index.js'),
  [
    'const jar = new Map();',
    'globalThis.__cookieJar = jar;',
    'export const Cookies = {',
    '  get: (name) => jar.get(name),',
    '  set: (name, value) => jar.set(name, value),',
    '  remove: (name) => jar.delete(name),',
    '};',
    '',
  ].join('\n'),
);

const { business } = await import(pathToFileURL(resolve(build, 'src/config/business.js')));
const GA_ID = business.ga4MeasurementId;
const GTAG_SCRIPT = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
const PIXEL_SCRIPT = 'https://connect.facebook.net/en_US/fbevents.js';
const DENIED = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' };

let instances = 0;

/**
 * Frischer Seitenaufruf: leeres Cookie-Glas, leeres window/document und eine
 * eigene Instanz von tracking.js (das Modul merkt sich seinen Zustand).
 */
async function seitenaufruf(gespeicherteEinwilligung = null) {
  globalThis.__cookieJar?.clear();
  const scripts = [];
  globalThis.document = {
    createElement: () => ({}),
    head: { appendChild: (element) => scripts.push(element.src) },
  };
  globalThis.window = {
    location: { protocol: 'https:', hostname: 'newlivingdesign.ch', pathname: '/badplaner' },
  };
  const url = `${pathToFileURL(resolve(build, 'src/utils/tracking.js')).href}?i=${++instances}`;
  const tracking = await import(url);
  if (gespeicherteEinwilligung) {
    globalThis.__cookieJar.set('nldConsent', JSON.stringify(gespeicherteEinwilligung));
  }
  tracking.initTrackingFromConsent();
  return { tracking, scripts, window: globalThis.window };
}

/** Der Stand der vier Google-Signale, wie gtag.js ihn nach allen Befehlen sieht. */
function googleSignale(window) {
  const stand = {};
  for (const eintrag of window.dataLayer || []) {
    const argumente = Array.from(eintrag);
    if (argumente[0] !== 'consent') continue;
    const { wait_for_update: _ignoriert, ...signale } = argumente[2];
    Object.assign(stand, signale);
  }
  return stand;
}

/** Alle gtag-Befehle eines Typs, z. B. 'event' oder 'consent'. */
function gtagBefehle(window, typ) {
  return (window.dataLayer || []).map((eintrag) => Array.from(eintrag)).filter((argumente) => argumente[0] === typ);
}

/** Alles, was an den Meta Pixel ging (fbevents.js laedt im Test nie). */
function pixelBefehle(window) {
  return (window.fbq?.queue || []).map((argumente) => Array.from(argumente));
}

test('ohne Einwilligung ist alles gesperrt und nichts wird geladen', async () => {
  const { scripts, window } = await seitenaufruf(null);

  assert.deepEqual(googleSignale(window), DENIED);
  assert.equal(gtagBefehle(window, 'consent').length, 1, 'nur der Standard "denied", kein update');
  assert.deepEqual(scripts, [], 'weder gtag.js noch fbevents.js');
  assert.equal(window.fbq, undefined);
  assert.equal(window[`ga-disable-${GA_ID}`], undefined);
});

test('nur Statistik: Messung an, alle Werbesignale bleiben gesperrt', async () => {
  const { tracking, scripts, window } = await seitenaufruf({ analytics: true, marketing: false });

  assert.deepEqual(googleSignale(window), {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  });
  assert.deepEqual(scripts, [GTAG_SCRIPT], 'gtag.js ja, fbevents.js nein');
  assert.equal(window[`ga-disable-${GA_ID}`], false);
  assert.equal(window.fbq, undefined, 'der Meta Pixel haengt am Marketing, nicht an der Statistik');

  tracking.trackLead('form', 'badplaner');
  assert.equal(gtagBefehle(window, 'event').length, 1);
  assert.equal(window.fbq, undefined);
});

test('nur Marketing: Werbesignale an, keine Messung', async () => {
  const { tracking, scripts, window } = await seitenaufruf({ analytics: false, marketing: true });

  assert.deepEqual(googleSignale(window), {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'denied',
  });
  assert.deepEqual(scripts, [PIXEL_SCRIPT], 'fbevents.js ja, gtag.js nein');
  assert.equal(window[`ga-disable-${GA_ID}`], true);
  assert.deepEqual(pixelBefehle(window), [
    ['consent', 'grant'],
    ['init', business.metaPixelId],
    ['track', 'PageView'],
  ]);

  tracking.trackLead('form', 'badplaner');
  assert.equal(gtagBefehle(window, 'event').length, 0, 'ohne Statistik kein GA4-Ereignis');
  assert.deepEqual(pixelBefehle(window).at(-1), ['track', 'Lead', { content_name: 'badplaner', content_category: 'form' }]);
});

test('beides: alle vier Signale erteilt, beide Dienste geladen', async () => {
  const { tracking, scripts, window } = await seitenaufruf({ analytics: true, marketing: true });

  assert.deepEqual(googleSignale(window), {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
  });
  assert.deepEqual(scripts.sort(), [PIXEL_SCRIPT, GTAG_SCRIPT].sort());
  assert.equal(window[`ga-disable-${GA_ID}`], false);

  tracking.trackLead('form', 'badplaner');
  assert.equal(gtagBefehle(window, 'event').length, 1);
  assert.deepEqual(pixelBefehle(window).at(-1)[1], 'Lead');
});

test('Widerruf ohne Neuladen: alle Signale zurueck auf denied, nichts wird mehr gemeldet', async () => {
  const { tracking, scripts, window } = await seitenaufruf({ analytics: true, marketing: true });
  const scriptsVorher = scripts.length;
  const ereignisseVorher = gtagBefehle(window, 'event').length;

  tracking.saveConsent({ analytics: false, marketing: false });

  assert.deepEqual(googleSignale(window), DENIED);
  assert.equal(window[`ga-disable-${GA_ID}`], true);
  assert.deepEqual(pixelBefehle(window).at(-1), ['consent', 'revoke']);
  assert.equal(scripts.length, scriptsVorher, 'kein Neuladen der Seite und keine neuen Scripts');
  assert.equal(globalThis.__cookieJar.get('newLivingDesignCookieConsent'), 'false');

  const pixelVorher = pixelBefehle(window).length;
  tracking.trackLead('form', 'badplaner');
  tracking.trackBadplaner('badplaner_start');
  tracking.trackPageView('/badplaner');
  assert.equal(gtagBefehle(window, 'event').length, ereignisseVorher, 'GA4 meldet nach dem Widerruf nichts mehr');
  assert.equal(pixelBefehle(window).length, pixelVorher, 'der Pixel sammelt nach dem Widerruf nichts mehr');
});

test('Widerruf nur des Marketings laesst die Statistik laufen', async () => {
  const { tracking, window } = await seitenaufruf({ analytics: true, marketing: true });

  tracking.saveConsent({ analytics: true, marketing: false });

  assert.deepEqual(googleSignale(window), {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  });
  assert.deepEqual(pixelBefehle(window).at(-1), ['consent', 'revoke']);
  assert.equal(window[`ga-disable-${GA_ID}`], false);
});

test('spaeteres Ja zum Marketing wirkt sofort, ohne Neuladen und ohne zweites init', async () => {
  const { tracking, scripts, window } = await seitenaufruf({ analytics: true, marketing: false });

  tracking.saveConsent({ analytics: true, marketing: true });

  assert.deepEqual(googleSignale(window), {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
  });
  assert.deepEqual(scripts.sort(), [PIXEL_SCRIPT, GTAG_SCRIPT].sort());
  assert.equal(scripts.filter((src) => src === GTAG_SCRIPT).length, 1, 'gtag.js nur einmal');

  tracking.saveConsent({ analytics: true, marketing: false });
  tracking.saveConsent({ analytics: true, marketing: true });
  assert.equal(pixelBefehle(window).filter((argumente) => argumente[0] === 'init').length, 1, 'init nur einmal');
  assert.deepEqual(pixelBefehle(window).at(-1), ['consent', 'grant']);
});
