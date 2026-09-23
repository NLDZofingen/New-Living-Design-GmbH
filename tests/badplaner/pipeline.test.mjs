import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// No test can accidentally reach a real provider, even through the default export.
globalThis.fetch = async () => { throw new Error('External network is forbidden in tests'); };
const moduleUrl = (name) => pathToFileURL(path.join(process.env.BADPLANER_TEST_BUILD, name));
const { createHandler, nearestAspectRatio } = await import(moduleUrl('api/badplaner.js'));
const { optionsForPackage } = await import(moduleUrl('src/data/badplaner.js'));
const { Budget, TimeoutError } = await import(moduleUrl('server/badplaner/budget.js'));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1EAAAAASUVORK5CYII=';

function payload(changes = {}) {
  const options = optionsForPackage('essenza');
  return {
    kind: 'render', raum: 'badezimmer', paket: 'essenza', format: options.formats[0],
    platte: options.tiles[0].id, unterbau: options.bases[0].id, top: options.tops[0].id,
    becken: options.basinTypes[0].id, finish: '', keramik: options.sanitary[0].id,
    wall: options.walls[0].id, dusche: options.showers[0].id, badewanne: options.bathtubs[0].id, waschtisch: options.basins[0].id,
    spiegel: options.mirrors[0].id, windows: '0', cistern: 'unterputz', foto: `data:image/png;base64,${PNG}`,
    name: 'Fixture Person', email: 'fixture@example.invalid', telefon: '+41 00 000 00 00', place: '4800 Zofingen', consent: true,
    ...changes,
  };
}

function fakeClock() {
  let time = Date.parse('2026-09-13T12:00:00Z');
  let sequence = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { at: time + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const target = time + ms;
      for (;;) {
        const first = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!first) break;
        timers.delete(first[0]); time = first[1].at; first[1].callback();
      }
      time = target;
    },
    timers,
  };
}

const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const generated = (data = PNG, mimeType = 'image/png') => response({ candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] }, finishReason: 'STOP' }] });
const photoChecked = (isBathroom = true, text) => response({ candidates: [{ content: { parts: [{ text: text ?? JSON.stringify({ is_bathroom: isBathroom, reason: 'toilet and washbasin visible' }) }] }, finishReason: 'STOP' }] });
const inv = (changes = {}) => ({ toilet: 'left', washbasin: 'left', shower: 'none', bathtub: 'none', bidet: 'none', ...changes });
// Die Pruefung liefert ein Inventar; geurteilt wird im Code. `checked()` ist der
// unauffaellige Fall: alles steht nachher, wo es vorher stand.
// Die sichtbare Reihenfolge von links nach rechts folgt dem Inventar, solange
// ein Test nichts anderes sagt.
const order = (state) => ['washbasin', 'toilet', 'bidet', 'shower', 'bathtub'].filter((key) => state[key] !== 'none');
const checked = (extra = false, text) => response({ candidates: [{ content: { parts: [{ text: text ?? JSON.stringify({ before: inv(), after: inv(), order_before: order(inv()), order_after: order(inv()), nearest_before: 'toilet', nearest_after: 'toilet', toilet_on_low_wall_before: false, toilet_on_low_wall_after: false, new_wall_element: false, wall_element_lost: false, point_drain: false, foreground_object_before: false, foreground_object_after: false, window_much_bigger: false, extra_openings: extra, view_changed: false, reason: 'inventory' }) }] }, finishReason: 'STOP' }] });
const checkedInv = (before, after, extra = {}) => response({ candidates: [{ content: { parts: [{ text: JSON.stringify({ before: inv(before), after: inv(after), order_before: order(inv(before)), order_after: order(inv(after)), nearest_before: 'toilet', nearest_after: 'toilet', toilet_on_low_wall_before: false, toilet_on_low_wall_after: false, new_wall_element: false, wall_element_lost: false, point_drain: false, foreground_object_before: false, foreground_object_after: false, window_much_bigger: false, extra_openings: false, view_changed: false, reason: 'inventory', ...extra }) }] }, finishReason: 'STOP' }] });

function harness(settings = {}) {
  const clock = fakeClock();
  const calls = [];
  let generation = 0; let checks = 0; let photoChecks = 0; let mail = 0; let ids = 0;
  const fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, init, body });
    assert.equal(init.redirect, 'error', 'provider redirects must not bypass URL policy');
    assert.ok(init.signal instanceof AbortSignal);
    if (url.includes('generativelanguage.googleapis.com')) {
      if (body.generationConfig.responseModalities) {
        generation += 1;
        clock.advance(settings.generateDelays?.[generation - 1] ?? 0);
        return settings.generations?.[generation - 1]?.(init) ?? generated();
      }
      if ((body.contents?.[0]?.parts || []).filter((part) => part.inlineData).length === 1) {
        photoChecks += 1;
        clock.advance(settings.photoCheckDelays?.[photoChecks - 1] ?? 0);
        return settings.photoChecks?.[photoChecks - 1]?.(init) ?? photoChecked();
      }
      checks += 1;
      clock.advance(settings.checkDelays?.[checks - 1] ?? 0);
      return settings.checks?.[checks - 1]?.(init) ?? checked();
    }
    if (url === 'https://api.resend.com/emails') {
      mail += 1;
      clock.advance(settings.mailDelays?.[mail - 1] ?? 0);
      return settings.mails?.[mail - 1]?.(init) ?? response({ id: `mail-${mail}` });
    }
    if (url.startsWith('https://formspree.io/')) {
      clock.advance(settings.formspreeDelay ?? 0);
      return settings.formspree?.(init) ?? response({ ok: true });
    }
    if (url.includes('/audiences/')) return settings.newsletter?.(init) ?? response({ id: 'contact-fixture' });
    // Muster: unsere Kopie oder das Original beim Lieferanten (Platte, Waschtischplatte, Unterbau).
    if (url.startsWith('https://newlivingdesign.ch/badplaner/swatches/') || /^https:\/\/(www\.)?(energieker\.it|gbgroupe\.com|edonedesign\.it|rexadesign\.it)\//.test(url)) {
      clock.advance(settings.swatchDelay ?? 0);
      return settings.swatch?.(init) ?? response({}, 404);
    }
    throw new Error(`Unexpected mock URL: ${url}`);
  };
  const handler = createHandler({ fetch, clock, sleep: async (milliseconds) => { clock.advance(milliseconds); }, env: { GEMINI_API_KEY: 'fake-not-a-key', RESEND_API_KEY: 'fake-not-a-key', ...settings.env }, newId: () => `bp-fixture-${++ids}` });
  async function invoke(body = payload(), request = {}) {
    const res = { headers: {}, statusCode: 200, body: null,
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler({ method: 'POST', headers: {}, body, ...request }, res);
    assert.equal(clock.timers.size, 0, 'all timeout handles must be cleared');
    return res;
  }
  return { invoke, clock, calls, counts: () => ({ generation, checks, mail }), photoCount: () => photoChecks };
}

test('approved rendering reaches company and customer, reporting provider acceptance', async () => {
  const h = harness(); const res = await h.invoke();
  assert.equal(res.statusCode, 200); assert.equal(res.body.ok, true);
  assert.equal(res.body.image.data, PNG); assert.equal(res.body.delivery.lead, 'accepted');
  assert.equal(res.body.delivery.customer, 'accepted'); assert.equal(res.body.delivery.newsletter, 'skipped');
  assert.deepEqual(h.counts(), { generation: 1, checks: 1, mail: 2 });
  assert.match(res.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal('lead_saved' in res.body, false);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /Muster/);
  assert.match(JSON.stringify(leadMail.body), /nicht geladen/);
});

test('cistern is required and only accepts the two supported values', async () => {
  for (const cistern of [undefined, '', 'sichtbar', 'unknown']) {
    const h = harness(); const res = await h.invoke(payload({ cistern }));
    assert.equal(res.statusCode, 400); assert.equal(res.body.field, 'cistern');
    assert.deepEqual(h.counts(), { generation: 0, checks: 0, mail: 0 });
  }
});

test('Aufputz and Unterputz produce explicit, exclusive toilet branches', async () => {
  for (const cistern of ['aufputz', 'unterputz']) {
    const h = harness(); const res = await h.invoke(payload({ cistern }));
    assert.equal(res.statusCode, 200);
    const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
    const prompt = generation.body.contents[0].parts[0].text;
    const checker = h.calls.find((call) => call.url.includes('generativelanguage.googleapis.com') && !call.body?.generationConfig?.responseModalities
      && call.body.contents[0].parts.filter((part) => part.inlineData).length === 2);
    const checkPrompt = checker.body.contents[0].parts[0].text;
    if (cistern === 'aufputz') {
      assert.match(prompt, /is completely removed and must not survive in any form/);
      assert.match(prompt, /exactly the sanitary module of image \d, copied part for part/);
      assert.match(prompt, /clearly more than twice as tall as it is wide/);
      assert.match(prompt, /flush button on the glass front near the top, never on the top surface/);
      assert.match(prompt, /the toilet is wall-hung, rimless, in .*hanging on the front of that module/);
      // Ein Holzsitz auf weisser Keramik war einer der Befunde vom 16.09.
      assert.match(prompt, /its seat and lid are in the very same .*never wood, never a contrasting colour/);
      assert.match(prompt, /wall behind is neither moved nor opened/);
      // Das Modul steht an der Wand dahinter: die Pruefung darf es nicht als eigene Wand lesen.
      assert.match(checkPrompt, /a pre-wall or a sanitary module directly behind the toilet belongs to the wall it stands in front of/);
      assert.match(checkPrompt, /a flat glass sanitary module behind the toilet and the line where tiles end on a flat wall are not wall elements/);
    } else {
      assert.match(prompt, /the cistern stays hidden exactly where it already is/);
      assert.match(prompt, /no new free-standing module is added/);
      // Diegos Befund vom 17.09.: das WC haengt an einem Muretto, das die Spuelkasten
      // traegt. Das Modell hat es eingeebnet und das WC an die Wand dahinter geschoben.
      assert.match(prompt, /that low wall is part of the room and stays: same place, same length, same height, same depth, only newly tiled/);
      assert.match(prompt, /do not push the toilet back against the wall behind it/);
      // 19.09.: "often has a shelf on top" hat bei einer flachen Wand ein Muretto mit Ablage erzeugt.
      assert.doesNotMatch(prompt, /shelf on top/);
      assert.match(prompt, /that wall stays one flat, full-height wall, only newly tiled: nothing is built in front of it/);
    }
  }
});

test('Colore uses the selected tap series and finish in prompt and lead mail', async () => {
  const options = optionsForPackage('colore');
  const h = harness();
  const res = await h.invoke(payload({
    paket: 'colore', format: options.formats[0], platte: options.tiles[0].id,
    unterbau: options.bases[0].id, top: options.tops[0].id, becken: options.basinTypes[0].id,
    armaturenserie: 'treemme-ran', finish: 'treemme-nero-opaco', keramik: options.sanitary[0].id,
    wall: options.walls[0].id, dusche: options.showers[0].id, badewanne: options.bathtubs[0].id,
    waschtisch: options.basins[0].id, spiegel: options.mirrors[0].id,
  }));
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  assert.match(generation.body.contents[0].parts[0].text, /Treemme Ran fittings in matte black, flat and square-edged: at the washbasin .*flat blade-shaped spout/);
  const lead = JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails')?.body);
  assert.match(lead, /Treemme Ran, Nero Opaco/);
  assert.doesNotMatch(lead, /Armaturenserie/);
});

test('Gäste-WC prompt and checker require no shower or bathtub', async () => {
  const h = harness();
  const res = await h.invoke(payload({ raum: 'gaeste-wc', dusche: '', badewanne: '', waschtisch: 'einzel' }));
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  const checker = h.calls.find((call) => call.body?.generationConfig?.responseMimeType
    && call.body.contents[0].parts.filter((part) => part.inlineData).length === 2);
  assert.match(generation.body.contents[0].parts[0].text, /guest WC: the result must contain NO shower/);
  assert.match(checker.body.contents[0].parts[0].text, /name the wall each sanitary fixture stands against/);
});

test('shower prompt tiles the full tray or sloped-floor perimeter to the ceiling', async () => {
  const h = harness({ checks: [() => checkedInv({}, { shower: 'back' })] });
  const res = await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine', wall: 'halbhoch' }));
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  assert.match(generation.body.contents[0].parts[0].text, /entire perimeter of the shower tray or sloped tiled shower floor/);
  assert.match(generation.body.contents[0].parts[0].text, /every wall around the entire shower-floor perimeter is tiled continuously to the ceiling/);
});

test('ein Foto ohne Bad wird gar nicht erst gerendert', async () => {
  // Michaels Probe vom 16.09: Foto einer Veranda mit Sofa. Frueher lief daraus
  // zweimal die Bildgenerierung, und der Kunde bekam nur "Kontrolle nicht bestanden".
  const h = harness({ photoChecks: [() => photoChecked(false)] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 'PHOTO_NOT_A_BATHROOM');
  assert.equal(h.counts().generation, 0, 'ein falsches Foto darf kein Bild kosten');
  assert.equal(h.counts().checks, 0);
  assert.match(res.body.error, /kein Bad und kein WC/);
  assert.equal(res.body.delivery.lead, 'accepted');
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(leadMail.body.subject, /Foto zeigt kein Bad/);
  assert.deepEqual(leadMail.body.attachments.map(({ filename }) => filename), ['foto.png']);
  assert.equal(h.counts().mail, 1, 'der Kunde bekommt keine Bildmail');
});

test('ein falsches Foto kostet den Kunden keinen Tagesversuch', async () => {
  const h = harness({ photoChecks: [() => photoChecked(false)] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 422);
  assert.equal(res.headers['Set-Cookie'], undefined);
});

test('die Fotopruefung bekommt nur das Kundenfoto, nicht Muster oder Modul', async () => {
  const h = harness();
  await h.invoke(payload({ spuelkasten: 'aufputz' }));
  const first = h.calls.find((call) => call.url.includes('generativelanguage.googleapis.com'));
  const parts = first.body.contents[0].parts;
  assert.equal(parts.filter((part) => part.inlineData).length, 1);
  assert.match(parts[0].text, /is_bathroom/);
});

test('eine unlesbare Fotopruefung haelt den Badplaner nicht auf', async () => {
  // Im Zweifel durchlassen: ein ausgeraeumtes Bad darf nicht abgewiesen werden.
  const h = harness({ photoChecks: [() => photoChecked(true, 'kein JSON'), () => photoChecked(true, '{}')] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(h.counts().generation, 1);
});

test('faellt die Fotopruefung aus, wird trotzdem gerendert', async () => {
  const h = harness({ photoChecks: [() => response({ error: 'quota' }, 429)] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(h.counts().generation, 1);
});

test('das Bidet wird weggeraeumt, und ein stehengebliebenes Bidet wird verworfen', async () => {
  // Probe vom 17.09: im Ideenbild stand das Bidet noch da. Im Fixpreis gibt es keins.
  const h = harness();
  await h.invoke();
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(prompt, /If image 1 shows a bidet, it is gone/);
  assert.match(prompt, /nothing standing in its place/);

  const left = () => checkedInv({ bidet: 'right' }, { bidet: 'right' });
  const second = harness({ checks: [left, left] });
  const res = await second.invoke();
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'RENDER_REJECTED');
  const leadMail = second.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /the bidet is still there, on the right wall/);
});

test('nach einem schnellen ersten Durchgang bleibt Zeit fuer den zweiten', async () => {
  // Mit gemini-3-pro-image dauert ein Durchgang 33 bis 90 s und die Pruefung
  // liest ein 2K-Bild. Seit dem 220-s-Budget passen zwei volle Durchgaenge auch
  // nach einem langsamen ersten; nur wenn die Schranke doch nicht reicht, bekommt
  // der Kunde die ehrliche Absage, und der Lead ist trotzdem bei uns.
  const h = harness({ generateDelays: [25000, 25000], checkDelays: [8000, 8000], checks: [() => checked(true), () => checked(false)] });
  const res = await h.invoke();
  assert.equal(h.counts().generation, 2, 'der zweite Versuch muss laufen');
  assert.equal(res.statusCode, 200);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /1\. Versuch verworfen \(an opening was added or lost.*2\. Versuch ok/);
});

test('der Prompt ist eine Bearbeitung, keine Neuzeichnung', async () => {
  const h = harness();
  await h.invoke();
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  // 19.09.: aus Diegos engem Bad wurde ein Ausstellungsbad mit anderer Kamera und
  // einem Fenster. Zuerst steht, was das Ergebnis ist, zuletzt der Abgleich.
  assert.match(prompt, /^PHOTO EDITING TASK, not a design task\. Image 1 is a photograph of the customer's existing bathroom\. The result is that same photograph after the renovation/);
  assert.match(prompt, /BEFORE YOU DRAW, compare with image 1: the same viewpoint and framing, the same walls and ceiling, no window at all, the same door, every fixture where image 1 has it/);
  assert.match(prompt, /never show more of the room than image 1 shows\.$/);
  assert.match(prompt, /This is an edit of image 1, not a new picture/);
  assert.match(prompt, /KEEP THE POSITIONS/);
  assert.match(prompt, /its place along it, measured against the corners, the door and the window/);
  // Ein Muretto ist Raum, keine Einrichtung: es bleibt stehen.
  assert.match(prompt, /A half-height wall, a low built wall or a boxed pre-wall that a fixture stands against is part of the room, not furniture/);
  // Die Duscharmatur stand ueber dem WC statt in der Dusche.
  assert.match(prompt, /Every shower fitting[^.]*sits inside the shower area, all together on one and the same wall of the shower[^.]*never split over two walls and never on a wall next to the toilet or the washbasin/);
});

test('das Glas der alten Duschkabine ist im Prompt kein Fenster', async () => {
  // Diegos Foto vom 19.09.: rechts die alte Kabine mit satiniertem Glas, kein Fenster im Bad.
  // Produktion 12:09 (beide Versuche) und 12:24 (erster Versuch): "a window on the right wall".
  const h = harness();
  await h.invoke();
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(prompt, /every wall stays a solid wall\. The glass of an old shower enclosure, a shower door or any frosted or misted pane in image 1 is not a window: behind it stands a solid wall of the room/);
});

test('der Grundriss aus der Vorpruefung steht im Prompt, was wo steht', async () => {
  // Diegos Foto vom 19.09.: WC und Waschbecken an der Rueckwand, Dusche rechts.
  // Allgemeine Regeln reichten nicht; das Bildmodell bekommt jetzt seinen Grundriss genannt.
  const seen = { is_bathroom: true, reason: 'toilet, washbasin and shower cabin', walls: { toilet: 'back', washbasin: 'back', shower: 'right', bathtub: 'none', bidet: 'none' }, order: ['washbasin', 'toilet', 'shower'], nearest: 'washbasin' };
  const h = harness({ photoChecks: [() => photoChecked(true, JSON.stringify(seen))] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  const photoCheck = h.calls.find((call) => call.url.includes('generativelanguage.googleapis.com')).body.contents[0].parts[0].text;
  assert.match(photoCheck, /name the wall each sanitary fixture stands against/);
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(prompt, /WHAT IMAGE 1 SHOWS, seen from the camera: the toilet on the back wall facing the camera, the washbasin on the back wall facing the camera, the shower on the right wall; from left to right: washbasin, toilet, shower; closest to the camera: the washbasin\./);
  assert.match(prompt, /nothing else moves\.\nThis is an edit of image 1/);
});

test('ohne lesbaren Grundriss wird ohne ihn gerendert, nicht abgewiesen', async () => {
  const h = harness({ photoChecks: [() => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: { toilet: 'somewhere' }, order: 'toilet', nearest: 'toilet' }))] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.doesNotMatch(prompt, /WHAT IMAGE 1 SHOWS/);
  assert.equal(h.counts().generation, 1);
});

test('der zweite Versuch bekommt die Zeit, die der erste wirklich brauchte', async () => {
  // Logs vom 19.09., 10:39: Muster 0.7 s, Fotopruefung 2.4 s, Bild rund 27 s,
  // Pruefung rund 10 s. Der zweite Versuch startete mit 65 s Rest, bekam fuer das
  // Bild aber nur 25 s (Rest minus Hoechstwerte) und brach ab: Bild bezahlt, nichts geliefert.
  const h = harness({ swatchDelay: 700, photoCheckDelays: [2400], generateDelays: [27000, 27000], checkDelays: [10000, 10000],
    checks: [() => checked(true), () => checked(false)] });
  const start = h.clock.now();
  const res = await h.invoke();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(h.counts(), { generation: 2, checks: 2, mail: 2 });
  assert.ok(h.clock.now() - start < 110000);
});

test('Muster und Fotopruefung warten nebeneinander, nicht nacheinander', async () => {
  // Beide sind Wartezeiten auf fremde Server: das Muster darf die Fotopruefung nicht aufhalten.
  let photoCheckStarted;
  const started = new Promise((resolve) => { photoCheckStarted = resolve; });
  let overlapped = false;
  const h = harness({
    swatch: async () => {
      overlapped = await Promise.race([started.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 300))]);
      return response({}, 404);
    },
    photoChecks: [() => { photoCheckStarted(); return photoChecked(); }],
  });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(overlapped, true, 'die Fotopruefung muss starten, waehrend das Muster noch laedt');
});

test('die Dusche muss an die Wand, an der die Wanne stand', async () => {
  const wrong = () => checkedInv({ bathtub: 'right' }, { shower: 'left' });
  const h = harness({ checks: [wrong, wrong] });
  const res = await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(res.statusCode, 502);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /the bathtub it replaces stood on the right wall/);
});

test('eine fehlende Dusche und ein verschobenes Waschbecken werden verworfen', async () => {
  const missing = () => checkedInv({ bathtub: 'none' }, { shower: 'none' });
  const first = harness({ checks: [missing, missing] });
  const a = await first.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(a.statusCode, 502);
  assert.match(JSON.stringify(first.calls.find((c) => c.url === 'https://api.resend.com/emails').body), /requested shower is missing/);

  const shifted = () => checkedInv({ washbasin: 'left' }, { washbasin: 'back' });
  const second = harness({ checks: [shifted, shifted] });
  const bResult = await second.invoke();
  assert.equal(bResult.statusCode, 502);
  assert.match(JSON.stringify(second.calls.find((c) => c.url === 'https://api.resend.com/emails').body), /washbasin moved from the left wall to the back wall/);
});

test('eine unbrauchbare Antwort der Pruefung gilt als nicht verfuegbar, nicht als bestanden', async () => {
  for (const text of ['kein JSON', JSON.stringify({ before: { toilet: 'links' }, after: {} }), JSON.stringify({ before: {}, after: {}, extra_openings: false, view_changed: false, reason: 'x' })]) {
    const h = harness({ checks: [() => checked(false, text), () => checked(false, text)] });
    const res = await h.invoke();
    assert.equal(res.statusCode, 200, 'nicht lesbar heisst ausgeliefert, aber in der Lead-Mail vermerkt');
    const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
    assert.match(JSON.stringify(leadMail.body), /nicht m\u00f6glich/);
  }
});

test('das Ideenbild entsteht mit dem genauesten Modell, nicht dem billigsten', async () => {
  // Qualitaet vor Ersparnis: das Bild ist das Produkt. 2K kostet bei diesem
  // Modell gleich viel wie 1K.
  const h = harness();
  await h.invoke();
  const gen = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  assert.match(gen.url, /models\/gemini-3-pro-image:generateContent/);
  assert.equal(gen.body.generationConfig.imageConfig.imageSize, '2K');

  // Umschaltbar ohne Codeaenderung, falls ein neueres Modell kommt.
  const other = harness({ env: { BADPLANER_MODEL: 'gemini-3.1-flash-image' } });
  await other.invoke();
  assert.match(other.calls.find((call) => call.body?.generationConfig?.responseModalities).url, /gemini-3\.1-flash-image/);
});

test('ein 2K-Ideenbild passt durch alle Groessengrenzen', async () => {
  // Der erste Lauf mit gemini-3-pro-image scheiterte nach 25 s: drei Grenzen
  // waren auf 1K zugeschnitten und haben das fertige Bild weggeworfen.
  const { deflateSync } = await import('node:zlib');
  const crcTable = Array.from({ length: 256 }, (unused, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const head = Buffer.alloc(4); head.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(body)); return Buffer.concat([head, body, tail]); };
  const width = 1536; const height = 2048;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc(height * (width + 1));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');

  const h = harness({ generations: [() => generated(png)] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200, 'ein 2K-Bild darf nicht an unseren eigenen Grenzen scheitern');
  assert.equal(res.body.image.data, png);
});

test('scheitert der Bilddienst, steht der technische Grund in der Lead-Mail', async () => {
  const h = harness({ generations: [() => response({ error: { message: 'image size 2K is not supported' } }, 400)] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 502);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /HTTP 400: image size 2K is not supported/);
  // Der Kunde liest davon nichts.
  assert.doesNotMatch(res.body.error, /HTTP 400/);
});

test('WC und Dusche duerfen an derselben Wand nicht die Plaetze tauschen', async () => {
  // Probe vom 17.09.: im Foto steht die Dusche in der Ecke bei der Tuer und das
  // WC weiter hinten, im Ideenbild umgekehrt. Beide an der rechten Wand, also
  // hat die Wandpruefung allein nichts gemerkt.
  const swapped = () => response({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    before: inv({ shower: 'right', toilet: 'right' }), after: inv({ shower: 'right', toilet: 'right' }),
    order_before: ['washbasin', 'shower', 'toilet'], order_after: ['washbasin', 'toilet', 'shower'],
    nearest_before: 'toilet', nearest_after: 'toilet',
    toilet_on_low_wall_before: false, toilet_on_low_wall_after: false, new_wall_element: false, wall_element_lost: false, point_drain: false,
    foreground_object_before: false, foreground_object_after: false, window_much_bigger: false,
    extra_openings: false, view_changed: false, reason: 'inventory',
  }) }] }, finishReason: 'STOP' }] });
  const h = harness({ checks: [swapped, swapped] });
  const res = await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'RENDER_REJECTED');
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /the fixtures changed places/);
});

test('ein weggeraeumtes Stueck aendert die Reihenfolge nicht', async () => {
  // Das Bidet verschwindet immer. Das darf die Reihenfolgepruefung nicht ausloesen.
  const h = harness({ checks: [() => response({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    before: inv({ bidet: 'right', toilet: 'right' }), after: inv({ toilet: 'right' }),
    order_before: ['washbasin', 'toilet', 'bidet'], order_after: ['washbasin', 'toilet'],
    nearest_before: 'bidet', nearest_after: 'toilet',
    toilet_on_low_wall_before: false, toilet_on_low_wall_after: false, new_wall_element: false, wall_element_lost: false, point_drain: false,
    foreground_object_before: false, foreground_object_after: false, window_much_bigger: false,
    extra_openings: false, view_changed: false, reason: 'inventory',
  }) }] }, finishReason: 'STOP' }] })] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
});

test('das WC darf an seiner Wand nicht nach hinten rutschen', async () => {
  // Probe vom 17.09., zweimal am selben Foto: im Foto steht das WC vorne bei der
  // Tuer, im Ideenbild weiter hinten. Gleiche Wand, gleiche Reihenfolge, also
  // hat weder die Wand- noch die Reihenfolgepruefung etwas gemerkt.
  const shifted = () => response({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    before: inv({ toilet: 'right', shower: 'back' }), after: inv({ toilet: 'right', shower: 'back' }),
    order_before: ['washbasin', 'shower', 'toilet'], order_after: ['washbasin', 'shower', 'toilet'],
    nearest_before: 'toilet', nearest_after: 'washbasin',
    toilet_on_low_wall_before: false, toilet_on_low_wall_after: false, new_wall_element: false, wall_element_lost: false, point_drain: false,
    foreground_object_before: false, foreground_object_after: false, window_much_bigger: false,
    extra_openings: false, view_changed: false, reason: 'inventory',
  }) }] }, finishReason: 'STOP' }] });
  const h = harness({ checks: [shifted, shifted] });
  const res = await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(res.statusCode, 502);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /in the photo the toilet is closest to the camera, in the result the washbasin/);
});

test('ein verschwundenes Muretto unter dem WC wird verworfen', async () => {
  // Diegos Befund vom 17.09.: das WC haengt rechts neben der Tuer an einem niedrigen
  // Mauerstueck, das die Spuelkasten traegt. Das Modell hat das Mauerstueck eingeebnet
  // und das WC an die Wand dahinter geschoben. Wand, Reihenfolge und Tiefe bleiben
  // dabei gleich, also merkt es keine der anderen Pruefungen.
  const flattened = () => checkedInv({ toilet: 'right' }, { toilet: 'right' },
    { toilet_on_low_wall_before: true, toilet_on_low_wall_after: false });
  const h = harness({ checks: [flattened, flattened] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'RENDER_REJECTED');
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /the low wall the toilet stood against is gone/);
});

test('der zweite Versuch bekommt die ganze Liste noch einmal mit', async () => {
  // Diegos Gaeste-WC vom 17.09.: erster Versuch verworfen, zweiter ok, aber ohne
  // Waschtischunterbau. Der Nachbesserungssatz nannte nur Grundriss, Oeffnungen und WC.
  const h = harness({ checks: [() => checkedInv({ toilet: 'left' }, { toilet: 'right' }), () => checked()],
    generateDelays: [1000, 1000], checkDelays: [1000, 1000] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  const generations = h.calls.filter((call) => call.body?.generationConfig?.responseModalities);
  assert.equal(generations.length, 2);
  const retryPrompt = generations[1].body.contents[0].parts[0].text;
  assert.match(retryPrompt, /the washbasin on its own vanity unit with the mirror above it/);
  assert.match(retryPrompt, /everything in the foreground at the edge of the picture/);
});

test('eine verschwundene Tuer im Vordergrund wird verworfen', async () => {
  // Probe vom 17.09.: im Foto steht links vorne der offene Tuerfluegel und nimmt ein
  // Viertel des Bildes ein. Im Ideenbild ist er weg, das Modell hat die Kamera gedreht.
  // Waende, Reihenfolge, Tiefe und Muretto blieben dabei gleich.
  const turned = () => checkedInv({}, {}, { foreground_object_before: true, foreground_object_after: false });
  const h = harness({ checks: [turned, turned] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'RENDER_REJECTED');
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /what stood in the foreground of the photo, at the edge of the picture, is gone/);
});

test('ein Fenster, das viel groesser wird, wird verworfen', async () => {
  // Dasselbe Bild von aussen gemessen: das Fenster nimmt im Ideenbild viel mehr Platz
  // ein als im Foto, die Kamera ist also naeher herangegangen.
  const zoomed = () => checkedInv({}, {}, { window_much_bigger: true });
  const h = harness({ checks: [zoomed, zoomed] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 502);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /the window takes up much more of the result than of the photo/);
});

test('die Pruefung fragt nach dem Vordergrund, der ganz verschwindet, nicht nach dem, der kleiner wird', async () => {
  // Preview der PR #42, 19.09. 12:53: Waende, Reihenfolge und Tiefe stimmten, die Tuer links
  // war nur noch ein schmaler Streifen, und beide Versuche wurden dafuer verworfen.
  const h = harness();
  await h.invoke();
  const question = h.calls.filter((call) => call.url.includes('generativelanguage.googleapis.com'))
    .map((call) => call.body.contents[0].parts[0].text).find((text) => text.includes('foreground_object_after'));
  assert.match(question, /still visible at the edge of image 2 at any size, even as a narrow strip/);
  assert.match(question, /foreground_object_after is false only when it is gone completely/);
});

test('ein Vordergrund, der im Foto gar nicht da war, ist kein Fehler', async () => {
  // Nur das Verschwinden zaehlt. Taucht vorne etwas auf, wo im Foto nichts war,
  // ist das kein Grund, dem Kunden nichts zu zeigen.
  const h = harness({ checks: [() => checkedInv({}, {}, { foreground_object_before: false, foreground_object_after: true })] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
});

test('der Prompt haelt den Vordergrund und den Waschtischunterbau fest', async () => {
  const h = harness();
  await h.invoke();
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  // Der Tuerfluegel im Vordergrund gehoert zum Bild.
  assert.match(prompt, /Whatever stands in the immediate foreground at the edge of image 1 belongs to the picture and stays/);
  assert.match(prompt, /Every window keeps the same share of the picture it has in image 1/);
  // "Loose furniture is gone" hat im Gaeste-WC den Waschtischunterbau mitgenommen.
  assert.match(prompt, /the washbasin's own vanity unit is not loose furniture and is always there/);
  assert.doesNotMatch(prompt, /Loose furniture, clutter/);
});

test('ein erhaltenes Muretto ist kein Fehler', async () => {
  const h = harness({ checks: [() => checkedInv({ toilet: 'right' }, { toilet: 'right' },
    { toilet_on_low_wall_before: true, toilet_on_low_wall_after: true })] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
});

test('ein neues Muretto, eine Ablage oder eine Nische wird verworfen', async () => {
  // Diegos Test vom 19.09.: flache, raumhoch geplattete Wand, Spuelplatte buendig, im
  // Ideenbild ein halbhohes Muretto mit Ablage hinter Waschtisch, WC und Dusche.
  for (const flags of [
    { new_wall_element: true },
    { toilet_on_low_wall_before: false, toilet_on_low_wall_after: true },
  ]) {
    const added = () => checkedInv({ toilet: 'right' }, { toilet: 'right' }, flags);
    const h = harness({ checks: [added, added] });
    const res = await h.invoke();
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.code, 'RENDER_REJECTED');
    const retry = h.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text;
    assert.match(retry, /a low wall, ledge, shelf or niche that is not in the photo was added/);
  }
  const prompt = harness();
  await prompt.invoke();
  const text = prompt.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(text, /NO NEW WALLS: never add a wall, a partition, a half-height wall, a boxed pre-wall, a ledge, a shelf or a niche that image 1 does not show/);
  assert.match(text, /no ledge, no shelf, no capping and no step/);
});

test('das Glasmodul beim Aufputz-Spuelkasten ist kein neues Muretto', async () => {
  const h = harness({ checks: [() => checkedInv({ toilet: 'right' }, { toilet: 'right' },
    { toilet_on_low_wall_before: false, toilet_on_low_wall_after: true })] });
  const res = await h.invoke(payload({ cistern: 'aufputz' }));
  assert.equal(res.statusCode, 200);
});

test('fixture checker rejects a shower in a Gäste-WC', async () => {
  const h = harness({ checks: [() => checkedInv({}, { shower: 'right' }), () => checkedInv({}, { shower: 'right' })] });
  const res = await h.invoke(payload({ raum: 'gaeste-wc', dusche: '', badewanne: '', waschtisch: 'einzel' }));
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'RENDER_REJECTED');
  assert.equal(res.body.delivery.lead, 'accepted');
  assert.equal(h.counts().mail, 1);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(leadMail.body.subject, /Ideenbild abgelehnt/);
  assert.match(JSON.stringify(leadMail.body), /shower on the right wall although none was ordered/);
  // Das verworfene Bild geht nur an uns, damit wir sehen, was die Pruefung beanstandet hat.
  assert.deepEqual(leadMail.body.attachments.map(({ filename }) => filename), ['foto.png', 'verworfen.jpg']);
  assert.equal(h.counts().mail, 1, 'the customer must not receive a rejected image');
});

test('a rejected render leaves the customer his daily attempts', async () => {
  const h = harness({ checks: Array.from({ length: 20 }, () => () => checked(true)) });
  // Zehn abgelehnte Bilder hintereinander: das Gerätelimit bleibt unberührt,
  // es wird kein Zähler-Cookie gesetzt.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const res = await h.invoke();
    assert.equal(res.statusCode, 502);
    assert.equal(res.headers['Set-Cookie'], undefined);
  }
  // Das IP-Limit greift weiter, damit sich das nicht endlos wiederholen lässt.
  const blocked = await h.invoke();
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(h.counts(), { generation: 20, checks: 20, mail: 10 });
});

test('after a rejection the next attempt still counts as the first', async () => {
  const h = harness({ checks: [() => checked(true), () => checked(true), () => checked()] });
  const rejected = await h.invoke();
  assert.equal(rejected.statusCode, 502);
  assert.equal(rejected.headers['Set-Cookie'], undefined);
  const ok = await h.invoke();
  assert.equal(ok.statusCode, 200);
  assert.match(ok.headers['Set-Cookie'], /nldbp=1:2026-09-13/);
});

test('a changed field of view is noted for us but the customer still gets the image', async () => {
  const h = harness({ checks: [() => checkedInv({}, {}, { view_changed: true, reason: 'camera and visible room bounds changed' })] });
  const res = await h.invoke(payload({ dusche: 'keine', badewanne: 'keine' }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(h.counts(), { generation: 1, checks: 1, mail: 2 });
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /Bildausschnitt ver/);
});

test('a moved toilet is still rejected even when the field of view held', async () => {
  const moved = () => checkedInv({ toilet: 'back' }, { toilet: 'right' });
  const h = harness({ checks: [moved, moved] });
  const res = await h.invoke(payload({ dusche: 'keine', badewanne: 'keine' }));
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'RENDER_REJECTED');
  assert.deepEqual(h.counts(), { generation: 2, checks: 2, mail: 1 });
});

test('the generation request carries the aspect ratio of the customer photo', async () => {
  const h = harness(); await h.invoke();
  const gen = h.calls.find((call) => call.url.includes('generativelanguage.googleapis.com') && call.body?.generationConfig?.responseModalities);
  assert.equal(gen.body.generationConfig.imageConfig.imageSize, '2K');
  assert.equal(gen.body.generationConfig.imageConfig.aspectRatio, '1:1');
});

test('nearestAspectRatio picks a format Gemini supports', () => {
  assert.equal(nearestAspectRatio(720, 1280), '9:16');
  assert.equal(nearestAspectRatio(1280, 720), '16:9');
  assert.equal(nearestAspectRatio(1200, 1600), '3:4');
  assert.equal(nearestAspectRatio(1600, 1200), '4:3');
  assert.equal(nearestAspectRatio(1024, 1024), '1:1');
  assert.equal(nearestAspectRatio(0, 800), '');
});

test('the sanitary module travels as its own reference image', async () => {
  const image = () => new Response(Buffer.from(PNG, 'base64'), { status: 200, headers: { 'content-type': 'image/png' } });
  const h = harness({ swatch: () => image() });
  const res = await h.invoke(payload({ cistern: 'aufputz' }));
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  const parts = generation.body.contents[0].parts;
  // Foto, Plattenmuster, Muster von Waschtischplatte und Unterbau (eine Datei, wenn beide
  // dieselbe haben), Sanitärmodul: das Modul kommt zuletzt.
  const options = optionsForPackage('essenza');
  const vanity = new Set([options.tops[0].image, options.bases[0].image]).size;
  const images = parts.filter((part) => part.inlineData);
  assert.equal(images.length, 2 + vanity + 1);
  const module = images[images.length - 1].inlineData;
  assert.equal(module.mimeType, 'image/jpeg');
  // Ein echtes JPEG, kein Platzhalter: Base64 eines Bildes von einigen Kilobyte.
  assert.ok(module.data.startsWith('/9j/'), 'module image is not a JPEG');
  assert.ok(module.data.length > 2000, `module image too small: ${module.data.length}`);
  const prompt = parts[0].text;
  assert.match(prompt, new RegExp(`Image ${images.length} is ONLY a product photo of one sanitary module`));
  assert.match(prompt, new RegExp(`exactly the sanitary module of image ${images.length}, copied part for part`));
  assert.match(prompt, /never tiled, never clad and never boxed in/);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /OLI QR INOX Sospeso/);
});

test('the module image needs no network call and none is made for it', async () => {
  const h = harness();
  const res = await h.invoke(payload({ cistern: 'aufputz' }));
  assert.equal(res.statusCode, 200);
  assert.equal(h.calls.filter((call) => call.url.includes('oli-world')).length, 0);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  // Plattenmuster fehlt hier (404), das Modul ist trotzdem dabei: Foto + Modul.
  assert.equal(generation.body.contents[0].parts.filter((part) => part.inlineData).length, 2);
  assert.match(generation.body.contents[0].parts[0].text, /Image 2 is ONLY a product photo of one sanitary module/);
});

test('Unterputz carries no module image and forbids a module in front of the wall', async () => {
  const h = harness();
  const res = await h.invoke(payload({ cistern: 'unterputz' }));
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  assert.equal(generation.body.contents[0].parts.filter((part) => part.inlineData).length, 1);
  const prompt = generation.body.contents[0].parts[0].text;
  assert.doesNotMatch(prompt, /product photo of one sanitary module/);
  assert.match(prompt, /In both cases no new free-standing module is added/);
});

test('the washbasin gets the same ceramic colour as the toilet', async () => {
  const options = optionsForPackage('colore');
  const coloured = options.sanitary.find((entry) => entry.id !== 'weiss') || options.sanitary[0];
  const h = harness();
  const res = await h.invoke(payload({
    paket: 'colore', format: options.formats[0], platte: options.tiles[0].id,
    unterbau: options.bases[0].id, top: options.tops[0].id, becken: 'aufsatz',
    armaturenserie: 'treemme-ran', finish: 'treemme-nero-opaco', keramik: coloured.id,
    wall: options.walls[0].id, dusche: options.showers[0].id, badewanne: options.bathtubs[0].id,
    waschtisch: options.basins[0].id, spiegel: options.mirrors[0].id,
  }));
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  const prompt = generation.body.contents[0].parts[0].text;
  // Ein Bad mit farbigem WC und weissem Becken ist eine Farbe zu viel.
  assert.ok(prompt.includes(`in the same ${coloured.prompt} as the toilet, exactly the same colour and finish`),
    'washbasin does not carry the ceramic colour');
});

test('Waschtischplatte und Unterbau gehen als Muster mit, die Platte nimmt nie den Wandmarmor', async () => {
  // Probe vom 19.09.: Colore, Calacatta Viola, Unterbau Diamante, Platte Stone Color Diamante.
  // Nur mit dem Namen "Diamante" malte das Modell die Waschtischplatte im Marmor der Wand.
  const options = optionsForPackage('colore');
  const tile = options.tiles.find((entry) => entry.id === 'energieker-calacatta-viola-calacatta-viola');
  const top = options.tops.find((entry) => entry.id === 'edone-stone-color-diamante');
  const base = options.bases.find((entry) => entry.id === 'edone-laccato-diamante');
  assert.ok(tile && top && base, 'Probe-Auswahl fehlt im Katalog');
  assert.equal(top.image, base.image, 'Diamante: Platte und Unterbau teilen dasselbe Muster');
  const image = () => new Response(Buffer.from(PNG, 'base64'), { status: 200, headers: { 'content-type': 'image/png' } });
  const h = harness({ swatch: () => image() });
  const res = await h.invoke(payload({
    paket: 'colore', format: '60x120', platte: tile.id, unterbau: base.id, top: top.id, becken: 'aufsatz',
    armaturenserie: 'treemme-up', finish: options.finishes[0].id, keramik: options.sanitary[0].id,
    wall: options.walls[0].id, dusche: options.showers[0].id, badewanne: options.bathtubs[0].id,
    waschtisch: options.basins[0].id, spiegel: options.mirrors[0].id,
  }));
  assert.equal(res.statusCode, 200);
  // Dieselbe Datei wird einmal geladen und einmal mitgeschickt: Foto, Platte, Diamante.
  assert.equal(h.calls.filter((call) => call.url.endsWith(top.image)).length, 1);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  assert.equal(generation.body.contents[0].parts.filter((part) => part.inlineData).length, 3);
  const prompt = generation.body.contents[0].parts[0].text;
  assert.match(prompt, /Image 3 is ONLY a small colour sample for the vanity unit: its front, its body and its countertop/);
  assert.ok(prompt.includes(`countertop in ${top.prompt}, exactly the colour and finish of image 3`), 'Platte ohne Verweis auf ihr Muster');
  assert.ok(prompt.includes(`front and body in ${base.prompt}, exactly the colour and finish of image 3`), 'Unterbau ohne Verweis auf sein Muster');
  assert.match(prompt, /the countertop is its own material, never cut from the wall or floor tiles and never copying their pattern or veining/);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /Platte geladen, Waschtisch geladen/);
});

test('ohne ladbares Muster bleibt es bei der Beschreibung, ohne Bildnummer', async () => {
  const h = harness();
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  assert.equal(generation.body.contents[0].parts.filter((part) => part.inlineData).length, 1);
  const prompt = generation.body.contents[0].parts[0].text;
  assert.doesNotMatch(prompt, /colour sample for|sample of the countertop/);
  assert.match(prompt, /never cut from the wall or floor tiles/);
});

test('an integrated washbasin keeps the countertop material, not the ceramic colour', async () => {
  const options = optionsForPackage('atelier');
  assert.ok(options.basinTypes.some((entry) => entry.id === 'integriert'), 'atelier should offer an integrated basin');
  const tile = options.tiles[0];
  const h = harness();
  const res = await h.invoke(payload({
    paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id, kombination: 'einheitlich',
    unterbau: options.bases[0].id, top: options.tops[0].id, becken: 'integriert',
    finish: options.finishes[0].id, keramik: options.sanitary[0].id,
    wall: options.walls[0].id, dusche: options.showers[0].id, badewanne: options.bathtubs[0].id,
    waschtisch: options.basins[0].id, spiegel: options.mirrors[0].id,
  }));
  assert.equal(res.statusCode, 200, `unexpected status ${res.statusCode}: ${JSON.stringify(res.body).slice(0, 200)}`);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  assert.doesNotMatch(generation.body.contents[0].parts[0].text, /as the toilet, exactly the same colour and finish/);
});

test('the toilet keeps its wall, also under a sloping ceiling', async () => {
  const h = harness();
  const res = await h.invoke(payload());
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  const prompt = generation.body.contents[0].parts[0].text;
  // Zweimal gesehen: unter der Dachschraege wandert das WC an die gerade Wand.
  assert.match(prompt, /The toilet keeps its wall and its place because its drain cannot be moved/);
  assert.match(prompt, /never moved to a straight or rear wall to gain headroom/);
});

test('an Unterputz toilet also keeps seat and lid in the ceramic colour', async () => {
  const h = harness();
  const res = await h.invoke(payload({ cistern: 'unterputz' }));
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  assert.match(generation.body.contents[0].parts[0].text, /with seat and lid in the very same .*never wood/);
});

test('kein Auswahlname traegt italienischen Katalogtext oder ein doppeltes Wort', () => {
  // "Artistic mosaic (immagine di categoria)" und "Onyx Onyx Black" standen so im Badplaner.
  const scraperText = /immagine|categoria|prodotto|scheda tecnica|non disponibile/i;
  for (const id of ['essenza', 'colore', 'atelier']) {
    const options = optionsForPackage(id);
    for (const [group, list] of Object.entries(options)) {
      if (!Array.isArray(list)) continue;
      for (const option of list) {
        if (!option || typeof option.label !== 'string') continue;
        assert.ok(!scraperText.test(option.label), `${group}: ${option.label} traegt italienischen Katalogtext`);
        const words = option.label.split(' ');
        for (let i = 0; i < words.length - 1; i += 1) {
          assert.notEqual(words[i], words[i + 1], `${group}: ${option.label} wiederholt ein Wort`);
        }
      }
    }
  }
});

test('every tap finish carries a German name, not only the Italian one', () => {
  const german = /\((Chrom|Schwarz matt|Weiss matt|Gold gebürstet|Nickel gebürstet|Edelstahl gebürstet|Roségold gebürstet|Messing gebürstet|Anthrazit|Nickel poliert|Gold 24 Karat|Schwarzchrom poliert|Schwarzchrom gebürstet)\)/;
  for (const id of ['essenza', 'colore', 'atelier']) {
    for (const finish of optionsForPackage(id).finishes) {
      // Der Kunde in Zofingen liest "Cromo" nicht als Chrom.
      const italian = /^(Cromo|Nero Opaco|Bianco Opaco|Oro Spazzolato|Nichel Spazzolato|Inox Spazzolato|Oro Rosa Spazzolato|Ottone Spazzolato|Gun Metal-PVD)$/;
      assert.ok(!italian.test(finish.label), `${finish.label} has no German name`);
      if (/Spazzolato|Opaco|Lucido|^Cromo|^Oro|Gun Metal/.test(finish.label)) {
        assert.match(finish.label, german, `${finish.label} is missing its German name`);
      }
    }
  }
});

test('individual consultation sends one lead and never calls Gemini', async () => {
  const h = harness();
  const res = await h.invoke({ kind: 'beratung', raum: 'gaeste-wc', priorities: 'Mehr Stauraum und pflegeleichte Flächen', name: 'Fixture Person', email: 'fixture@example.invalid', telefon: '+41 00 000 00 00', consent: true });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(h.counts(), { generation: 0, checks: 0, mail: 1 });
});

test('consultation image request requires a room photo before provider calls', async () => {
  const h = harness();
  const res = await h.invoke({ kind: 'beratung', raum: 'badezimmer', priorities: 'Neue Aufteilung', imageWanted: true, name: 'Fixture Person', email: 'fixture@example.invalid', telefon: '+41 00 000 00 00', consent: true });
  assert.equal(res.statusCode, 400);
  assert.equal(h.calls.length, 0);
});

for (const [name, change] of Object.entries({
  'missing option': { top: undefined }, 'unknown option': { platte: 'unknown' },
  'missing windows': { windows: '' }, 'missing consent': { consent: false },
  'missing name': { name: '' }, 'missing place': { place: '' }, 'invalid email': { email: 'not-an-email' },
  'invalid base64': { foto: 'data:image/png;base64,AAAA===A' },
  'false MIME': { foto: `data:image/jpeg;base64,${PNG}` },
})) test(`${name} returns 400 before any provider call`, async () => {
  const h = harness(); const res = await h.invoke(payload(change));
  assert.equal(res.statusCode, 400); assert.equal(res.body.ok, false); assert.equal(h.calls.length, 0);
});

test('HTTP and JSON envelope reject malformed requests without network', async () => {
  const h = harness();
  assert.equal((await h.invoke(null, { method: 'GET' })).statusCode, 405);
  for (const body of [null, [], 'broken-json', 7, {}]) assert.equal((await h.invoke(body)).statusCode, 400);
  assert.equal(h.calls.length, 0);
});

test('oversize JSON is rejected before provider calls', async () => {
  const h = harness(); const res = await h.invoke({ ...payload(), note: 'x'.repeat(4 * 1024 * 1024) });
  assert.equal(res.statusCode, 413); assert.equal(h.calls.length, 0);
});

test('second rejected result is never returned, while the lead and original photo are preserved', async () => {
  const h = harness({ checks: [() => checked(true), () => checked(true)] });
  const res = await h.invoke();
  assert.equal(res.body.code, 'RENDER_REJECTED'); assert.equal(res.statusCode, 502);
  assert.equal(res.body.image, undefined); assert.deepEqual(h.counts(), { generation: 2, checks: 2, mail: 1 });
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /Ideenbild.*abgelehnt \(Prüfung\), nicht angezeigt/);
  assert.match(JSON.stringify(leadMail.body), /Muster/);
  assert.deepEqual(leadMail.body.attachments.map(({ filename }) => filename), ['foto.png', 'verworfen.jpg']);
  // Der zweite, ebenfalls verworfene Versuch ist der, den wir zu sehen bekommen.
  assert.ok(leadMail.body.attachments[1].content.length > 0);
});

test('second approved result replaces first rejected result', async () => {
  const h = harness({ checks: [() => checked(true), () => checked()] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200); assert.deepEqual(h.counts(), { generation: 2, checks: 2, mail: 2 });
  const retry = h.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1];
  assert.match(retry.body.contents[0].parts[0].text, /failed the structural and fixture check/);
});

test('second generation failure after rejection still fails closed', async () => {
  const h = harness({ checks: [() => checked(true)], generations: [() => generated(), () => response({}, 500)] });
  const res = await h.invoke();
  // Kein Bild fuer den Kunden, aber der Lead geht an uns (mit dem verworfenen Bild).
  assert.equal(res.statusCode, 502); assert.equal(res.body.image, undefined); assert.equal(h.counts().mail, 1);
});

for (const answer of ['not json', '```json\n{"extra_openings":false,"reason":"x"}\n```', '{"extra_openings":"false","reason":"x"}', '{"extra_openings":false}', '{"extra_openings":false,"reason":""}', '{"extra_openings":false,"reason":"x","uncertain":true}', 'null', '[]']) {
  test(`checker retries and delivers malformed result for ${answer.slice(0, 28)}`, async () => {
    const h = harness({ checks: [() => checked(false, answer), () => checked(false, answer)] }); const res = await h.invoke();
    assert.equal(res.statusCode, 200); assert.equal(res.body.image.data, PNG); assert.equal(h.counts().mail, 2);
  });
}

test('checker result without a completed STOP response is retried and delivered with warning', async () => {
  for (const finishReason of [undefined, 'MAX_TOKENS', 'SAFETY']) {
    const unavailable = () => response({ candidates: [{ finishReason, content: { parts: [{ text: '{"extra_openings":false,"reason":"fixture"}' }] } }] });
    const h = harness({ checks: [unavailable, unavailable] });
    const res = await h.invoke(); assert.equal(res.statusCode, 200); assert.equal(h.counts().mail, 2);
  }
});

test('disabled checker delivers and reports it in the lead mail', async () => {
  for (const value of ['', '  ']) {
    const h = harness({ env: { BADPLANER_CHECK_MODEL: value } }); const res = await h.invoke();
    assert.equal(res.statusCode, 200); assert.deepEqual(h.counts(), { generation: 1, checks: 0, mail: 2 });
    assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails')?.body), /Fensterprüfung.*deaktiviert/);
  }
});

test('missing generation key still fails before rendering', async () => {
  const h = harness({ env: { GEMINI_API_KEY: '' } }); assert.equal((await h.invoke()).statusCode, 503); assert.equal(h.calls.length, 0);
});

test('unavailable checker retries once, delivers the lead and marks the mail', async () => {
  const h = harness({ checks: [() => response({}, 503), () => response({}, 503)] }); const res = await h.invoke();
  assert.equal(res.statusCode, 200); assert.equal(res.body.image.data, PNG);
  assert.deepEqual(h.counts(), { generation: 1, checks: 2, mail: 2 });
  assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails')?.body), /Fensterprüfung.*nicht möglich \(HTTP 503\)/);
});

test('ein Ausfall des Bilddienstes wird gemeldet, der Lead aber nicht weggeworfen', async () => {
  // Diegos Probe vom 17.09: erster Versuch scheiterte, und es kam gar keine Mail.
  // Der Kunde hatte das ganze Formular ausgefuellt, wir hatten davon nichts.
  for (const settings of [{ generateDelays: [65001] }, { generations: [() => generated('AAAA')] }, { generations: [() => generated(PNG, 'image/svg+xml')] }]) {
    const h = harness(settings); const res = await h.invoke();
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.code, 'RENDER_FAILED');
    assert.match(res.body.error, /Ihre Angaben und Ihr Foto sind bei uns/);
    assert.deepEqual(h.counts(), { generation: 1, checks: 0, mail: 1 });
    const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
    assert.match(leadMail.body.subject, /kein Ideenbild erzeugt/);
    assert.deepEqual(leadMail.body.attachments.map(({ filename }) => filename), ['foto.png']);
  }
});

test('auch ein gescheiterter zweiter Versuch behaelt den Lead und das verworfene Bild', async () => {
  const h = harness({ generateDelays: [35000, 0], checkDelays: [4000], checks: [() => checked(true)],
    generations: [() => generated(), () => response({ error: 'boom' }, 500)] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 502);
  assert.equal(h.counts().generation, 2);
  assert.equal(h.counts().mail, 1);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.deepEqual(leadMail.body.attachments.map(({ filename }) => filename), ['foto.png', 'verworfen.jpg']);
});

test('ein Ausfall des Bilddienstes kostet den Kunden keinen Tagesversuch', async () => {
  const h = harness({ generations: [() => response({ error: 'boom' }, 500)] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 502);
  assert.equal(res.headers['Set-Cookie'], undefined);
});

test('failed render attempts do not consume the IP counter', async () => {
  const failures = Array.from({ length: 6 }, () => () => response({}, 500));
  const h = harness({ generations: failures });
  for (let index = 0; index < failures.length; index += 1) assert.equal((await h.invoke()).statusCode, 502);
  assert.equal((await h.invoke()).statusCode, 200);
});

test('retry is skipped when a second pass of the measured length cannot fit', async () => {
  // Nur noch im Ausnahmefall: langsamstes Bild, Pruefung erst nach einem 503 lesbar (60 + 19 + 19 s).
  const h = harness({ generateDelays: [60000], checkDelays: [19000, 19000], checks: [() => response({}, 503), () => checked(true)] });
  const res = await h.invoke();
  assert.equal(res.body.code, 'RENDER_REJECTED'); assert.deepEqual(h.counts(), { generation: 1, checks: 2, mail: 1 });
});

test('der zweite Versuch laeuft auch nach dem langsamsten ersten Durchgang', async () => {
  // Diegos Lead bp-mu8875ki-ofjd5s vom 19.09., 12:11: erster Versuch verworfen (Fenster dazu,
  // Kamera zurueck), kein zweiter Versuch, weil bei 110 s Budget die Zeit fehlte. Um 12:25
  // lief der zweite Versuch und kam durch. Jetzt passt er auch nach 60 s Bild + 19 s Pruefung (Grenze 20 s).
  const h = harness({ swatchDelay: 700, photoCheckDelays: [2400], generateDelays: [60000, 60000], checkDelays: [19000, 19000],
    mailDelays: [3000, 2000], checks: [() => checked(true), () => checked(false)] });
  const start = h.clock.now();
  const res = await h.invoke();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(h.counts(), { generation: 2, checks: 2, mail: 2 });
  assert.ok(h.clock.now() - start < 220000);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /1\. Versuch verworfen \(an opening was added or lost.*2\. Versuch ok/);
});

test('retry runs when the first pass was fast enough to repeat', async () => {
  const h = harness({ generateDelays: [20000], checks: [() => checked(true)] }); const res = await h.invoke();
  assert.equal(res.statusCode, 200); assert.deepEqual(h.counts(), { generation: 2, checks: 2, mail: 2 });
});

test('company mail fallback success is explicit and reports missing attachments', async () => {
  const h = harness({ mails: [() => response({}, 500)] }); const res = await h.invoke();
  assert.equal(res.statusCode, 200); assert.equal(res.body.delivery.leadProvider, 'formspree');
  assert.equal(res.body.delivery.leadAttachments, false);
});

test('both company channels reject: no success or customer email', async () => {
  const h = harness({ mails: [() => response({}, 500)], formspree: () => response({}, 500) }); const res = await h.invoke();
  assert.equal(res.statusCode, 502); assert.equal(res.body.code, 'LEAD_DELIVERY_FAILED');
  assert.equal(res.body.image, undefined); assert.equal(h.counts().mail, 1);
});

test('ambiguous company timeout is unknown and is not automatically duplicated', async () => {
  const h = harness({ mailDelays: [8001] }); const res = await h.invoke();
  assert.equal(res.statusCode, 502); assert.equal(res.body.delivery.lead, 'unknown');
  assert.equal(h.calls.some((call) => call.url.includes('formspree')), false);
});

for (const [expected, settings] of [
  ['failed', { mails: [() => response({ id: 'lead-ok' }), () => response({}, 500)] }],
  ['unknown', { mailDelays: [0, 6001] }],
  ['skipped', { env: { RESEND_API_KEY: '' } }],
]) test(`customer email ${expected} preserves approved image and honest status`, async () => {
  const h = harness(settings); const res = await h.invoke();
  assert.equal(res.statusCode, 200); assert.equal(res.body.delivery.customer, expected); assert.equal(res.body.image.data, PNG);
});

test('newsletter failures are surfaced separately and never silently marked subscribed', async () => {
  const h = harness({ env: { RESEND_AUDIENCE_ID: 'fixture-audience' }, newsletter: () => response({}, 500) });
  const res = await h.invoke(payload({ newsletter: true }));
  assert.equal(res.statusCode, 200); assert.equal(res.body.delivery.newsletter, 'failed');
});

test('host header injection cannot select a swatch origin', async () => {
  const h = harness(); await h.invoke(payload(), { headers: { host: 'evil.example.invalid', 'x-forwarded-host': '127.0.0.1' } });
  assert.ok(h.calls[0].url.startsWith('https://newlivingdesign.ch/badplaner/swatches/'));
  assert.ok(h.calls.every((call) => !call.url.includes('evil.example') && !call.url.includes('127.0.0.1')));
});

test('malformed cookie remains recoverable and device limit performs zero requests', async () => {
  const h = harness(); assert.equal((await h.invoke(payload(), { headers: { cookie: 'nldbp=%E0%A4%A' } })).statusCode, 200);
  const limited = harness(); const res = await limited.invoke(payload(), { headers: { cookie: 'nldbp=5:2026-09-13' } });
  assert.equal(res.statusCode, 429); assert.equal(limited.calls.length, 0);
});

test('floorplan failure does not falsely confirm receipt', async () => {
  const h = harness({ mails: [() => response({}, 500)], formspree: () => response({}, 500) });
  const res = await h.invoke({ kind: 'grundriss', leadId: 'bp-fixture', name: 'Fixture', phone: '12345678', note: 'fixture' });
  assert.equal(res.statusCode, 502); assert.equal(res.body.ok, false);
});

test('floorplan PDF signature and base64 are validated before sending', async () => {
  const h = harness(); const res = await h.invoke({ kind: 'grundriss', name: 'Fixture', phone: '12345678', file: { mime: 'application/pdf', data: PNG } });
  assert.equal(res.statusCode, 400); assert.equal(h.calls.length, 0);
});

test('floorplan attachment lost in fallback is not confirmed as delivered', async () => {
  const h = harness({ env: { RESEND_API_KEY: '' } });
  const res = await h.invoke({ kind: 'grundriss', name: 'Fixture', phone: '12345678', file: { mime: 'image/png', data: PNG } });
  assert.equal(res.statusCode, 502); assert.equal(res.body.code, 'ATTACHMENT_NOT_DELIVERED');
  assert.equal(res.body.delivery.leadAttachments, false);
});

test('malformed 2xx lead/customer/newsletter responses are unknown, not accepted', async () => {
  for (const json of [{}, { id: '' }, { id: 42 }]) {
    const lead = harness({ mails: [() => response(json)] });
    assert.equal((await lead.invoke()).body.delivery.lead, 'unknown');
    const customer = harness({ mails: [() => response({ id: 'lead-ok' }), () => response(json)] });
    assert.equal((await customer.invoke()).body.delivery.customer, 'unknown');
    const newsletter = harness({ env: { RESEND_AUDIENCE_ID: 'fixture' }, newsletter: () => response(json) });
    assert.equal((await newsletter.invoke(payload({ newsletter: true }))).body.delivery.newsletter, 'unknown');
  }
});

test('current large catalog originals below 5 MiB retain their visual reference', async () => {
  const bytes = Buffer.alloc(4_686_310); Buffer.from(PNG, 'base64').copy(bytes);
  const h = harness({ swatch: () => new Response(bytes, { headers: { 'content-type': 'image/png' } }) });
  const res = await h.invoke(); assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  // Text, Foto, Plattenmuster, dann die Muster von Waschtischplatte und Unterbau (hier eine Datei).
  const options = optionsForPackage('essenza');
  assert.equal(generation.body.contents[0].parts.length, 3 + new Set([options.tops[0].image, options.bases[0].image]).size);
  assert.equal(Buffer.from(generation.body.contents[0].parts[2].inlineData.data, 'base64').length, bytes.length);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /Muster/);
  assert.match(JSON.stringify(leadMail.body), /geladen/);
});

test('generated response headers and streaming bytes respect the provider cap', async () => {
  for (const large of [
    () => new Response('{}', { headers: { 'content-length': String(7 * 1024 * 1024) } }),
    () => new Response(new Uint8Array(6 * 1024 * 1024 + 1)),
  ]) {
    const h = harness({ generations: [large] }); const res = await h.invoke();
    assert.equal(res.statusCode, 502); assert.equal(h.counts().checks, 0); assert.equal(h.counts().mail, 1);
  }
});

test('full slow pipeline including fallback stays within the overall deadline', async () => {
  const h = harness({ swatchDelay: 4000, generateDelays: [49000], checkDelays: [19000],
    mailDelays: [7000, 5000], mails: [() => response({}, 500)], formspreeDelay: 7000 });
  const start = h.clock.now(); const res = await h.invoke();
  assert.equal(res.statusCode, 200); assert.equal(res.body.delivery.leadProvider, 'formspree');
  // Die Uhr im Test zaehlt parallele Abrufe nacheinander: das Muster von Waschtischplatte
  // und Unterbau kommt mit 4000 ms dazu, in Wirklichkeit laeuft es neben dem Plattenmuster.
  assert.equal(h.clock.now() - start, 99000); assert.ok(h.clock.now() - start < 105000);
});

test('exhausted deadline starts no further external call', async () => {
  const clock = fakeClock(); const budget = new Budget(clock, 105000); let calls = 0;
  clock.advance(105000);
  await assert.rejects(budget.run(8000, async () => { calls += 1; }), TimeoutError);
  assert.equal(calls, 0); assert.equal(clock.timers.size, 0);
});

test('identical API requests are explicitly not claimed durably idempotent', async () => {
  const h = harness(); const first = await h.invoke(); const second = await h.invoke();
  assert.notEqual(first.body.leadId, second.body.leadId);
  assert.equal(h.counts().generation, 2); // UI blocks double clicks; persistence is a separate decision.
});

test('deadline also bounds an adapter ignoring abort and clears all timers', async () => {
  const clock = fakeClock(); const budget = new Budget(clock, 105000);
  let signal;
  const work = budget.run(50000, async (value) => { signal = value; return new Promise(() => {}); });
  clock.advance(50000);
  await assert.rejects(work, TimeoutError); assert.equal(signal.aborted, true); assert.equal(clock.timers.size, 0);
  clock.advance(50000);
  const last = budget.run(20000, async () => new Promise(() => {}));
  clock.advance(5000); await assert.rejects(last, TimeoutError); assert.equal(budget.remaining(), 0);
});

test('slow response body is timed out, not only response headers', async () => {
  let cancelCalled = false;
  const h = harness({ generations: [() => new Response(new ReadableStream({ cancel() { cancelCalled = true; } }), { headers: { 'content-type': 'application/json' } })] });
  const pending = h.invoke();
  for (let i = 0; i < 30 && h.counts().generation === 0; i += 1) await Promise.resolve();
  h.clock.advance(65000);
  const res = await pending;
  assert.equal(res.statusCode, 502); assert.equal(cancelCalled, true); assert.equal(h.counts().mail, 1);
});

/* ---------- Ideenbild vor dem Kontakt (stage 'vorschau' + kind 'anfrage') ---------- */

const previewPayload = (changes = {}) => {
  const body = payload({ stage: 'vorschau', ...changes });
  for (const key of ['name', 'email', 'telefon', 'place']) delete body[key];
  return body;
};

/** Wie die Seite die Anfrage schickt: Laenge, JSON, dann die Bildbytes. */
function anfrageBody(fields, imageBytes) {
  const json = Buffer.from(JSON.stringify({ kind: 'anfrage', ...fields }), 'utf8');
  const length = Buffer.alloc(4); length.writeUInt32BE(json.length, 0);
  return Buffer.concat([length, json, imageBytes]);
}

const contactFields = { name: 'Walter Test Vorschau (bitte ignorieren)', email: 'fixture@example.invalid', telefon: '+41 00 000 00 00', place: '4800 Zofingen', consent: true };

test('Vorschau: Bild ohne Kontaktangaben, Entwurf-Mail mit Foto und Bild an NLD, keine Kundenmail', async () => {
  const h = harness();
  const res = await h.invoke(previewPayload());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.vorschau, true);
  assert.equal(res.body.image.data, PNG);
  assert.equal(typeof res.body.ticket, 'string');
  assert.ok(Array.isArray(res.body.auswahl) && res.body.auswahl.length > 3);
  assert.deepEqual(h.counts(), { generation: 1, checks: 1, mail: 1 });
  const draft = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(draft.body.subject, /^Badplaner-Entwurf ohne Kontakt/);
  assert.equal(draft.body.attachments.length, 2);
  assert.equal('reply_to' in draft.body, false);
  assert.match(res.headers['Set-Cookie'], /nldbp=/);
});

test('Vorschau braucht die Einwilligung, aber keinen Namen', async () => {
  const h = harness();
  const res = await h.invoke(previewPayload({ consent: false }));
  assert.equal(res.statusCode, 400);
  assert.deepEqual(h.counts(), { generation: 0, checks: 0, mail: 0 });
});

test('Vorschau: falsches Foto verspricht keinen Rueckruf und meldet den Grund intern', async () => {
  const h = harness({ photoChecks: [() => photoChecked(false)] });
  const res = await h.invoke(previewPayload());
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 'PHOTO_NOT_A_BATHROOM');
  assert.doesNotMatch(res.body.error, /Ihre Angaben sind bei uns|wir melden uns/i);
  assert.match(res.body.error, /kein Bad und kein WC/);
  assert.deepEqual(h.counts(), { generation: 0, checks: 0, mail: 1 });
  const mail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(mail.body.subject, /^Badplaner-Fehler ohne Kontakt/);
  assert.match(JSON.stringify(mail.body), /Foto nicht als Bad oder Gäste-WC erkannt/);
  assert.match(JSON.stringify(mail.body), /Paket.*Essenza/);
  assert.deepEqual(mail.body.attachments.map(({ filename }) => filename), ['foto.png']);
});

test('Vorschau: Bildfehler nutzt den verbindlichen Text und verspricht keinen Rueckruf', async () => {
  const h = harness({ generations: [() => response({ error: 'fixture' }, 503)] });
  const res = await h.invoke(previewPayload());
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'RENDER_FAILED');
  assert.equal(res.body.error, 'Ihr Ideenbild konnte leider nicht erstellt werden. Hinterlassen Sie uns Ihre Kontaktdaten – wir besprechen Ihre Badideen gerne persönlich mit Ihnen.');
  assert.doesNotMatch(res.body.error, /Ihre Angaben sind bei uns|wir melden uns|schicken es Ihnen nach/i);
  assert.deepEqual(h.counts(), { generation: 1, checks: 0, mail: 1 });
  const mail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(mail.body.subject, /^Badplaner-Fehler ohne Kontakt/);
  assert.match(JSON.stringify(mail.body), /Bildgenerierung fehlgeschlagen/);
  assert.match(JSON.stringify(mail.body), /Paket.*Essenza/);
  assert.deepEqual(mail.body.attachments.map(({ filename }) => filename), ['foto.png']);
});

test('Vorschau: verworfenes Bild verspricht keinen Rueckruf und bleibt intern sichtbar', async () => {
  const h = harness({ checks: [() => checked(true), () => checked(true)] });
  const res = await h.invoke(previewPayload());
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'RENDER_REJECTED');
  assert.doesNotMatch(res.body.error, /Ihre Angaben sind bei uns|wir melden uns/i);
  assert.match(res.body.error, /Qualitätsprüfung/);
  assert.deepEqual(h.counts(), { generation: 2, checks: 2, mail: 1 });
  const mail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(mail.body.subject, /^Badplaner-Fehler ohne Kontakt/);
  assert.match(JSON.stringify(mail.body), /Qualitätsprüfung abgelehnt/);
  assert.match(JSON.stringify(mail.body), /Paket.*Essenza/);
  assert.deepEqual(mail.body.attachments.map(({ filename }) => filename), ['foto.png', 'verworfen.jpg']);
});

test('Beratung nach Bildfehler uebermittelt Foto und Auswahl ohne Gemini', async () => {
  const h = harness();
  const res = await h.invoke({
    kind: 'beratung',
    raum: 'badezimmer',
    priorities: 'Ich wünsche eine persönliche Beratung zu meiner Auswahl im Badplaner.',
    renderFailure: 'RENDER_FAILED',
    auswahl: [['Paket', 'Essenza'], ['Dusche', 'Walk-in'], ['Platten', 'Fixture Beige']],
    file: { name: 'badfoto.png', mime: 'image/png', data: PNG },
    name: 'Fixture Person',
    email: 'fixture@example.invalid',
    telefon: '+41 00 000 00 00',
    consent: true,
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(h.counts(), { generation: 0, checks: 0, mail: 1 });
  assert.equal(h.photoCount(), 0);
  const mail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(mail.body.subject, /^Badplaner-Beratung:/);
  assert.match(JSON.stringify(mail.body), /Bildgenerierung fehlgeschlagen/);
  assert.match(JSON.stringify(mail.body), /Paket.*Essenza/);
  assert.match(JSON.stringify(mail.body), /Dusche.*Walk-in/);
  assert.deepEqual(mail.body.attachments.map(({ filename }) => filename), ['beratung.png']);
});

test('Beratung lehnt manipulierten Fehlerkontext vor jedem Provideraufruf ab', async () => {
  for (const change of [{ renderFailure: 'toString' }, { renderFailure: 'RENDER_FAILED', auswahl: [['Paket']] }]) {
    const h = harness();
    const res = await h.invoke({
      kind: 'beratung', raum: 'badezimmer', priorities: 'Persönliche Beratung',
      name: 'Fixture Person', email: 'fixture@example.invalid', telefon: '+41 00 000 00 00', consent: true,
      ...change,
    });
    assert.equal(res.statusCode, 400);
    assert.equal(h.calls.length, 0);
  }
});

test('Anfrage nach der Vorschau: Lead und Kundenmail mit genau dem Bild der Vorschau', async () => {
  const h = harness();
  const preview = (await h.invoke(previewPayload())).body;
  const image = Buffer.from(preview.image.data, 'base64');
  const res = await h.invoke(anfrageBody({ ...contactFields, leadId: preview.leadId, exp: preview.exp, ticket: preview.ticket, auswahl: preview.auswahl, paket: preview.paket, mime: preview.image.mime }, image));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.delivery.lead, 'accepted');
  assert.equal(res.body.delivery.customer, 'accepted');
  assert.equal(h.counts().generation, 1, 'die Anfrage erzeugt kein zweites Bild');
  const mails = h.calls.filter((call) => call.url === 'https://api.resend.com/emails');
  const lead = mails.find((call) => /^Badplaner-Lead: Walter Test Vorschau/.test(call.body.subject));
  assert.ok(lead, 'Lead-Mail fehlt');
  assert.equal(lead.body.reply_to, 'fixture@example.invalid');
  assert.match(JSON.stringify(lead.body), new RegExp(preview.leadId));
  assert.equal(lead.body.attachments[0].content, preview.image.data);
  const customer = mails.find((call) => call.body.to?.[0] === 'fixture@example.invalid');
  assert.equal(customer.body.attachments[0].content, preview.image.data);
});

test('Anfrage mit fremdem Bild, geaenderter Auswahl oder abgelaufenem Ticket wird abgelehnt', async () => {
  const h = harness();
  const preview = (await h.invoke(previewPayload())).body;
  const image = Buffer.from(preview.image.data, 'base64');
  const base = { ...contactFields, leadId: preview.leadId, exp: preview.exp, ticket: preview.ticket, auswahl: preview.auswahl, paket: preview.paket, mime: preview.image.mime };
  const other = Buffer.from(image); other[other.length - 5] ^= 0xff;
  for (const [fields, bytes] of [
    [base, other],
    [{ ...base, auswahl: [['Platten', 'etwas anderes']] }, image],
    [{ ...base, paket: { ...base.paket, id: 'atelier' } }, image],
    [{ ...base, ticket: 'x' + base.ticket.slice(1) }, image],
  ]) {
    const res = await h.invoke(anfrageBody(fields, bytes));
    assert.equal(res.statusCode, 400, JSON.stringify(res.body));
  }
  h.clock.advance(3 * 60 * 60 * 1000);
  const late = await h.invoke(anfrageBody(base, image));
  assert.equal(late.statusCode, 400);
  assert.match(late.body.error, /abgelaufen/);
  assert.equal(h.calls.filter((call) => call.url === 'https://api.resend.com/emails').length, 1, 'nur die Entwurf-Mail');
});

test('the image prompt carries no leftover source code (quote, plus, indentation)', async () => {
  const h = harness(); const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  const gen = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  const prompt = gen.body.contents[0].parts[0].text;
  // Seit 637f03a stand mitten im Prompt woertlich: "\n    + " (aus einem Template-String).
  assert.doesNotMatch(prompt, /"\s*\n\s*\+\s*"/);
  assert.match(prompt, /never create extra floor area\. Whatever stands in the immediate foreground/);
});

test('beide Pruefungen denken wenig, das Bildmodell bleibt unveraendert', async () => {
  // 20.09., 09:25: Fotopruefung 16 s, Pruefung nach 25 s abgelaufen, Wiederholung 17 s.
  const h = harness(); const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  const gemini = h.calls.filter((call) => call.url.includes('generativelanguage.googleapis.com'));
  const image = gemini.find((call) => call.body.generationConfig.responseModalities);
  assert.equal(image.body.generationConfig.thinkingConfig, undefined);
  assert.match(image.url, /gemini-3-pro-image:/);
  const checks = gemini.filter((call) => call !== image);
  assert.equal(checks.length, 2);
  for (const call of checks) assert.deepEqual(call.body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
  // Ein aelteres Pruefmodell kennt thinkingLevel nicht und bekommt es nicht.
  const old = harness({ env: { BADPLANER_CHECK_MODEL: 'gemini-2.5-flash' } }); await old.invoke();
  for (const call of old.calls.filter((c) => c.url.includes('gemini-2.5-flash'))) assert.equal(call.body.generationConfig.thinkingConfig, undefined);
});

test('eine langsame Fotopruefung haelt das Bild hoechstens 12 s auf', async () => {
  const withLayout = () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv(), order: ['washbasin', 'toilet'], nearest: 'toilet' }));
  const slow = harness({ photoCheckDelays: [13000], photoChecks: [withLayout] }); const res = await slow.invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(slow.counts().generation, 1);
  const prompt = slow.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.doesNotMatch(prompt, /WHAT IMAGE 1 SHOWS/);
  const inTime = harness({ photoCheckDelays: [11000], photoChecks: [withLayout] });
  await inTime.invoke();
  assert.match(inTime.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text, /WHAT IMAGE 1 SHOWS/);
});

test('nach einem Timeout der Pruefung folgt ein kurzer zweiter Anlauf von hoechstens 10 s', async () => {
  const quick = harness({ checkDelays: [21000, 9000] }); const ok = await quick.invoke();
  assert.equal(ok.statusCode, 200); assert.equal(quick.counts().checks, 2);
  assert.match(JSON.stringify(quick.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Fensterprüfung.*ok/);
  const slow = harness({ checkDelays: [21000, 11000] }); const late = await slow.invoke();
  assert.equal(late.statusCode, 200); assert.equal(slow.counts().checks, 2);
  assert.match(JSON.stringify(slow.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Fensterprüfung.*nicht möglich \(Timeout\)/);
});

test('ein zugemauerter Ruecksprung in der Wand wird verworfen', async () => {
  // Diegos Test vom 20.09., 09:56 (bp-mu9iv1yy-bdzji9): die Nische bei der Dusche war weg.
  const lost = () => checkedInv({ shower: 'back' }, { shower: 'back' }, { wall_element_lost: true });
  const h = harness({ checks: [lost, () => checkedInv({ shower: 'back' }, { shower: 'back' })] });
  const res = await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(res.statusCode, 200);
  const gens = h.calls.filter((call) => call.body?.generationConfig?.responseModalities);
  assert.equal(gens.length, 2);
  assert.match(gens[1].body.contents[0].parts[0].text, /a recess, alcove, niche or step of the wall that is in the photo was filled in/);
  assert.match(gens[0].body.contents[0].parts[0].text, /Never fill a recess, never close an alcove, never tile a niche over flush/);
  const question = h.calls.find((call) => /wall_element_lost/.test(call.body?.contents?.[0]?.parts?.[0]?.text || '')).body.contents[0].parts[0].text;
  assert.match(question, /no longer has because it was filled in/);
  // Colore 20.09., 13:01: der erhaltene Ruecksprung darf nicht als neue Nische gelten.
  assert.match(question, /every wall step that image 1 already has are not new/);
  assert.match(question, /tiles simply end at mid-height with paint above is still a full-height wall/);
});

test('Walk-in: Duschrinne im Prompt, ein Punktablauf wird nur vermerkt', async () => {
  const drain = () => checkedInv({ shower: 'back' }, { shower: 'back' }, { point_drain: true });
  const h = harness({ checks: [drain] });
  const res = await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(res.statusCode, 200); assert.equal(h.counts().generation, 1, 'kein zweites Bild wegen des Ablaufs');
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(prompt, /ALL shower fittings sit together on that short end wall/);
  // Diego, 20.09.: die Rinne wird von den Armaturen aus beschrieben, bei breiter Dusche nie entlang der Rueckwand.
  assert.match(prompt, /The drain starts from the fittings: a linear channel drain \(Duschrinne\) lies in the floor at the foot of the very wall that carries the mixer and the hand shower/);
  assert.match(prompt, /When the shower is wider than it is deep, this drain runs through the full depth of the shower, from the back wall towards the glass panel, that is towards the camera: it is perpendicular to the back wall and never runs along it/);
  assert.doesNotMatch(prompt, /side walls on its left and right/, 'a3: der Satz schob die Armaturen an die Rueckwand');
  assert.match(prompt, /flush with the bathroom floor, with no step, no kerb and no raised platform/);
  assert.match(prompt, /never a central point drain, never a round or square grate/);
  assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Punktablauf statt Duschrinne/);
  // Rinne an der Laengsseite und Armaturen an zwei Waenden: ebenfalls nur Vermerke (Diego, 20.09.).
  const side = harness({ checks: [() => checkedInv({ shower: 'back' }, { shower: 'back' }, { drain_on_long_side: true, shower_fittings_split: true })] });
  const sideRes = await side.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(sideRes.statusCode, 200); assert.equal(side.counts().generation, 1);
  const sideMail = JSON.stringify(side.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  assert.match(sideMail, /Duschrinne an der Längsseite statt an der Schmalseite/);
  assert.match(sideMail, /Duscharmaturen an zwei Wänden statt alle an der Schmalseite/);
  // Die Pruefung nennt nur die Waende (a1: Armaturen links, Rinne hinten), der Code vermerkt die Laengsseite.
  for (const walls of [{ drain_wall: 'back', fittings_wall: 'left' }, { drain_wall: 'back', fittings_wall: 'back', shower_wider_than_deep: true }]) {
    const w = harness({ checks: [() => checkedInv({ shower: 'back' }, { shower: 'back' }, walls)] });
    assert.equal((await w.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }))).statusCode, 200);
    assert.match(JSON.stringify(w.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Duschrinne an der L.ngsseite/);
  }
  const right = harness({ checks: [() => checkedInv({ shower: 'back' }, { shower: 'back' }, { drain_wall: 'left', fittings_wall: 'left', shower_wider_than_deep: true })] });
  await right.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.doesNotMatch(JSON.stringify(right.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /L.ngsseite/);
  // Mit Duschwanne gibt es keine Rinne: kein Vermerk.
  const tray = harness({ checks: [drain] });
  await tray.invoke(payload({ dusche: 'duschwanne', badewanne: 'keine' }));
  assert.doesNotMatch(JSON.stringify(tray.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Punktablauf/);
});

test('Armaturen: Atelier zeigt die Form von Treemme Aurelia in der gewaehlten Oberflaeche', async () => {
  const options = optionsForPackage('atelier');
  assert.equal(options.tapSeries, 'Treemme Aurelia, Unterputz');
  const tile = options.tiles[0];
  const h = harness();
  const res = await h.invoke(payload({
    paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id, kombination: 'einheitlich',
    unterbau: options.bases[0].id, top: options.tops[0].id, becken: options.basinTypes[0].id,
    finish: 'treemme-ottone-spazzolato', keramik: options.sanitary[0].id,
    wall: options.walls[0].id, dusche: options.showers[0].id, badewanne: options.bathtubs[0].id,
    waschtisch: options.basins[0].id, spiegel: options.mirrors[0].id,
  }));
  assert.equal(res.statusCode, 200, `unexpected status ${res.statusCode}: ${JSON.stringify(res.body).slice(0, 200)}`);
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(prompt, /Treemme Aurelia fittings in brushed brass/);
  assert.match(prompt, /rectangular wall plate .*spout with flat facets .*flat paddle lever hanging straight down/);
  assert.match(prompt, /round overhead shower .*finely ribbed .*blade-shaped wall arm .*stick hand shower/);
  // Die Treemme-Produktfotos gehen als letzte Vorlage mit, nur fuer die Form.
  const parts = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
  const tapsImage = parts.filter((part) => part.inlineData).length;
  assert.match(prompt, new RegExp(`Image ${tapsImage} is ONLY a product photo of the tap fittings`));
  assert.deepEqual(options.finishes.map((finish) => finish.id), ['treemme-cromo', 'treemme-nero-opaco', 'treemme-oro-spazzolato', 'treemme-nichel-spazzolato',
    'treemme-oro-rosa-spazzolato', 'treemme-nichel-lucido', 'treemme-oro', 'treemme-nero-cromo-lucido', 'treemme-nero-cromo-spazzolato', 'treemme-ottone-spazzolato']);
  // Lead und Kundenmail nennen die Serie.
  const mails = h.calls.filter((call) => call.url === 'https://api.resend.com/emails');
  assert.ok(mails.length >= 1);
  for (const mail of mails) assert.match(JSON.stringify(mail.body), /Ottone Spazzolato \(Messing gebürstet\), Treemme Aurelia, Unterputz/);
});

test('Armaturen: Essenza zeigt die Form von Treemme Up+, nicht irgendeine Armatur', async () => {
  const h = harness(); await h.invoke();
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(prompt, /Treemme Up\+ fittings in polished chrome .*thin stick lever on top and a round tube spout/);
  // Aufputz: am Waschtisch die Standarmatur, in der Dusche der sichtbare Mischer (Diego, 20.09.).
  assert.match(prompt, /mixer standing on the washbasin or its countertop/);
  assert.match(prompt, /exposed wall mixer that stands clearly out from the tiles.*never a flat concealed plate/);
  assert.doesNotMatch(prompt, /product photo of the tap fittings/);
});
