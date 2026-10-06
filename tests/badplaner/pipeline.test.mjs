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
const aurelia = await import(moduleUrl('server/badplaner/aurelia.js'));
const up = await import(moduleUrl('server/badplaner/up.js'));
const ran = await import(moduleUrl('server/badplaner/ran.js'));
const wc = await import(moduleUrl('server/badplaner/wc.js'));
const spiegel = await import(moduleUrl('server/badplaner/spiegel.js'));
const modul = await import(moduleUrl('server/badplaner/sanitaermodul.js'));
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
  // Die meisten Tests pruefen einen Kandidaten pro Durchgang, damit ihre Folge von Bildern und Pruefungen lesbar bleibt;
  // die Auswahl aus zwei Bildern (Standard seit dem 27.09.) hat eigene Tests.
  const handler = createHandler({ fetch, clock, sleep: async (milliseconds) => { clock.advance(milliseconds); }, env: { GEMINI_API_KEY: 'fake-not-a-key', RESEND_API_KEY: 'fake-not-a-key', BADPLANER_CANDIDATES: '1', BADPLANER_PRODUCT_PASS: '0', ...settings.env }, newId: () => `bp-fixture-${++ids}` });
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
      // P3 und P5: im Foto ein Wand-WC mit Platte, kein Aufputzkasten; das Modul steht hinter dem WC, die alte Platte geht weg.
      // Ein Muretto, an dem das WC haengt, bleibt (Diego, 17.09.): das Modul steht vor ihm.
      assert.match(prompt, /the old surface-mounted cistern with its casing, or the old flush plate, is removed completely; behind the toilet, in front of the wall or low wall it hangs on, stands the sanitary module/);
      // P3 vom 26.09.: das Modul halb in der Wand, mit einer Platte statt des Knopfs im Glas. P3 der sechsten Probe: nur
      // 2 cm vor der Wand; P5: ein Glaspaneel ohne Knopf.
      // Gegenpruefung vom 27.09.: "panel" las das Modell als duenne Scheibe; der Knopf ist eine liegende Pille mit + und -.
      assert.match(prompt, /stands the sanitary module of image \d: a factory-made box about 50 cm wide, 115 cm high and 11 cm deep, standing on the floor with its back against that wall, so that its opaque white glass front in two parts stands 11 cm in front of it and its brushed steel side, 11 cm wide, is clearly visible; near the top of the upper glass a small horizontal pill-shaped steel push button with a plus and a minus; no flush plate, never sunk into the wall, not tiled or boxed in/);
      // Die Wahl des Kunden entscheidet (Diego, 26.09.): keine Bedingung "nur eine Platte im Foto" mehr, die das Modell falsch las.
      assert.doesNotMatch(prompt, /only a flush plate|no module is added/);
      assert.match(prompt, /stands the sanitary module of image \d: a factory-made box/);
      assert.match(prompt, /about 50 cm wide, 115 cm high and 11 cm deep/);
      // P3 vom 26.09.: eine Platte oben auf dem Modul, zur Wand hin. Der Knopf sitzt in der Glasfront (OLI QR Sospeso).
      assert.match(prompt, /pill-shaped steel push button with a plus and a minus; no flush plate, never sunk into the wall, not tiled/);
      // P4 und P8 vom 26.09.: ein WC wie das alte. Das neue WC geht als Bild mit (Glam Twist 5203/TW).
      // P1 vom 26.09.: von der Seite ein WC wie das alte. Die Form des Glam Twist steht jetzt auch im Text.
      assert.match(prompt, /the toilet is the new toilet of image \d+ with its flat, squared back, rounded only at the front, never shaped like the old one, wall-hung and rimless in .*hangs on the module at exactly the old toilet position/);
      assert.doesNotMatch(prompt, /new flush plate/);
      // Ein Holzsitz auf weisser Keramik war einer der Befunde vom 16.09.
      assert.match(prompt, /with seat and lid in the same .*, not wood/);
      assert.match(prompt, /the wall behind stays where it is/);
      // Das Modul steht an der Wand dahinter: die Pruefung darf es nicht als eigene Wand lesen.
      assert.match(checkPrompt, /a pre-wall or a sanitary module directly behind the toilet belongs to the wall it stands in front of/);
      assert.match(checkPrompt, /a flat glass sanitary module behind the toilet and the line where tiles end on a flat wall are not wall elements/);
      // Duschwanne und Walk-in (26.09.): die Pruefung erkennt die Wanne am Aussehen, auch in der Farbe des WC.
      assert.match(checkPrompt, /Set shower_floor_after to what the floor inside the shower of image 2 is: "tray" for a shower tray, raised or level with the floor: a separate smooth plate that looks different/);
      assert.match(checkPrompt, /a shower tray level with the floor tiles is not raised/);
      assert.match(checkPrompt, /a small round drain is not a channel drain/);
    } else {
      assert.match(prompt, /the cistern stays hidden in the wall where it is, and no sanitary module is added/);
      // Diegos Befund vom 17.09.: das WC haengt an einem Muretto, das die Spuelkasten
      // traegt. Das Modell hat es eingeebnet und das WC an die Wand dahinter geschoben.
      assert.match(prompt, /that low wall stays with the same place, length, height and depth, only newly tiled/);
      assert.match(prompt, /the toilet is not pushed back to the wall behind/);
      // 19.09.: "often has a shelf on top" hat bei einer flachen Wand ein Muretto mit Ablage erzeugt.
      assert.doesNotMatch(prompt, /shelf on top/);
      assert.match(prompt, /A toilet on a flat full-height wall stays on that flat wall, which is only newly tiled/);
      // Unterputz: die neue Platte OLI Blink in der Oberflaeche der Armaturen (Diego, 26.09.). Sechste Probe: in allen
      // Bildern eine Platte wie von Geberit, mit einem grossen und einem kleinen Knopf (Ausschnitt von Diego).
      // Gegenpruefung vom 27.09.: beschrieben wird die Platte aus dem Bild, nicht die von Geberit, die nicht kommen soll.
      assert.match(prompt, /its old flush plate is replaced, at the same place on the wall, by a new flat rectangular flush plate in polished chrome, wider than high, with two equal round solid metal knobs about 3 cm across that stand slightly out of it side by side at mid-height, the gap between them a little wider than one knob, a small plus just below the left one and a small minus just below the right one, and nothing else on the plate/);
      assert.doesNotMatch(prompt, /one big and one small/);
      assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Betätigungsplatte.{0,80}OLI Blink/);
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
  assert.match(generation.body.contents[0].parts[0].text, /Treemme Ran fittings in matte black, round bodies with flat blade-shaped parts: at the washbasin a tall slender round column .*thin flat blade spout of rectangular section/);
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
  assert.match(generation.body.contents[0].parts[0].text, /this is a guest WC: it has no shower, shower tray, shower controls, bathtub or bath filler/);
  assert.match(checker.body.contents[0].parts[0].text, /name the wall each sanitary fixture stands against/);
});

test('shower prompt tiles the full tray or sloped-floor perimeter to the ceiling', async () => {
  const h = harness({ checks: [() => checkedInv({}, { shower: 'back' })] });
  const res = await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine', wall: 'halbhoch' }));
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  // Nur "shower floor": "tray or sloped tiled floor" nannte beiden Duscharten die andere (Gegenpruefung vom 26.09.).
  const prompt = generation.body.contents[0].parts[0].text;
  assert.match(prompt, /around the entire perimeter of the shower floor is continuously tiled/);
  // P2 vom 26.09.: das Glas reichte bis zur Decke. P5 und P9 der sechsten Probe: ohne den Satz zu den Platten endeten sie
  // auf der Hoehe des Glases, darueber weiss (Ausschnitt von Diego).
  assert.match(prompt, /A fixed clear glass panel about 2 m high, with open space between its top and the ceiling; the shower walls behind and beside it stay tiled all the way up to the ceiling/);
  assert.doesNotMatch(prompt, /shower-floor perimeter is tiled/);
  // Ohne Wanne kein Satz zum Wannenbereich, ohne Dusche keiner zur Dusche (Gegenpruefung vom 26.09.: P4, P7).
  assert.doesNotMatch(prompt, /bathtub wet area/);
  const bath = harness({ checks: [() => checkedInv({}, { bathtub: 'back' })] });
  assert.equal((await bath.invoke(payload({ dusche: 'keine', badewanne: 'einbau', wall: 'halbhoch' }))).statusCode, 200);
  const bathPrompt = bath.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(bathPrompt, /every wall surface in the bathtub wet area is also tiled all the way up to the ceiling/);
  assert.doesNotMatch(bathPrompt, /inside the shower, every wall surface/);
  const guest = harness();
  assert.equal((await guest.invoke(payload({ raum: 'gaeste-wc', dusche: '', badewanne: '', waschtisch: 'einzel', wall: 'halbhoch' }))).statusCode, 200);
  assert.doesNotMatch(guest.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text, /inside the shower, every wall surface|bathtub wet area/);
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
  assert.match(prompt, /the bidet, if image 1 has one: its place is finished like the rest of the room, with nothing standing there/);

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
  assert.match(JSON.stringify(leadMail.body), /Bild 1 verworfen \(an opening was added or lost.*Bild 2 ok/);
});

test('der Prompt ist eine Bearbeitung, keine Neuzeichnung', async () => {
  const h = harness();
  await h.invoke();
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  // 19.09.: aus Diegos engem Bad wurde ein Ausstellungsbad mit anderer Kamera und
  // einem Fenster. Zuerst steht, was das Ergebnis ist.
  assert.match(prompt, /^PHOTO EDITING TASK, not a design task\. Image 1 is a photograph of the customer's existing bathroom\. The result is that same photograph after the renovation/);
  assert.match(prompt, /Do not design a new bathroom and do not show a showroom/);
  assert.match(prompt, /Image 1 shows NO window and no roof window: the result must not contain any window or glass opening at all, every wall stays a solid wall\./);
  // 25.09.: mit der gekuerzten Fassung zeichnete das Modell P2 und P5 aus einer anderen Kamera; der Wortlaut der Website hielt sie.
  assert.match(prompt, /This is an edit of image 1, not a new picture\. Keep image 1 and change only what the CHANGE list names/);
  assert.match(prompt, /Never zoom out, never widen the view, never show floor, wall or ceiling beyond the edges of image 1, never create extra floor area/);
  assert.match(prompt, /every window, roof window and door at its exact size and position/);
  // P4 und P5 vom 25.09.: ohne den Abgleich am Schluss kam bei "keine Fenster" ein Fenster dazu.
  assert.match(prompt, /BEFORE YOU DRAW, compare with image 1: the same viewpoint and framing, the same walls and ceiling, no window at all, the same door and, at the edge of the picture, the same door leaf or frame in the foreground if image 1 has one, every fixture where image 1 has it/);
  assert.match(prompt, /never show more of the room than image 1 shows\.$/);
  assert.match(prompt, /Photorealistic, bright, even light, no people/);
  assert.doesNotMatch(prompt, /daylight/);
  assert.match(prompt, /KEEP THE POSITIONS\. .*Every fixture keeps the wall or low wall it stands against in image 1 and its place along it, measured against the corners, the door and the window next to it\. .*The washbasin keeps its wall and its place/);
  // Ein Muretto ist Raum, keine Einrichtung: es bleibt stehen.
  assert.match(prompt, /A half-height wall, a low built wall or a boxed pre-wall that a fixture stands against is part of the room, not furniture: it keeps its place, its length, its height and its depth, and the fixture stays mounted on it/);
  // Die Duscharmatur stand ueber dem WC statt in der Dusche. Der Satz steht nur mit Dusche (26.09.).
  assert.doesNotMatch(prompt, /All shower fittings sit together/);
  const withShower = harness();
  await withShower.invoke(payload({ dusche: 'walk-in' }));
  assert.match(withShower.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text,
    /All shower fittings sit together on one wall inside the shower area, never next to the toilet or the washbasin/);
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
  // Qualitaet vor Ersparnis: das Bild ist das Produkt. 2K kostet bei diesem Modell gleich viel wie 1K. Flash war vom
  // 27.09. an kurz der Standard; in der Probe auf der Vorschau fand Diego es schlechter (1 von 5 Bildern zeigbar).
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

test('rutscht das WC an seiner Wand nach hinten, steht es als Hinweis in der Lead-Mail', async () => {
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
  // Seit dem 25.09. nur ein Hinweis: "am naechsten" liest die Pruefung oft unsicher.
  const h = harness({ checks: [shifted] });
  const res = await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(res.statusCode, 200);
  assert.equal(h.counts().generation, 1);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /Hinweis: in the photo the toilet is closest to the camera, in the result the washbasin/);
});

test('ein verschwundenes Muretto unter dem WC steht als Hinweis in der Lead-Mail', async () => {
  // Diegos Befund vom 17.09.: das WC haengt rechts neben der Tuer an einem niedrigen
  // Mauerstueck, das die Spuelkasten traegt. Das Modell hat das Mauerstueck eingeebnet
  // und das WC an die Wand dahinter geschoben. Wand, Reihenfolge und Tiefe bleiben
  // dabei gleich, also merkt es keine der anderen Pruefungen.
  const flattened = () => checkedInv({ toilet: 'right' }, { toilet: 'right' },
    { toilet_on_low_wall_before: true, toilet_on_low_wall_after: false });
  const h = harness({ checks: [flattened] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(h.counts().generation, 1);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /Hinweis: the low wall the toilet stood against is gone/);
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
  // Der ganze erste Prompt geht wieder mit, dazu der Grund der Ablehnung.
  assert.ok(retryPrompt.startsWith(generations[0].body.contents[0].parts[0].text));
  assert.match(retryPrompt, /A previous attempt failed the check because the toilet moved from the left wall to the right wall\. Start again from image 1 and correct exactly that/);
  assert.match(retryPrompt, /The vanity unit is not loose furniture and stays/);
  assert.match(retryPrompt, /Whatever is built in the immediate foreground at the edge of image 1/);
});

test('eine verschwundene Tuer im Vordergrund zaehlt nicht: kein Hinweis, kein zweiter Versuch', async () => {
  // Probe vom 17.09.: im Foto steht links vorne der offene Tuerfluegel und nimmt ein
  // Viertel des Bildes ein. Im Ideenbild ist er weg, das Modell hat die Kamera gedreht.
  // Diego, 27.09.: die Tuer ist kein Grund fuer einen zweiten Versuch (fuenfte Probe: drei von sieben zweiten Versuchen).
  // Diego, 04.10.: "la porta non è importante anche se scompare; importanti sono le finestre".
  const turned = () => checkedInv({}, {}, { foreground_object_before: true, foreground_object_after: false, view_changed: true, reason: 'camera turned to the right' });
  const h = harness({ checks: [turned] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(h.counts().generation, 1);
  const mail = JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  assert.match(mail, /Fensterprüfung.{0,80}ok, Bildausschnitt verändert: camera turned to the right</);
  assert.doesNotMatch(mail, /Hinweis|door leaf|Mangel im gezeigten Bild/);
  // Auch als Oeffnung zaehlt eine fehlende Tuer nicht; ein Fenster schon.
  const question = h.calls.map((call) => call.body?.contents?.[0]?.parts?.[0]?.text || '').find((text) => text.includes('Set extra_openings'));
  assert.match(question, /or lost one that image 1 has; a window that now stands on a different wall than in image 1 counts as lost and added; a door of image 1 that is gone in image 2 does not count\./);
  // Fehlt nur die Tuer, Kamera und Waende gleich, ist es kein anderer Bildausschnitt; ein echter bleibt einer.
  assert.match(question, /Set view_changed true if camera position, angle, lens or framing changed, or if image 2 shows floor, wall or ceiling area that lies outside image 1\. A door leaf or door frame of image 1 that is missing or smaller in image 2 does not count, nor does the floor or wall it covered in image 1: if that is the only difference and the camera, the walls and the edges of the picture are the same, view_changed stays false\./);
  const onlyDoor = harness({ checks: [() => checkedInv({}, {}, { foreground_object_before: true, foreground_object_after: false, view_changed: false })] });
  assert.equal((await onlyDoor.invoke()).statusCode, 200);
  assert.equal(onlyDoor.counts().generation, 1);
  const onlyDoorMail = JSON.stringify(onlyDoor.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  assert.match(onlyDoorMail, /Fensterprüfung.{0,80}>ok</);
  assert.doesNotMatch(onlyDoorMail, /Bildausschnitt|Hinweis|door/);
});

test('die Wahl des Kunden wird abgelesen: ein leichter Unterschied steht als Hinweis in der Mail, ein schwerer kostet einen zweiten Durchgang', async () => {
  // Diego, 25.09. (Punkt c): Proben mit Einbau- statt freistehender Wanne, Kopfbrause ohne Dusche, einem Becken
  // statt zwei und dem alten Spiegel. Das Bild kommt trotzdem; wir sehen, wie oft es vorkommt. Seit dem 27.09. (sechste
  // Probe, P7: alter Spiegel, und das Bild ging an den Kunden) loest, was der Kunde sofort sieht, einen zweiten Durchgang aus.
  const atelier = optionsForPackage('atelier');
  const tile = atelier.tiles[0];
  const choice = payload({ paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id, kombination: 'einheitlich',
    unterbau: atelier.bases[0].id, top: atelier.tops[0].id, becken: 'einbau', finish: atelier.finishes[0].id,
    keramik: atelier.sanitary[0].id, wall: atelier.walls[0].id, dusche: 'keine', badewanne: 'freistehend',
    waschtisch: 'doppel', spiegel: 'spiegelschrank' });
  let retryPrompt = '';
  const mailOf = async (answers, generations = 1, status = 200) => {
    const h = harness({ checks: [() => checkedInv({ bathtub: 'back' }, { bathtub: 'back' }, answers)] });
    assert.equal((await h.invoke(choice)).statusCode, status);
    assert.equal(h.counts().generation, generations);
    retryPrompt = h.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1]?.body.contents[0].parts[0].text ?? '';
    return JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  };
  // Bleibt ein schwerer Hinweis auch im zweiten Durchgang, sieht der Kunde das Bild seit dem 04.10. nicht (502); NLD
  // bekommt es mit allen Hinweisen.
  const wrong = await mailOf({ washbasins_after: 1, basin_on_top_after: true, mirror_after: 'mirror', mirror_kept: true,
    bathtub_after: 'built_in', overhead_shower_after: true }, 2, 502);
  assert.match(retryPrompt, /A previous attempt was wrong because the mirror above the washbasin is still the old one of the photo; and because the bathtub is built in, but a freestanding bathtub was chosen; and because there is an overhead shower, but no shower was chosen\. Start again from image 1/);
  assert.doesNotMatch(retryPrompt, /washbasin bowl\(s\)|a flat mirror hangs/);
  // Nur Leichtes: kein zweiter Durchgang.
  assert.match(await mailOf({ washbasins_after: 1, mirror_after: 'mirror' }), /Hinweis: 1 washbasin bowl\(s\), but a double washbasin was chosen/);
  for (const hint of [/1 washbasin bowl\(s\), but a double washbasin was chosen/,
    /the washbasin is a bowl standing on the countertop, but a basin set into the top was chosen/,
    /a flat mirror hangs above the washbasin, but a mirror cabinet was chosen/,
    /the mirror above the washbasin is still the old one of the photo/,
    /the bathtub is built in, but a freestanding bathtub was chosen/,
    /there is an overhead shower, but no shower was chosen/]) assert.match(wrong, hint);
  const right = await mailOf({ washbasins_after: 2, basin_on_top_after: false, mirror_after: 'cabinet', mirror_kept: false,
    bathtub_after: 'freestanding', overhead_shower_after: false });
  assert.match(right, /Fensterprüfung.{0,80}>ok</);
  assert.doesNotMatch(right, /was chosen|old one of the photo/);
  // Ein unlesbarer Wert zaehlt nicht, die Pruefung bleibt gueltig.
  assert.doesNotMatch(await mailOf({ mirror_after: 'big', washbasins_after: 'two' }), /nicht möglich|was chosen/);
});

test('ein Fenster, das viel groesser wird, steht als Hinweis in der Lead-Mail', async () => {
  // Dasselbe Bild von aussen gemessen: das Fenster nimmt im Ideenbild viel mehr Platz
  // ein als im Foto, die Kamera ist also naeher herangegangen.
  const zoomed = () => checkedInv({}, {}, { window_much_bigger: true });
  const h = harness({ checks: [zoomed] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(h.counts().generation, 1);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /Hinweis: the window takes up much more of the result than of the photo/);
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
  // Ein loses Moebel vorne soll weg (Jonathan, 25.09.): es zaehlt nicht als Vordergrund.
  assert.match(question, /an open door leaf, a door frame or the near edge of a wall; loose furniture does not count/);
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
  assert.match(prompt, /Whatever is built in the immediate foreground at the edge of image 1 belongs to the picture and stays: an open door leaf, a door frame, the edge of a wall\. It keeps its place and takes up the same part of the picture as before, and is never removed to show more of the room/);
  // Jonathan am 25.09.: der lose Schrank vorne sollte bleiben und zugleich weg. Er geht, die Kamera bleibt.
  assert.match(prompt, /A loose piece of furniture at the edge is removed like all loose furniture: .*the camera stays exactly where it is/);
  assert.match(prompt, /loose furniture, also a cabinet or shelf cut off at the edge of the picture/);
  assert.match(prompt, /the same door and, at the edge of the picture, the same door leaf or frame in the foreground if image 1 has one/);
  // P5 vom 25.09.: "Keep the radiators" brachte einen Heizkoerper, den das Foto nicht hat.
  assert.match(prompt, /a radiator only where image 1 has one/);
  assert.match(prompt, /Every window keeps the same share of the picture it has in image 1/);
  // "Loose furniture is gone" hat im Gaeste-WC den Waschtischunterbau mitgenommen.
  assert.match(prompt, /The vanity unit is not loose furniture and stays/);
  // P3 vom 25. und 26.09.: der Waschtisch am linken Bildrand wanderte zweimal an die rechte Wand, kein Bild.
  assert.match(prompt, /The vanity unit is not loose furniture and stays, even when cut off at the edge of the picture\./);
  // P2 vom 26.09.: die alte Brausestange ueber der Wanne kam als Duschsaeule wieder.
  assert.match(prompt, /the old shower curtain and its rail; the old shower fittings and their slide rail;/);
  assert.doesNotMatch(prompt, /Loose furniture, clutter/);
});

test('ein erhaltenes Muretto ist kein Fehler', async () => {
  const h = harness({ checks: [() => checkedInv({ toilet: 'right' }, { toilet: 'right' },
    { toilet_on_low_wall_before: true, toilet_on_low_wall_after: true })] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
});

test('ein neues Muretto, eine Ablage oder eine Nische steht als Hinweis in der Lead-Mail', async () => {
  // Diegos Test vom 19.09.: flache, raumhoch geplattete Wand, Spuelplatte buendig, im
  // Ideenbild ein halbhohes Muretto mit Ablage hinter Waschtisch, WC und Dusche.
  // Je Antwort ein eigener Satz (P4 der sechsten Probe: der Hinweis stand in der Mail, im Bild war nichts).
  for (const [flags, hint] of [
    [{ new_wall_element: true }, /Hinweis: a low wall, ledge, shelf or niche that is not in the photo was added/],
    [{ toilet_on_low_wall_before: false, toilet_on_low_wall_after: true }, /Hinweis: the toilet now stands against a low wall or boxed pre-wall that is not in the photo/],
  ]) {
    const added = () => checkedInv({ toilet: 'right' }, { toilet: 'right' }, flags);
    const h = harness({ checks: [added] });
    const res = await h.invoke();
    assert.equal(res.statusCode, 200);
    assert.equal(h.counts().generation, 1);
    const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
    assert.match(JSON.stringify(leadMail.body), hint);
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
  // dieselbe haben), Sanitärmodul, Armaturen: das Modul kommt vor den Armaturen.
  const options = optionsForPackage('essenza');
  const vanity = new Set([options.tops[0].image, options.bases[0].image]).size;
  const images = parts.filter((part) => part.inlineData);
  assert.equal(images.length, 2 + vanity + 4); // dazu der neue Spiegel und das neue WC
  const module = images[images.length - 3].inlineData;
  assert.equal(module.mimeType, 'image/jpeg');
  // Ein echtes JPEG, kein Platzhalter: Base64 eines Bildes von einigen Kilobyte.
  assert.ok(module.data.startsWith('/9j/'), 'module image is not a JPEG');
  assert.ok(module.data.length > 2000, `module image too small: ${module.data.length}`);
  const prompt = parts[0].text;
  assert.match(prompt, new RegExp(`Image ${images.length - 2} is only a product photo of the sanitary module`));
  assert.match(prompt, new RegExp(`stands the sanitary module of image ${images.length - 2}:`));
  assert.match(prompt, new RegExp(`Image ${images.length - 1} is only a product photo of the new toilet bowl: copy its shape, not its colour`));
  assert.equal(images[images.length - 2].inlineData.data, wc.WC_PHOTO.data);
  // Ohne Dusche (Standardauswahl) nur die Waschtischarmatur.
  assert.match(prompt, new RegExp(`Image ${images.length} is only a product photo of the washbasin tap`));
  assert.match(prompt, /not tiled or boxed in/);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /OLI QR INOX Sospeso/);
});

test('the module image needs no network call and none is made for it', async () => {
  const h = harness();
  const res = await h.invoke(payload({ cistern: 'aufputz' }));
  assert.equal(res.statusCode, 200);
  assert.equal(h.calls.filter((call) => call.url.includes('oli-world')).length, 0);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  // Plattenmuster fehlt hier (404), Modul und Armaturen sind trotzdem dabei: Foto + Modul + Armaturen.
  assert.equal(generation.body.contents[0].parts.filter((part) => part.inlineData).length, 5); // Spiegel, Modul, WC, Armaturen
  assert.match(generation.body.contents[0].parts[0].text, /Image 3 is only a product photo of the sanitary module/);
});

test('Unterputz carries no module image and forbids a module in front of the wall', async () => {
  const h = harness();
  const res = await h.invoke(payload({ cistern: 'unterputz' }));
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  // Foto, Spiegel, WC und Armaturen, kein Modul. Die Platte OLI Blink im ersten Durchgang nur als Text: ihr Bild ergab in
  // P2, P4, P7 und P8 der fuenften Probe trotzdem eine Platte wie von Geberit. Ihr Bild kommt im Produktdurchgang.
  assert.equal(generation.body.contents[0].parts.filter((part) => part.inlineData).length, 4);
  const prompt = generation.body.contents[0].parts[0].text;
  assert.doesNotMatch(prompt, /product photo of the sanitary module|product photo of the new flush plate/);
  assert.match(prompt, /its old flush plate is replaced, at the same place on the wall, by a new flat rectangular flush plate in polished chrome, wider than high, with two equal round solid metal knobs about 3 cm across that stand slightly out of it side by side at mid-height, the gap between them a little wider than one knob, a small plus just below the left one and a small minus just below the right one, and nothing else on the plate/);
  assert.match(prompt, /no sanitary module is added/);
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
  assert.ok(prompt.includes(`the basin in the same ${coloured.prompt} as the toilet`),
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
  // Dieselbe Datei wird einmal geladen und einmal mitgeschickt: Foto, Platte, Diamante, dazu die Armaturen Up+.
  assert.equal(h.calls.filter((call) => call.url.endsWith(top.image)).length, 1);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  assert.equal(generation.body.contents[0].parts.filter((part) => part.inlineData).length, 6); // dazu das WC
  const prompt = generation.body.contents[0].parts[0].text;
  assert.match(prompt, /Image 3 is only a colour sample for the whole vanity unit: its front, its body and its countertop/);
  assert.ok(prompt.includes(`countertop in ${top.prompt} in the colour and finish of image 3`), 'Platte ohne Verweis auf ihr Muster');
  assert.ok(prompt.includes(`front and body in ${base.prompt} in the colour and finish of image 3`), 'Unterbau ohne Verweis auf sein Muster');
  assert.match(prompt, /the countertop is its own material, not cut from the wall or floor tiles/);
  // Weisse Keramik: keine Farbregel, der Waschtisch bleibt beim Muster (Diego, 04.10.).
  assert.equal(options.sanitary[0].id, 'weiss');
  assert.doesNotMatch(prompt, /Colours per object|warm white|petrol/);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /Platte geladen, Waschtisch geladen/);
});

test('P5: bei farbiger Keramik ist der Waschtisch Diamante warm white, die Keramikfarbe tragen nur WC, Becken und Duschwanne', async () => {
  // farbe-p5 vom 04.10.: mit diesen drei Saetzen 3 von 3 Waschtischen weiss, vorher 0 von 4 (petrol, grau-taupe); Diego, 04.10.
  const options = optionsForPackage('colore');
  const image = () => new Response(Buffer.from(PNG, 'base64'), { status: 200, headers: { 'content-type': 'image/png' } });
  const p5 = { paket: 'colore', format: '60x120', platte: 'energieker-calacatta-viola-calacatta-viola', unterbau: 'edone-laccato-diamante',
    top: 'edone-stone-color-diamante', becken: 'aufsatz', armaturenserie: 'treemme-up', finish: 'treemme-cromo', keramik: 'scarabeo-ocean',
    wall: 'halbhoch', dusche: 'duschwanne', badewanne: 'keine', waschtisch: options.basins[0].id, spiegel: options.mirrors[0].id, cistern: 'aufputz' };
  const shower = () => checkedInv({ shower: 'back' }, { shower: 'back' });
  const run = async (changes = {}, env = {}) => {
    const h = harness({ swatch: () => image(), env, checks: [shower, shower, shower] });
    assert.equal((await h.invoke(payload({ ...p5, ...changes }))).statusCode, 200);
    return h.calls.filter((call) => call.body?.generationConfig?.responseModalities).map((call) => call.body.contents[0].parts[0].text);
  };
  const [prompt] = await run();
  assert.ok(prompt.includes('Image 3 is only a colour sample for the whole vanity unit, a warm white: its front, its body and its countertop all take this warm white.'));
  assert.ok(prompt.includes('front and body in matte lacquered vanity unit (Diamante) in the warm white colour and finish of image 3, countertop in matte mineral stone-resin washbasin top (Diamante) in the same warm white colour and finish of image 3,'));
  assert.ok(prompt.includes('in the same polished chrome finish. Colours per object: petrol blue matte ceramic only for the toilet with its seat and lid, the washbasin bowl and the shower tray; the vanity front, body and countertop are warm white like image 3, never petrol blue, grey or beige.'));
  // Die Regel folgt der Wahl: eine andere farbige Keramik, ohne Duschwanne.
  const [slate] = await run({ keramik: 'scarabeo-ardesia', dusche: 'walk-in' });
  assert.ok(slate.includes('Colours per object: slate grey matte ceramic only for the toilet with its seat and lid and the washbasin bowl; the vanity front, body and countertop are warm white like image 3, never slate grey, grey or beige.'));
  assert.doesNotMatch(slate, /petrol|shower tray;/);
  // Weisse Keramik oder ein anderer Waschtisch: der Prompt bleibt wie bisher.
  for (const changes of [{ keramik: 'weiss' }, { unterbau: 'edone-laccato-panna', top: 'edone-stone-color-panna' }]) {
    const [unchanged] = await run(changes);
    assert.doesNotMatch(unchanged, /Colours per object|warm white/, JSON.stringify(changes));
    assert.match(unchanged, /Image 3 is only a colour sample for the whole vanity unit: its front, its body and its countertop\./);
  }
  // Nur der erste Auftrag: der Produktdurchgang bleibt unveraendert.
  const prompts = await run({}, { BADPLANER_PRODUCT_PASS: undefined });
  const product = prompts.find((text) => text.startsWith('PRODUCT EDIT'));
  assert.ok(product, 'Produktdurchgang lief nicht');
  assert.doesNotMatch(product, /Colours per object|warm white/);
});

test('Disposition: nur wo die Vorpruefung die Anordnung von P5 liest, nennt der erste Auftrag Waschtisch und WC an der rechten Wand', async () => {
  // A/B blind 6+6 vom 04.10.: P5 (Wanne hinten, Waschtisch und WC rechts, Modul) Raum richtig 5 von 6 mit dem Satz, 3 von 6
  // ohne; an der linken Wand (P3) machte ein Satz es schlechter. Lesungen wie am Pruefstand; P2 und P5 haben dasselbe Foto.
  const reading = (walls, order, nearest, extra) => () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv(walls), order, nearest, ...extra }));
  const first = async (photo, cistern, dusche = 'duschwanne') => {
    const h = harness({ photoChecks: [photo] });
    await h.invoke(payload({ cistern, dusche, badewanne: 'keine' }));
    return h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  };
  const p5 = { toilet: 'right', washbasin: 'right', bathtub: 'back' };
  const across = { shower_back: 'along', shower_left: true, shower_right: true, basin_beside_end: true };
  const tubLeft = { ...p5, bathtub: 'left' };
  const end = { shower_back: 'end', shower_left: true, basin_beside_end: false };
  // P5: der Satz der Variante B, Zeichen fuer Zeichen, an seinem Platz.
  assert.ok((await first(reading(p5, ['bathtub', 'washbasin', 'toilet'], 'toilet', across), 'aufputz')).includes('The washbasin keeps its wall and its place. On the right wall, from the back corner towards the camera: first the washbasin, then the toilet; they never change places, and the toilet stays at the front where image 1 has it, even where the edge of the picture cuts it and its sanitary module off. A bathtub'));
  // Kein Satz: P5 mit Gefaelledusche statt Duschwanne (nicht im Bild geprueft); P2 (dasselbe Foto ohne Modul); P7 (Wanne
  // links, gelesen mit der Wanne oder dem WC vorne); P3 (linke Wand); ein Bidet an der Wand; das WC hinten, der Waschtisch vorne.
  for (const [photo, cistern, dusche] of [
    [reading(p5, ['bathtub', 'washbasin', 'toilet'], 'toilet', across), 'aufputz', 'walk-in'],
    [reading(p5, ['bathtub', 'washbasin', 'toilet'], 'toilet', across), 'unterputz'],
    [reading(tubLeft, ['bathtub', 'washbasin', 'toilet'], 'bathtub', end), 'aufputz'],
    [reading(tubLeft, ['bathtub', 'washbasin', 'toilet'], 'toilet', end), 'aufputz'],
    [reading({ shower: 'back' }, ['washbasin', 'toilet', 'shower'], 'washbasin', { ...across, basin_beside_end: false }), 'aufputz'],
    [reading({ ...p5, bidet: 'right' }, ['bathtub', 'washbasin', 'bidet', 'toilet'], 'toilet', across), 'aufputz'],
    [reading(p5, ['bathtub', 'toilet', 'washbasin'], 'washbasin', across), 'aufputz'],
  ]) {
    const prompt = await first(photo, cistern, dusche);
    assert.ok(prompt.includes('The washbasin keeps its wall and its place. A'), cistern);
    assert.doesNotMatch(prompt, /from the back corner/);
  }
});

test('ohne ladbares Muster bleibt es bei der Beschreibung, ohne Bildnummer', async () => {
  const h = harness();
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  // Foto und die Vorlagen, die im Code liegen: Spiegel, WC, Armaturen.
  assert.equal(generation.body.contents[0].parts.filter((part) => part.inlineData).length, 4);
  const prompt = generation.body.contents[0].parts[0].text;
  assert.doesNotMatch(prompt, /colour sample for|sample of the countertop/);
  // Essenza mit weisser Keramik: keine Farbregel.
  assert.doesNotMatch(prompt, /Colours per object|warm white|petrol/);
  assert.match(prompt, /not cut from the wall or floor tiles/);
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
  assert.doesNotMatch(generation.body.contents[0].parts[0].text, /the basin in the same .* as the toilet/);
});

test('the toilet keeps its wall, also under a sloping ceiling, and a flat ceiling stays flat', async () => {
  const withCeiling = (ceiling) => () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv(), order: ['washbasin', 'toilet'], nearest: 'toilet', ceiling }));
  const promptFor = async (ceiling) => {
    const h = harness({ photoChecks: [withCeiling(ceiling)] });
    const res = await h.invoke(payload());
    assert.equal(res.statusCode, 200);
    return h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  };
  // Zweimal gesehen: unter der Dachschraege wandert das WC an die gerade Wand.
  const sloped = await promptFor('sloped');
  assert.match(sloped, /The toilet keeps its wall and its place because its drain cannot be moved: under the sloping ceiling it stays under that sloping ceiling/);
  assert.match(sloped, /The ceiling slopes exactly as in image 1, at the same angle and height/);
  // P4 vom 25.09.: aus der flachen Decke eines Gaeste-WCs wurde eine Dachschraege mit Dachfenster.
  const flat = await promptFor('flat');
  assert.match(flat, /The ceiling is flat and horizontal exactly as in image 1: no slope, no attic, no beams and no roof window/);
  assert.doesNotMatch(flat, /sloping ceiling/);
  const unknown = await promptFor('unknown');
  assert.match(unknown, /The ceiling keeps exactly the shape and height it has in image 1: never add a slope, an attic or a roof window/);
});

test('an Unterputz toilet also keeps seat and lid in the ceramic colour', async () => {
  const h = harness();
  const res = await h.invoke(payload({ cistern: 'unterputz' }));
  assert.equal(res.statusCode, 200);
  const generation = h.calls.find((call) => call.body?.generationConfig?.responseModalities);
  assert.match(generation.body.contents[0].parts[0].text, /with seat and lid in the same .*, not wood/);
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
  const second = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWM4ISd3Qk4OAAh3Agn/2+PxAAAAAElFTkSuQmCC';
  const h = harness({ generations: [() => generated(), () => generated(second)], checks: [() => checked(true), () => checked(true)] });
  const res = await h.invoke();
  assert.equal(res.body.code, 'RENDER_REJECTED'); assert.equal(res.statusCode, 502);
  assert.equal(res.body.image, undefined); assert.deepEqual(h.counts(), { generation: 2, checks: 2, mail: 1 });
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /Ideenbild.*abgelehnt \(Prüfung\), nicht angezeigt/);
  assert.match(JSON.stringify(leadMail.body), /Muster/);
  assert.deepEqual(leadMail.body.attachments.map(({ filename }) => filename), ['foto.png', 'verworfen.jpg']);
  // Der zweite, ebenfalls verworfene Versuch ist der, den wir zu sehen bekommen (Gegenpruefung des Codes vom 27.09.:
  // mit der Auswahl aus allen Bildern war es das erste, und der Test merkte es nicht, weil beide gleich waren).
  assert.equal(leadMail.body.attachments[1].content, second);
  // Diego, 25.09.: beide Gruende stehen in der Mail, nicht nur der letzte.
  assert.match(JSON.stringify(leadMail.body), /abgelehnt – Bild 1: an opening was added or lost.* \| Bild 2: an opening was added or lost/);
});

test('second approved result replaces first rejected result', async () => {
  const h = harness({ checks: [() => checked(true), () => checked()] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200); assert.deepEqual(h.counts(), { generation: 2, checks: 2, mail: 2 });
  const retry = h.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1];
  assert.match(retry.body.contents[0].parts[0].text, /A previous attempt failed the check because/);
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

test('zwei Bilder gleichzeitig: gezeigt wird das bessere, nicht das erste', async () => {
  // Diego, 27.09.: "concentriamoci sul risultato, i costi non sono un problema". In der fuenften Probe brauchten
  // 7 von 8 Bildern einen zweiten Durchgang von rund 35 s, zweimal kam gar kein Bild.
  const other = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC';
  const two = { BADPLANER_CANDIDATES: '2' };
  const pair = [() => generated(PNG), () => generated(other)];
  // Die Pruefung antwortet je nach Bild, nicht nach der Reihenfolge der Aufrufe.
  const byImage = (answers) => (init) => answers[JSON.parse(init.body).contents[0].parts.filter((part) => part.inlineData)[1].inlineData.data]();
  const mailOf = (h) => JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  // Ohne Einstellung laufen zwei Bilder.
  const plain = harness({ env: { BADPLANER_CANDIDATES: undefined } });
  assert.equal((await plain.invoke()).statusCode, 200);
  assert.equal(plain.counts().generation, 2);
  // Beide ohne groben Fehler: das mit weniger Hinweisen.
  const lowWall = () => checkedInv({}, {}, { toilet_on_low_wall_before: true, toilet_on_low_wall_after: false });
  const hinted = byImage({ [PNG]: lowWall, [other]: () => checked() });
  const h = harness({ env: two, generations: pair, checks: [hinted, hinted] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(h.counts().generation, 2);
  assert.equal(res.body.image.data, other);
  // Das andere Bild steht mit seinem Hinweis in der Mail, das gezeigte ohne.
  assert.match(mailOf(h), /Bild 1 nicht gezeigt \(Hinweise: the low wall the toilet stood against is gone\), Bild 2 ok/);
  assert.doesNotMatch(mailOf(h), /, Hinweis:/);
  // Eine fehlende Tuer zaehlt nicht (Diego, 04.10.): das Bild ohne Tuer gilt als fehlerlos und wird gezeigt.
  const doorless = byImage({ [PNG]: () => checkedInv({}, {}, { foreground_object_before: true, foreground_object_after: false }), [other]: lowWall });
  const door = harness({ env: two, generations: pair, checks: [doorless, doorless] });
  assert.equal((await door.invoke()).body.image.data, PNG);
  assert.doesNotMatch(mailOf(door), /door leaf/);
  // Gegen einen echten anderen Bildausschnitt gewinnt das Bild, dem nur die Tuer fehlt.
  const framed = byImage({ [PNG]: () => checkedInv({}, {}, { view_changed: true, reason: 'camera moved back' }),
    [other]: () => checkedInv({}, {}, { foreground_object_before: true, foreground_object_after: false, view_changed: false }) });
  const frame = harness({ env: two, generations: pair, checks: [framed, framed] });
  assert.equal((await frame.invoke()).body.image.data, other);
  assert.doesNotMatch(mailOf(frame), /Bildausschnitt verändert/);
  // Eines mit grobem Fehler: das andere, ohne zweiten Durchgang.
  const opening = byImage({ [PNG]: () => checked(true), [other]: () => checked() });
  const one = harness({ env: two, generations: pair, checks: [opening, opening] });
  const oneRes = await one.invoke();
  assert.equal(oneRes.statusCode, 200);
  assert.equal(one.counts().generation, 2);
  assert.equal(oneRes.body.image.data, other);
  assert.match(mailOf(one), /Bild 1 verworfen \(an opening was added or lost.*\), Bild 2 ok/);
  // Beide mit grobem Fehler: ein zweiter Durchgang mit beiden Gruenden, wieder mit zwei Bildern.
  const round1 = byImage({ [PNG]: () => checked(true), [other]: () => checkedInv({}, {}, { windows_before: 0, windows_after: 1 }) });
  const round2 = byImage({ [PNG]: () => checked(), [other]: () => checked(true) });
  const again = harness({ env: two, generations: [...pair, ...pair], checks: [round1, round1, round2, round2] });
  const againRes = await again.invoke(payload({ windows: '0' }));
  assert.equal(againRes.statusCode, 200);
  assert.equal(again.counts().generation, 4);
  assert.equal(againRes.body.image.data, PNG);
  const retryPrompt = again.calls.filter((call) => call.body?.generationConfig?.responseModalities)[2].body.contents[0].parts[0].text;
  assert.match(retryPrompt, /A previous attempt failed the check because an opening was added or lost.*; another one because a window was added/);
  assert.match(mailOf(again), /Bild 1 verworfen \(an opening.*\), Bild 2 verworfen \(a window was added.*\), Bild 4 verworfen \(an opening.*\), Bild 3 ok/);
  // Alle vier mit grobem Fehler: kein Bild, alle Gruende in der Mail.
  const all = harness({ env: two, generations: [...pair, ...pair], checks: Array.from({ length: 4 }, () => () => checked(true)) });
  const allRes = await all.invoke();
  assert.equal(allRes.body.code, 'RENDER_REJECTED');
  assert.equal(all.counts().generation, 4);
  assert.match(mailOf(all), /abgelehnt – Bild 1: an opening.* \| Bild 2: an opening.* \| Bild 3: an opening.* \| Bild 4: an opening/);
  // Liefert der Bilddienst eines nicht, zaehlt das andere.
  const broken = harness({ env: two, generations: [() => response({ error: 'boom' }, 500), () => generated(other)], checks: [() => checked()] });
  const brokenRes = await broken.invoke();
  assert.equal(brokenRes.statusCode, 200);
  assert.equal(brokenRes.body.image.data, other);
  assert.match(mailOf(broken), /Bild 1: Bilddienst: HTTP 500, Bild 2 ok/);
  // Liefert er keines, bleibt der Lead ohne Bild.
  const down = harness({ env: two, generations: [() => response({ error: 'boom' }, 500), () => response({ error: 'boom' }, 500)] });
  const downRes = await down.invoke();
  assert.equal(downRes.body.code, 'RENDER_FAILED');
  assert.match(mailOf(down), /Bilddienst: HTTP 500 \| HTTP 500/);
});

test('zwei Bilder: geprueft vor ungeprueft vor verworfen, im zweiten Durchgang das bessere, ohne Pruefung nur eines', async () => {
  // Gegenpruefung vom 27.09.: diese Faelle liess die Testreihe durch, auch wenn die Auswahl falsch war.
  const other = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC';
  const two = { BADPLANER_CANDIDATES: '2' };
  const pair = [() => generated(PNG), () => generated(other)];
  const byImage = (answers) => (init) => answers[JSON.parse(init.body).contents[0].parts.filter((part) => part.inlineData)[1].inlineData.data]();
  const mailOf = (h) => JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  const busy = () => response({ error: 'busy' }, 503);
  // Ungeprueft gegen geprueft mit einem Hinweis: das gepruefte (ohne Hinweis waere es sofort gezeigt worden).
  const lowWall = () => checkedInv({}, {}, { toilet_on_low_wall_before: true, toilet_on_low_wall_after: false });
  const unchecked = harness({ env: two, generations: pair, checks: [byImage({ [PNG]: busy, [other]: lowWall }), byImage({ [PNG]: busy, [other]: lowWall }), busy] });
  const uncheckedRes = await unchecked.invoke();
  assert.equal(uncheckedRes.body.image.data, other);
  assert.match(mailOf(unchecked), /Bild 1 nicht gezeigt \(ungeprüft\), Bild 2 ok, Hinweis: the low wall the toilet stood against is gone/);
  // Ungeprueft gegen verworfen: das ungepruefte, und die Mail sagt, welches gezeigt wird.
  const risky = harness({ env: two, generations: pair, checks: [byImage({ [PNG]: () => checked(true), [other]: busy }), byImage({ [PNG]: () => checked(true), [other]: busy }), busy] });
  const riskyRes = await risky.invoke();
  assert.equal(riskyRes.statusCode, 200);
  assert.equal(riskyRes.body.image.data, other);
  assert.match(mailOf(risky), /nicht möglich \(HTTP 503\) \| Bild 2 gezeigt \| Bild 1: an opening was added or lost/);
  // Ein anderer Bildausschnitt zaehlt wie ein halber Hinweis: das Bild ohne Vermerk.
  const turned = harness({ env: two, generations: pair, checks: [byImage({ [PNG]: () => checkedInv({}, {}, { view_changed: true, reason: 'camera turned' }), [other]: () => checked() }),
    byImage({ [PNG]: () => checkedInv({}, {}, { view_changed: true, reason: 'camera turned' }), [other]: () => checked() })] });
  assert.equal((await turned.invoke()).body.image.data, other);
  // Im zweiten Durchgang das bessere, nicht das erste.
  const round2 = byImage({ [PNG]: () => checked(true), [other]: () => checked() });
  const later = harness({ env: two, generations: [...pair, ...pair], checks: [() => checked(true), () => checked(true), round2, round2] });
  const laterRes = await later.invoke();
  assert.equal(laterRes.statusCode, 200);
  assert.equal(laterRes.body.image.data, other);
  assert.match(mailOf(later), /Bild 1 verworfen .*, Bild 2 verworfen .*, Bild 3 verworfen .*, Bild 4 ok/);
  // Ist die Pruefung ausgeschaltet, gibt es nichts zu waehlen: ein Bild.
  const off = harness({ env: { ...two, BADPLANER_CHECK_MODEL: '' } });
  assert.equal((await off.invoke()).statusCode, 200);
  assert.equal(off.counts().generation, 1);
});

test('zwei Bilder: ist eines ohne Fehler und ohne Hinweis fertig, wartet der Kunde nicht auf das andere', async () => {
  // Gegenpruefung vom 27.09.: sonst wartete er auf das langsamere Bild, bis zu dessen Zeitgrenze.
  let release = () => {};
  // Spaetestens nach 50 ms kommt es trotzdem, damit ein Rueckfall als Fehler endet, nicht als haengender Test.
  const slow = () => new Promise((resolve) => { release = () => resolve(generated()); setTimeout(release, 50); });
  const other = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC';
  // Das langsame Bild kommt erst, wenn die Lead-Mail schon unterwegs ist.
  const h = harness({ env: { BADPLANER_CANDIDATES: '2' }, generations: [slow, () => generated(other)], checks: [() => checked(), () => checked()],
    mails: [() => { release(); return response({ id: 'mail-1' }); }] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.image.data, other);
  assert.doesNotMatch(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Bild 1\b/);
});

test('fehlt im Ideenbild der Waschtisch, ist das ein grober Fehler wie beim WC', async () => {
  // Gegenpruefung vom 27.09.: ohne diese Regel waehlte die Auswahl aus zwei Bildern eines ohne Waschtisch.
  const h = harness({ checks: [() => checkedInv({}, { washbasin: 'none' }), () => checked()] });
  assert.equal((await h.invoke()).statusCode, 200);
  assert.equal(h.counts().generation, 2);
  assert.match(h.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text,
    /A previous attempt failed the check because the washbasin is missing/);
});

test('laesst sich der zweite Versuch nicht pruefen, sieht der Kunde ihn, mit dem ersten Grund in der Mail', async () => {
  // Gegenpruefung vom 27.09.: dieser Weg hatte nach f3c724f keinen Test mehr.
  const second = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC';
  const busy = () => response({ error: 'busy' }, 503);
  const h = harness({ generations: [() => generated(), () => generated(second)], checks: [() => checked(true), busy, busy] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.image.data, second);
  assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /nicht möglich \(HTTP 503\) \| Bild 2 gezeigt \| Bild 1: an opening was added or lost/);
});

test('Wanne wird Dusche: die Dusche an der Stirnwand der Wanne ist richtig, an einer anderen Wand nicht', async () => {
  // P5 vom 26.09.: "the new shower stands on the left wall, the bathtub it replaces stood on the back wall". Sitzen die
  // Armaturen richtig an der Stirnwand, nennt das Pruefmodell oft diese Wand; der zweite Versuch drehte die Dusche dann wieder.
  const photo = () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv({ bathtub: 'back' }), order: ['toilet', 'bathtub', 'washbasin'], nearest: 'washbasin', shower_back: 'along', shower_left: true }));
  const body = payload({ dusche: 'walk-in', badewanne: 'keine' });
  const end = harness({ photoChecks: [photo], checks: [() => checkedInv({ bathtub: 'back' }, { shower: 'left' })] });
  assert.equal((await end.invoke(body)).statusCode, 200);
  assert.equal(end.counts().generation, 1);
  const moved = harness({ photoChecks: [photo], checks: [() => checkedInv({ bathtub: 'back' }, { shower: 'right' }), () => checkedInv({ bathtub: 'back' }, { shower: 'back' })] });
  assert.equal((await moved.invoke(body)).statusCode, 200);
  assert.equal(moved.counts().generation, 2);
  assert.match(moved.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text,
    /failed the check because the new shower stands on the right wall, the bathtub it replaces stood on the back wall/);
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
  assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body),
    /abgelehnt – Bild 1: an opening was added or lost.* \| kein zweiter Durchgang \(zu wenig Zeit\)/);
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
  assert.match(JSON.stringify(leadMail.body), /Bild 1 verworfen \(an opening was added or lost.*Bild 2 ok/);
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
  // In Produktion bleibt es so, auch wenn Vercel "production" setzt.
  const production = harness({ env: { VERCEL_ENV: 'production' } });
  assert.equal((await production.invoke(payload(), { headers: { cookie: 'nldbp=5:2026-09-13' } })).statusCode, 429);
});

test('auf einer Vorschau von Vercel gelten die Limits pro Geraet und pro IP nicht, der Tagesdeckel schon', async () => {
  // Carla, 27.09.: nach fuenf Proben pro Browser und Host war der Tag zu Ende (P9 und P10 der siebten Probe).
  const preview = harness({ env: { VERCEL_ENV: 'preview', BADPLANER_DAILY_CAP: '12' } });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    assert.equal((await preview.invoke(payload(), { headers: { cookie: 'nldbp=5:2026-09-13' } })).statusCode, 200, `Probe ${attempt + 1}`);
  }
  assert.equal((await preview.invoke(payload(), { headers: { cookie: 'nldbp=5:2026-09-13' } })).statusCode, 429);
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
  // Text, Foto, Plattenmuster, dann die Muster von Waschtischplatte und Unterbau (hier eine Datei), zuletzt die Armaturen.
  const options = optionsForPackage('essenza');
  const images = generation.body.contents[0].parts.filter((part) => part.inlineData);
  assert.equal(images.length, 5 + new Set([options.tops[0].image, options.bases[0].image]).size); // dazu das WC
  assert.equal(Buffer.from(images[1].inlineData.data, 'base64').length, bytes.length);
  // Zuerst der Prompt, dann nur die Bilder, ohne Nummer davor (27.09., wie auf der Website und in der vierten Probe).
  assert.deepEqual(generation.body.contents[0].parts.map((part) => !!part.text), [true, ...images.map(() => false)]);
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

test('die Mail an NLD sagt, ob das Foto aus der Kamera oder der Galerie kam und wie gross es war', async () => {
  // Diego, 26.09.: scheitern Fotos aus der Galerie oefter? Bisher wusste es der Server nicht.
  const mailOf = async (changes) => {
    const h = harness();
    assert.equal((await h.invoke(previewPayload(changes))).statusCode, 200);
    return JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  };
  assert.match(await mailOf({ fotoInfo: { quelle: 'galerie', breite: 4032, hoehe: 3024, bytes: 2400000 } }), /Galerie, Original 4032×3024 \(2\.4 MB\), gesendet \d+×\d+/);
  assert.match(await mailOf({ fotoInfo: { quelle: 'kamera', breite: 3000, hoehe: 4000, bytes: 0 } }), /Kamera, Original 3000×4000, gesendet \d+×\d+/);
  // Eine alte Seite ohne die Angabe, oder unsinnige Werte: nur die gesendete Groesse.
  assert.match(await mailOf({}), /Quelle unbekannt, gesendet \d+×\d+/);
  const odd = await mailOf({ fotoInfo: { quelle: 'constructor', breite: -1, hoehe: 'x', bytes: 1e12 } });
  assert.match(odd, /Quelle unbekannt, gesendet \d+×\d+/);
  assert.doesNotMatch(odd, /function|Original/);
  // Ein Objekt, das sich nicht in Text wandeln laesst: kein Fehler nach dem bezahlten Bild (sonst zaehlen die Limits nicht).
  assert.match(await mailOf({ fotoInfo: { quelle: { toString: 1 } } }), /Quelle unbekannt, gesendet \d+×\d+/);
});

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
  assert.equal(res.body.leadId, undefined, 'nur ein nicht gezeigtes Bild bringt seine Lead-ID mit');
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
  assert.equal(res.body.leadId, undefined, 'nur ein nicht gezeigtes Bild bringt seine Lead-ID mit');
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
  // Auch das verworfene Bild laeuft ueber withhold: die Antwort traegt die Lead-ID seiner Mail.
  assert.match(JSON.stringify(mail.body), new RegExp(`>Lead-ID</td><td[^>]*>${res.body.leadId}<`));
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
  assert.doesNotMatch(JSON.stringify(mail.body), /Lead-ID Ideenbild zurückgehalten/);
  assert.deepEqual(mail.body.attachments.map(({ filename }) => filename), ['beratung.png']);
});

test('Beratung lehnt manipulierten Fehlerkontext vor jedem Provideraufruf ab', async () => {
  for (const change of [{ renderFailure: 'toString' }, { renderFailure: 'RENDER_FAILED', auswahl: [['Paket']] },
    // Lead-ID des nicht gezeigten Bildes: nur im Format von newId() und nur zu RENDER_REJECTED.
    ...['', 'Lead 42', 'bp-<b>1</b>-x', `bp-${'a'.repeat(21)}-1`, 'BP-FIXTURE-1', 42, null].map((renderLeadId) => ({ renderFailure: 'RENDER_REJECTED', renderLeadId })),
    { renderFailure: 'RENDER_FAILED', renderLeadId: 'bp-fixture-1' }, { renderLeadId: 'bp-fixture-1' }]) {
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
  assert.match(prompt, /never create extra floor area\. Whatever is built in the immediate foreground/);
});

test('die Pruefung jedes Bildes denkt wenig, die Vorpruefung mehr, das Bildmodell bleibt unveraendert', async () => {
  // 20.09., 09:25: Fotopruefung 16 s, Pruefung nach 25 s abgelaufen, Wiederholung 17 s. Seit dem 27.09. denkt die
  // Vorpruefung mehr nach (Problem 1 der siebten Probe: die Stirnwand der Dusche), die Pruefung jedes Bildes bleibt kurz.
  const h = harness(); const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  const gemini = h.calls.filter((call) => call.url.includes('generativelanguage.googleapis.com'));
  const image = gemini.find((call) => call.body.generationConfig.responseModalities);
  assert.equal(image.body.generationConfig.thinkingConfig, undefined);
  assert.match(image.url, /gemini-3-pro-image:/);
  const checks = gemini.filter((call) => call !== image);
  assert.equal(checks.length, 2);
  assert.deepEqual(checks.map((call) => call.body.generationConfig.thinkingConfig), [{ thinkingLevel: 'high' }, { thinkingLevel: 'low' }]);
  // Problem 1 der siebten Probe: die Vorpruefung mit dem grossen Modell, jedes Bild weiter mit dem Pruefmodell.
  assert.deepEqual(checks.map((call) => call.url.match(/models\/([^:]+):/)[1]), ['gemini-3.1-pro-preview', 'gemini-3.6-flash']);
  // Ein aelteres Pruefmodell kennt thinkingLevel nicht und bekommt es nicht.
  const old = harness({ env: { BADPLANER_CHECK_MODEL: 'gemini-2.5-flash' } }); await old.invoke();
  for (const call of old.calls.filter((c) => c.url.includes('gemini-2.5-flash'))) assert.equal(call.body.generationConfig.thinkingConfig, undefined);
});

test('eine langsame Fotopruefung haelt das Bild hoechstens 40 s auf', async () => {
  const withLayout = () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv(), order: ['washbasin', 'toilet'], nearest: 'toilet' }));
  const slow = harness({ photoCheckDelays: [41000], photoChecks: [withLayout] }); const res = await slow.invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(slow.counts().generation, 1);
  const prompt = slow.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.doesNotMatch(prompt, /WHAT IMAGE 1 SHOWS/);
  const inTime = harness({ photoCheckDelays: [39000], photoChecks: [withLayout] });
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

test('ein zugemauerter Ruecksprung in der Wand steht als Hinweis in der Lead-Mail', async () => {
  // Diegos Test vom 20.09., 09:56 (bp-mu9iv1yy-bdzji9): die Nische bei der Dusche war weg.
  const lost = () => checkedInv({ shower: 'back' }, { shower: 'back' }, { wall_element_lost: true });
  const h = harness({ checks: [lost] });
  const res = await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(res.statusCode, 200);
  const gens = h.calls.filter((call) => call.body?.generationConfig?.responseModalities);
  assert.equal(gens.length, 1);
  assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body),
    /Hinweis: a recess, alcove, niche or step of the wall that is in the photo was filled in/);
  assert.match(gens[0].body.contents[0].parts[0].text, /NOTHING IS FILLED IN EITHER: every recess, alcove, niche, wall offset, corner step and wall projection that image 1 shows stays exactly where it is/);
  assert.match(gens[0].body.contents[0].parts[0].text, /A shower or bathtub that stands in a recess or alcove stays inside it, and the new tiles follow the wall into the recess and around its corners/);
  const question = h.calls.find((call) => /wall_element_lost/.test(call.body?.contents?.[0]?.parts?.[0]?.text || '')).body.contents[0].parts[0].text;
  assert.match(question, /no longer has because it was filled in/);
  // Colore 20.09., 13:01: der erhaltene Ruecksprung darf nicht als neue Nische gelten.
  assert.match(question, /every wall step that image 1 already has are not new/);
  assert.match(question, /tiles simply end at mid-height with paint above is still a full-height wall/);
});

test('Dusche: Rinne und Armaturen an der Stirnwand im Prompt, falsch gezeichnet steht als Hinweis in der Mail', async () => {
  const h = harness({ checks: [() => checkedInv({ shower: 'back' }, { shower: 'back' }, { point_drain: true })] });
  const res = await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(res.statusCode, 200);
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(prompt, /ALL shower fittings sit together on that short end wall/);
  // Diego, 20.09.: die Rinne wird von den Armaturen aus beschrieben, bei breiter Dusche nie entlang der Rueckwand.
  assert.match(prompt, /The drain starts from the fittings: a linear channel drain \(Duschrinne\) lies in the floor at the foot of the very wall that carries the mixer and the hand shower/);
  assert.match(prompt, /When the shower is wider than it is deep, this drain runs through the full depth of the shower, from the back wall towards the glass panel, that is towards the camera: it is perpendicular to the back wall and never runs along it/);
  assert.doesNotMatch(prompt, /side walls on its left and right/, 'a3: der Satz schob die Armaturen an die Rueckwand');
  // P1 vom 26.09.: Walk-in gewaehlt, eine Wanne gezeichnet. Der Walk-in hat keine Wanne, die Bodenplatten laufen hinein.
  assert.match(prompt, /walk-in shower without a tray: the bathroom floor tiles continue into it, with no step, no kerb and no raised platform/);
  // Nur der Satz, der die alte Wanne entfernt, nennt beim Walk-in eine Wanne.
  assert.match(prompt, /So is an old shower tray, its kerb or platform\./);
  assert.doesNotMatch(prompt.replace('So is an old shower tray, its kerb or platform.', ''), /shower tray/);
  assert.match(prompt, /never a central point drain, never a round or square grate/);
  // Diego, 26.09. (Entscheidung A): der zweite Versuch hatte 0 von 6 Duschen gerichtet; jetzt nur ein Hinweis.
  assert.equal(h.counts().generation, 1);
  assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body),
    /Fensterprüfung.*ok, Hinweis: the shower has a point drain; it needs a linear channel drain at the foot of the wall with the fittings/);
  // Armaturen an zwei Waenden (P2 der sechsten Probe), Stufe (P1): das sieht der Kunde sofort, darum ein zweiter
  // Durchgang (Diego, 27.09.); bleibt es, sieht der Kunde das Bild nicht, und NLD bekommt es mit dem Hinweis (04.10.).
  for (const [flags, reason] of [
    [{ shower_fittings_walls: ['back', 'left'] }, /the shower fittings are spread over two walls/],
    [{ shower_step: true }, /the shower floor is raised above the bathroom floor/],
  ]) {
    const wrong = () => checkedInv({ shower: 'back' }, { shower: 'back' }, flags);
    const w = harness({ checks: [wrong, wrong] });
    assert.equal((await w.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }))).statusCode, 502);
    assert.equal(w.counts().generation, 2, JSON.stringify(flags));
    assert.match(w.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text,
      new RegExp(`A previous attempt was wrong because ${reason.source}`));
    assert.match(JSON.stringify(w.calls.find((call) => call.url === 'https://api.resend.com/emails').body), reason);
  }
  // An welcher Wand Rinne und Armaturen stehen, sagt kein Hinweis mehr: in P9 vom 26.09. waren beide falsch (Diego).
  for (const walls of [{ drain_wall: 'left', shower_fittings_walls: ['left'] }, { drain_wall: 'back', shower_fittings_walls: ['left'] }]) {
    const right = harness({ checks: [() => checkedInv({ shower: 'back' }, { shower: 'back' }, { ...walls, shower_floor_after: 'tiles' })] });
    await right.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
    assert.equal(right.counts().generation, 1);
    assert.doesNotMatch(JSON.stringify(right.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Hinweis/);
  }
  // Die Duschwanne ist bodeneben, eine sichtbare Wanne mit eigenem Ablauf, ohne Rinne (Diego, 26.09.: P2 Wanne mit
  // Rinne, P3 gefliester Boden mit Rinne statt der Wanne). Die Armaturen stehen wie beim Walk-in an der Stirnwand.
  // Diego, 04.10.: ihr Rand von 2 bis 3 cm ist normal; schwer ist nur eine Stufe oder ein Podest. Der Walk-in bleibt ganz eben.
  const checkQuestion = (h) => h.calls.map((call) => call.body?.contents?.[0]?.parts?.[0]?.text || '').find((text) => text.includes('Set shower_step'));
  assert.match(checkQuestion(h), /Set shower_step true if the floor of the shower in image 2 stands higher than the bathroom floor around it: a raised shower tray with a visible side face or step, a kerb or a platform; a shower tray level with the floor tiles is not raised/);
  assert.doesNotMatch(checkQuestion(h), /2 to 3 cm/);
  const raised = () => checkedInv({ shower: 'back' }, { shower: 'back' }, { shower_step: true });
  const tray = harness({ checks: [raised, raised] });
  await tray.invoke(payload({ dusche: 'duschwanne', badewanne: 'keine' }));
  assert.equal(tray.counts().generation, 2);
  assert.match(checkQuestion(tray), /Set shower_step true only if the shower tray in image 2 stands on a step, kerb, plinth or platform, or rises clearly higher above the bathroom floor than the thin edge of a normal shower tray; that edge, about 2 to 3 cm, may show as a narrow side face and is not raised/);
  assert.doesNotMatch(checkQuestion(tray), /a raised shower tray with a visible side face or step/);
  assert.match(JSON.stringify(tray.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Hinweis: the shower tray stands on a step, kerb or platform; it must sit directly on the floor, with no more than its own low edge/);
  assert.match(tray.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text,
    /A previous attempt was wrong because the shower tray stands on a step, kerb or platform/);
  // Nur der Rand: kein Hinweis, kein zweiter Durchgang.
  const edge = harness({ checks: [() => checkedInv({ shower: 'back' }, { shower: 'back' }, { shower_step: false, shower_floor_after: 'tray' })] });
  assert.equal((await edge.invoke(payload({ dusche: 'duschwanne', badewanne: 'keine' }))).statusCode, 200);
  assert.equal(edge.counts().generation, 1);
  assert.doesNotMatch(JSON.stringify(edge.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Hinweis/);
  const trayPrompt = tray.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  // Diego, 04.10.: eben oder mit ihrem Rand von 2 bis 3 cm, nie auf einem Podest; ganz eben bleibt nur die Gefaelledusche.
  assert.match(trayPrompt, /flat shower tray in the same colour as the toilet: one smooth piece without tile joints, set into the floor so that its surface is level with the floor tiles around it or at most about 2 to 3 cm above them, showing only its own thin edge, never standing on a step, a kerb, a plinth or a platform;/);
  assert.doesNotMatch(trayPrompt, /no rim|no raised edge|exactly level/);
  assert.match(prompt, /walk-in shower without a tray: the bathroom floor tiles continue into it, with no step, no kerb and no raised platform/);
  assert.doesNotMatch(prompt, /2 to 3 cm|thin edge/);
  assert.match(trayPrompt, /it covers the whole shower floor, its outline shows clearly against the floor tiles, and it has its own small round drain with a round cover in its surface, and no channel drain/);
  assert.match(trayPrompt, /ALL shower fittings sit together on that short end wall/);
  // P2 vom 26.09.: die alte erhoehte Wanne blieb; bisher ging nur die Badewanne bis zum Boden weg (Gegenpruefung).
  assert.match(trayPrompt, /removed down to the floor\. So is an old shower tray, its kerb or platform\./);
  assert.doesNotMatch(trayPrompt, /Duschrinne|slopes towards it|very slightly towards it|sloped|like one large floor tile/);
  // Wanne gefliest oder mit Rinne gezeichnet: schwere Hinweise, ein zweiter Durchgang. Ein runder Ablauf ist bei der Wanne richtig.
  const trayMail = async (flags, generations = 1, status = 200) => {
    const answer = () => checkedInv({ shower: 'back' }, { shower: 'back' }, flags);
    const w = harness({ checks: [answer, answer] });
    assert.equal((await w.invoke(payload({ dusche: 'duschwanne', badewanne: 'keine' }))).statusCode, status);
    assert.equal(w.counts().generation, generations);
    return JSON.stringify(w.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  };
  const tiled = await trayMail({ shower_floor_after: 'tiles', drain_wall: 'back', shower_fittings_walls: ['left'] }, 2, 502);
  assert.match(tiled, /Hinweis: the shower floor is tiled, but a shower with a shower tray was chosen/);
  assert.match(tiled, /Hinweis: the shower has a channel drain; the shower tray needs its own small round drain/);
  assert.doesNotMatch(tiled, /belongs at the foot of/);
  assert.doesNotMatch(await trayMail({ shower_floor_after: 'tray', point_drain: true }), /Hinweis/);
  // Walk-in mit Wanne gezeichnet (P1): schwerer Hinweis.
  const trayed = () => checkedInv({ shower: 'back' }, { shower: 'back' }, { shower_floor_after: 'tray' });
  const withTray = harness({ checks: [trayed, trayed] });
  await withTray.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(withTray.counts().generation, 2);
  assert.match(JSON.stringify(withTray.calls.find((call) => call.url === 'https://api.resend.com/emails').body),
    /Hinweis: the shower has a shower tray, but a walk-in shower with the floor tiles continuing into it was chosen/);
  // Ohne bestellte Dusche wird an der Dusche nichts geprueft.
  const none = harness({ checks: [() => checkedInv({ bathtub: 'back' }, { bathtub: 'back' }, { point_drain: true, shower_step: true, shower_floor_after: 'tray' })] });
  await none.invoke(payload({ dusche: 'keine', badewanne: 'einbau' }));
  assert.equal(none.counts().generation, 1);
  assert.doesNotMatch(JSON.stringify(none.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Hinweis/);
});

test('Dusche: die Stirnwand sagt die Vorpruefung im Foto, der Prompt nennt sie', async () => {
  // P2 und P5 vom 25.09.: Rinne und Armaturen richtig an der kurzen Rueckwand, trotzdem "long side" und ein zweiter
  // Versuch, weil die Pruefung die Dusche im Ergebnis fuer breiter als tief hielt. P1 und P3: Rinne hinten, Armaturen links.
  const photo = (extra) => () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv({ bathtub: 'left' }), order: ['bathtub', 'washbasin', 'toilet'], nearest: 'toilet', ...extra }));
  const result = (drain, fittings) => () => checkedInv({ bathtub: 'left' }, { shower: 'left' }, { drain_wall: drain, shower_fittings_walls: [fittings] });
  // Die Rinne gehoert seit dem 26.09. nur zum Walk-in; die Duschwanne bekommt den Satz ohne Rinne.
  const body = payload({ dusche: 'walk-in', badewanne: 'keine' });
  const trayWall = harness({ photoChecks: [photo({ shower_back: 'end' })], checks: [result('back', 'back')] });
  await trayWall.invoke(payload({ dusche: 'duschwanne', badewanne: 'keine' }));
  assert.match(trayWall.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text,
    /The short end wall of the shower is the back wall seen from the camera: the mixer, the overhead shower and the hand shower sit on it, facing the camera; the side walls of the shower carry no fitting, only tiles\. /);
  const ok = harness({ photoChecks: [photo({ shower_back: 'end' })], checks: [result('back', 'back')] });
  assert.equal((await ok.invoke(body)).statusCode, 200);
  assert.equal(ok.counts().generation, 1);
  const okPrompt = ok.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(okPrompt, /The short end wall of the shower is the back wall seen from the camera: the mixer, the overhead shower and the hand shower sit on it, facing the camera, and the channel drain lies along its foot; the side walls of the shower carry no fitting, only tiles\./);
  // Stirnwand hinten: kein Satz mehr, der die Rinne quer zur Rueckwand verlangt (Widerspruch in P2 und P5 vom 25.09.).
  assert.doesNotMatch(okPrompt, /wider than it is deep|perpendicular to the back wall/);
  // Gegenpruefung vom 27.09.: "slopes towards it" war der einzige Satz mit einem Hoehenunterschied (P1: Walk-in erhoeht).
  assert.match(okPrompt, /and the shower floor, level with the bathroom floor at its edge, falls only very slightly towards it\. Never a central point drain, never a round or square grate/);
  // Beruehrt die Wanne die linke Wand, aber die Rueckwand nicht, hat kein Ende eine Wand: keine Stirnwand. Die Dusche folgt
  // dann der Richtung der Wanne.
  const wrong = harness({ photoChecks: [photo({ shower_left: true })], checks: [result('back', 'back')] });
  assert.equal((await wrong.invoke(body)).statusCode, 200);
  assert.equal(wrong.counts().generation, 1);
  const wrongPrompt = wrong.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.doesNotMatch(wrongPrompt, /short end wall of the shower is the/);
  assert.match(wrongPrompt, /When the shower is wider than it is deep, this drain runs through the full depth/);
  assert.match(wrongPrompt, /A bathtub that becomes a shower uses only the bathtub's own footprint, on the same wall and in the same direction as the bathtub; the bathtub and any raised base under it are removed down to the floor\. So is an old shower tray/);
  // Rinne und Armaturen an einer anderen Wand als der Stirnwand: kein Hinweis mehr (P9 vom 26.09., beide falsch).
  assert.doesNotMatch(JSON.stringify(wrong.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Hinweis/);
  // Ohne Wanne oder Dusche im Foto (oder ein unbekanntes Wort) nennt der Prompt keine Wand.
  const none = harness({ photoChecks: [photo({ shower_back: 'diagonal' })], checks: [result('back', 'back')] });
  await none.invoke(body);
  const nonePrompt = none.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.doesNotMatch(nonePrompt, /short end wall of the shower is the/);
  assert.match(nonePrompt, /When the shower is wider than it is deep, this drain runs through the full depth/);
  assert.equal(none.counts().generation, 1);
  // Die Vorpruefung fragt danach.
  const question = ok.calls.find((call) => /shower_back/.test(call.body?.contents?.[0]?.parts?.[0]?.text || '')).body.contents[0].parts[0].text;
  // Problem 1 der siebten Probe (Diego, 27.09.): welche Waende die Wanne beruehrt, statt quer oder laengs.
  assert.match(question, /set shower_left true if it touches the left wall and shower_right true if it touches the right wall; /);
  assert.match(question, /set shower_back to "along" if one of its long sides stands against the back wall over its whole length, "end" if it touches the back wall only with one of its narrow ends, "none" if it does not touch the back wall\./);
  // Zeigt das Foto keine Wanne, nur die alte Duschwanne: kein Satz zur Wanne, die zur Dusche wird.
  const shower = harness({ photoChecks: [() => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv({ shower: 'back' }), order: ['washbasin', 'shower', 'toilet'], nearest: 'toilet', shower_back: 'end' }))],
    checks: [() => checkedInv({ shower: 'back' }, { shower: 'back' })] });
  await shower.invoke(body);
  const showerPrompt = shower.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(showerPrompt, /An old shower tray, its kerb or platform is removed down to the floor\./);
  assert.doesNotMatch(showerPrompt, /A bathtub that becomes a shower/);
  // Die Regel gilt nur fuer die Wanne: die Stirnwand einer Dusche im Foto bleibt.
  assert.match(showerPrompt, /The short end wall of the shower is the back wall/);
});

test('eine Stufe in der Dusche kostet einen zweiten Durchgang; bleibt sie, sieht der Kunde kein Bild und NLD Bild und Hinweis', async () => {
  // Diego, 26.09. (Entscheidung A): in zwei Proben richtete der zweite Versuch 0 von 6 Duschen, je CHF 0.12 und 35 s.
  // Seit dem 27.09. laufen zwei Bilder je Durchgang, und in P1 der sechsten Probe ging der erhoehte Walk-in mit dem
  // Hinweis an den Kunden: eine Stufe loest wieder einen zweiten Durchgang aus.
  const step = () => checkedInv({ shower: 'back' }, { shower: 'back' }, { shower_step: true });
  // Bleibt sie auch im zweiten Durchgang, sieht der Kunde das Bild seit dem 04.10. nicht.
  const h = harness({ checks: [step, step] });
  const res = await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'RENDER_REJECTED');
  assert.equal(res.body.image, undefined);
  assert.equal(h.counts().generation, 2);
  assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body),
    /Fensterprüfung.*Bild 2 nicht gezeigt \(Hinweise: the shower floor is raised.*\), Bild 1 mit schwerem Hinweis, Hinweis: the shower floor is raised/);
  // Ohne Stufe im zweiten Durchgang: dieses Bild.
  const second = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC';
  const fixed = harness({ generations: [() => generated(), () => generated(second)], checks: [step, () => checkedInv({ shower: 'back' }, { shower: 'back' })] });
  const fixedRes = await fixed.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }));
  assert.equal(fixedRes.body.image.data, second);
  assert.match(JSON.stringify(fixed.calls.find((call) => call.url === 'https://api.resend.com/emails').body),
    /Fensterprüfung.{0,40}Bild 1 nicht gezeigt \(Hinweise: the shower floor is raised.*\), Bild 2 ok</);
});

test('Armaturen: Atelier zeigt die Form von Treemme Aurelia in der gewaehlten Oberflaeche', async () => {
  const options = optionsForPackage('atelier');
  assert.equal(options.tapSeries, 'Treemme Aurelia, Unterputz');
  const tile = options.tiles[0];
  // Mit Dusche: nur dann gehen Duschset und Duschtext mit.
  const h = harness({ checks: [() => checkedInv({}, { shower: 'back' })] });
  const res = await h.invoke(payload({
    paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id, kombination: 'einheitlich',
    unterbau: options.bases[0].id, top: options.tops[0].id, becken: options.basinTypes[0].id,
    finish: 'treemme-ottone-spazzolato', keramik: options.sanitary[0].id,
    wall: options.walls[0].id, dusche: 'walk-in', badewanne: options.bathtubs[0].id,
    waschtisch: options.basins[0].id, spiegel: options.mirrors[0].id,
  }));
  assert.equal(res.statusCode, 200, `unexpected status ${res.statusCode}: ${JSON.stringify(res.body).slice(0, 200)}`);
  const prompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(prompt, /Treemme Aurelia wall fittings in brushed brass/);
  // Die Platte OLI Blink in der Oberflaeche der Armaturen, nicht immer verchromt (Diego, 26.09.).
  assert.match(prompt, /by a new flat rectangular flush plate in brushed brass, wider than high, with two equal round solid metal knobs/);
  // Artikel vom 25.09.: Waschtisch RWIT 2CC5 (zwei Rosetten statt Platte), Dusche RWIT 2CD9 mit Kopfbrause IT RTBR 376.
  // Nebeneinander, nicht uebereinander (Rendering von Treemme, Diego 26.09.).
  // P7 der sechsten Probe: Aurelia wie Up+, mit rundem Rohr.
  assert.match(prompt, /at each washbasin exactly two separate small round wall rosettes .*side by side above the basin, no wall plate and nothing between them: from the left one a long slim spout, a flat bar with flat sides and never a round tube, .*the right one carries the only lever: .*flat paddle lever hanging down \(not a thin pin\)/);
  assert.doesNotMatch(prompt, /one above the other/);
  // Dusche RWIT 2CD9: der Brauseanschluss mit Handbrause und zwei Rosetten; mit "drei Rosetten" kamen am 26.09. drei Hebel und der Anschluss (P1).
  // P1 und P8 der sechsten Probe: in der Mitte eine grosse runde Platte mit Mischer und Umsteller (Ausschnitt von Diego).
  assert.match(prompt, /in a shower in one row at the same height: the hose outlet in one small round wall piece that also holds a slim stick hand shower upright on its hose, and beside it exactly two small round wall rosettes of the same size, the mixer and the diverter, each a short cylinder with the same flat paddle lever hanging down \(not a thin pin\) and never one large plate with both, .*thin flat rectangular overhead shower plate \(about 50 × 20 cm\)/);
  assert.doesNotMatch(prompt, /three small round wall rosettes \(about 7\.5 cm\)/);
  assert.doesNotMatch(prompt, /rectangular wall plate|round overhead shower/);
  // Die Treemme-Produktfotos gehen als letzte Vorlagen mit, nur fuer die Form: Waschtisch und Dusche je als eigenes Bild
  // (Diego, 26.09.: im gemeinsamen Bild setzte das Modell in P1 die Hebel der Dusche an den Waschtisch).
  const parts = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
  const images = parts.filter((part) => part.inlineData);
  assert.match(prompt, new RegExp(`Image ${images.length - 1} is only a product photo of the washbasin tap: copy its shape, not its finish\\.`));
  assert.match(prompt, new RegExp(`Image ${images.length} is only a product photo of the shower fittings: copy their shapes, not their finish\\.`));
  assert.deepEqual(images.slice(-2).map((part) => part.inlineData.data), [aurelia.AURELIA_BASIN_PHOTO.data, aurelia.AURELIA_SHOWER_PHOTO.data]);
  assert.deepEqual(options.finishes.map((finish) => finish.id), ['treemme-cromo', 'treemme-nero-opaco', 'treemme-oro-spazzolato', 'treemme-nichel-spazzolato',
    'treemme-oro-rosa-spazzolato', 'treemme-nichel-lucido', 'treemme-oro', 'treemme-nero-cromo-lucido', 'treemme-nero-cromo-spazzolato', 'treemme-ottone-spazzolato']);
  // Lead und Kundenmail nennen die Serie.
  const mails = h.calls.filter((call) => call.url === 'https://api.resend.com/emails');
  assert.ok(mails.length >= 1);
  for (const mail of mails) assert.match(JSON.stringify(mail.body), /Ottone Spazzolato \(Messing gebürstet\), Treemme Aurelia, Unterputz/);
});

test('Armaturen: Essenza zeigt die Form von Treemme Up+, nicht irgendeine Armatur', async () => {
  const h = harness({ checks: [() => checkedInv({}, { shower: 'back' })] }); await h.invoke(payload({ dusche: 'walk-in' }));
  const parts = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
  const prompt = parts[0].text;
  // Artikel vom 25.09.: Waschtisch IT 6B18 (Stifthebel seitlich oben, langer Rohrauslauf), Dusche IT 6B60 Aufputz.
  assert.match(prompt, /Treemme Up\+ fittings in polished chrome .*thin pin lever sticking out on its side near the top and just below it a long round tube spout that slopes down/);
  assert.match(prompt, /mixer with a flat top standing on the countertop or the washbasin/);
  // Aufputz: in der Dusche der sichtbare Mischer (Diego, 20.09.), mit Steigrohr und runder Kopfbrause.
  assert.match(prompt, /exposed shower column: .*standing clearly out from the tiles .*not a flat concealed plate.*riser pipe .*large thin round overhead shower/);
  // Die Produktbilder von Treemme gehen als letzte Vorlage mit (P3 vom 25.09.: ohne Bild kein Up+).
  const images = parts.filter((part) => part.inlineData);
  assert.match(prompt, new RegExp(`Image ${images.length - 1} is only a product photo of the washbasin tap`));
  assert.match(prompt, new RegExp(`Image ${images.length} is only a product photo of the shower fittings`));
  assert.deepEqual(images.slice(-2).map((part) => part.inlineData.data), [up.UP_BASIN_PHOTO.data, up.UP_AUFPUTZ_SHOWER_PHOTO.data]);
});

test('Gaeste-WC: dieselbe Armaturenserie wie im Bad, nur am Waschtisch, mit Bild nur des Waschtischs', async () => {
  // P4 vom 25.09. (Colore mit Up+): im Prompt stand nur "washbasin tap", auf Vorschau und Website kein Up+.
  const colore = optionsForPackage('colore');
  const atelier = optionsForPackage('atelier');
  const guest = { raum: 'gaeste-wc', dusche: '', badewanne: '', waschtisch: 'einzel' };
  const cases = [
    [{ ...guest, paket: 'colore', format: colore.formats[0], platte: colore.tiles[0].id, unterbau: colore.bases[0].id, top: colore.tops[0].id,
      becken: 'aufsatz', armaturenserie: 'treemme-up', finish: colore.finishes[0].id, keramik: colore.sanitary[0].id, wall: colore.walls[0].id,
      spiegel: colore.mirrors[0].id }, /Treemme Up\+ fittings .*at the washbasin a slim cylindrical single-lever mixer/, 'a product photo of the washbasin tap'],
    [{ ...guest, paket: 'atelier', look: atelier.tiles[0].look, format: atelier.tiles[0].format, platte: atelier.tiles[0].id, kombination: 'einheitlich',
      unterbau: atelier.bases[0].id, top: atelier.tops[0].id, becken: atelier.basinTypes[0].id, finish: atelier.finishes[0].id,
      keramik: atelier.sanitary[0].id, wall: atelier.walls[0].id, spiegel: atelier.mirrors[0].id }, /Treemme Aurelia wall fittings .*two separate small round wall rosettes/, 'a product photo of the washbasin tap'],
    [{ ...guest }, /Treemme Up\+ fittings .*at the washbasin a slim cylindrical single-lever mixer/, 'a product photo of the washbasin tap'],
  ];
  for (const [body, series, sample] of cases) {
    const h = harness();
    const res = await h.invoke(payload(body));
    assert.equal(res.statusCode, 200, `${body.paket}: ${JSON.stringify(res.body).slice(0, 200)}`);
    const parts = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
    const prompt = parts[0].text;
    assert.match(prompt, series, body.paket);
    assert.doesNotMatch(prompt, /in a shower |overhead shower|hand shower/, body.paket);
    assert.match(prompt, /no shower mixer, bath filler or shower controls/);
    assert.match(prompt, new RegExp(`Image ${parts.filter((part) => part.inlineData).length} is only ${sample}`), body.paket);
  }
  // Ran hat seit dem 26.09. Bilder (Renderings von Diego): im Gaeste-WC nur das des Waschtischmischers.
  const ran = harness();
  await ran.invoke(payload({ ...cases[0][0], armaturenserie: 'treemme-ran' }));
  const ranParts = ran.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
  assert.match(ranParts[0].text, new RegExp(`Image ${ranParts.filter((part) => part.inlineData).length} is only a product photo of the washbasin tap`));
  assert.doesNotMatch(ranParts[0].text, /in a shower |overhead shower|hand shower/);
});

test('Armaturen: Colore mit Up+ hat in der Dusche drei runde Rosetten, keine Platte und keine Brausestange', async () => {
  // Diego, 26.09.: Unterputz mit drei Rosetten (Brauseanschluss mit Handbrause, Mischer, Umsteller), wie bei Aurelia.
  const colore = optionsForPackage('colore');
  const h = harness({ checks: [() => checkedInv({}, { shower: 'back' })] });
  await h.invoke(payload({ paket: 'colore', format: colore.formats[0], platte: colore.tiles[0].id, unterbau: colore.bases[0].id,
    top: colore.tops[0].id, becken: 'aufsatz', armaturenserie: 'treemme-up', finish: colore.finishes[0].id, keramik: colore.sanitary[0].id,
    wall: colore.walls[0].id, waschtisch: 'einzel', spiegel: colore.mirrors[0].id, dusche: 'walk-in', badewanne: 'keine' }));
  const parts = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
  assert.match(parts[0].text, /in a shower three small round wall rosettes in one row at the same height: .*stick hand shower .*thin pin lever hanging down, .*thin round overhead shower on a round tube arm/);
  assert.doesNotMatch(parts[0].text, /rectangular wall plate|slide bar/);
  const images = parts.filter((part) => part.inlineData);
  assert.match(parts[0].text, new RegExp(`Image ${images.length} is only a product photo of the shower fittings`));
  assert.deepEqual(images.slice(-2).map((part) => part.inlineData.data), [up.UP_BASIN_PHOTO.data, up.UP_SHOWER_PHOTO.data]);
});

test('Armaturen: Colore mit Ran zeigt die Renderings von Treemme, mit Dusche und mit Wanne', async () => {
  // Diego, 26.09.: vier Renderings von Ran. In T7 und T8 vom 25.09. zeichnete das Modell ohne Bild den Mischer aus dem Foto nach.
  const colore = optionsForPackage('colore');
  const base = { paket: 'colore', format: colore.formats[0], platte: colore.tiles[0].id, unterbau: colore.bases[0].id, top: colore.tops[0].id,
    becken: 'aufsatz', armaturenserie: 'treemme-ran', finish: 'treemme-nero-opaco', keramik: colore.sanitary[0].id, wall: colore.walls[0].id,
    waschtisch: 'einzel', spiegel: colore.mirrors[0].id };
  const partsOf = async (changes, after) => {
    const h = harness({ checks: [() => checkedInv({}, after)] });
    assert.equal((await h.invoke(payload({ ...base, ...changes }))).statusCode, 200);
    return h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
  };
  const shower = await partsOf({ dusche: 'walk-in', badewanne: 'keine' }, { shower: 'back' });
  const images = shower.filter((part) => part.inlineData);
  // P9 der sechsten Probe: Mischer und Umsteller auf einer hohen Platte (Ausschnitt von Diego).
  assert.match(shower[0].text, /Treemme Ran fittings in matte black, round bodies .*in a shower exactly two small wall plates with rounded corners, each a little taller than wide and only slightly larger than the mixer lever, one carrying only the concealed mixer, a short round body with a flat, slightly bent blade lever and no second knob/);
  assert.match(shower[0].text, new RegExp(`Image ${images.length} is only a product photo of the shower fittings`));
  assert.deepEqual(images.slice(-2).map((part) => part.inlineData.data), [ran.RAN_BASIN_PHOTO.data, ran.RAN_SHOWER_PHOTO.data]);
  // Einbauwanne ohne Dusche: das Bild des Waschtischmischers und das der Wannenarmatur, im Text die vier Platten.
  const bath = await partsOf({ dusche: 'keine', badewanne: 'einbau' }, { bathtub: 'back' });
  const bathImages = bath.filter((part) => part.inlineData);
  assert.match(bath[0].text, /four small square wall plates with rounded corners in one row just above the rim/);
  assert.match(bath[0].text, new RegExp(`Image ${bathImages.length - 1} is only a product photo of the washbasin tap`));
  assert.match(bath[0].text, new RegExp(`Image ${bathImages.length} is only a product photo of the bath mixer on a plain background: copy its shape, not its colour, only at the bathtub`));
  assert.doesNotMatch(bath[0].text, /in a shower |overhead shower on/);
});

test('ein unbekannter Duschboden in der Pruefung zaehlt nicht, kein Fehler nach dem bezahlten Bild', async () => {
  // Gegenpruefung vom 26.09.: ein Objekt mit eigenem toString warf beim Log einen TypeError, nach dem Bild und vor der
  // Mail; der Tagesversuch wurde zurueckgezaehlt und der Lead ging verloren.
  const odd = (extra) => () => checkedInv({ shower: 'back' }, { shower: 'back' }, extra);
  const h = harness({ checks: [odd({ shower_floor_after: { toString: 1 } })] });
  assert.equal((await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }))).statusCode, 200);
  assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Fensterprüfung.{0,80}>ok</);
  // Wie bei der Wahl des Kunden macht ein unbekanntes Wort die Pruefung nicht ungueltig: eine neue Oeffnung verwirft weiter.
  const opening = odd({ shower_floor_after: 'walk-in', extra_openings: true });
  const rejected = harness({ checks: [opening, opening] });
  assert.equal((await rejected.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }))).statusCode, 502);
});

test('Gaeste-WC gewaehlt, im Foto aber Wanne oder Dusche: Hinweis statt Bild', async () => {
  // Jonathan am 25.09.: vier Gaeste-WC-Versuche mit Fotos von Baedern, vier verworfene Bilder.
  const guest = previewPayload({ raum: 'gaeste-wc', dusche: '', badewanne: '', waschtisch: 'einzel' });
  const photo = (walls) => () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv(walls), order: ['washbasin', 'toilet'], nearest: 'toilet' }));
  const h = harness({ photoChecks: [photo({ bathtub: 'left' })] });
  const res = await h.invoke(guest);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 'GUEST_WC_WITH_BATH');
  assert.match(res.body.error, /^Auf Ihrem Foto sehen wir eine Badewanne\. .*«Badezimmer»/);
  assert.deepEqual(h.counts(), { generation: 0, checks: 0, mail: 1 });
  assert.equal(res.headers['Set-Cookie'], undefined, 'kein Tagesversuch verbraucht');
  const mail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(mail.body.subject, /Gäste-WC – Foto zeigt ein Bad/);
  assert.match(JSON.stringify(mail.body), /Foto zeigt eine Badewanne/);
  // Ein echtes Gaeste-WC und ein Bad mit Dusche laufen weiter wie bisher.
  assert.equal((await harness({ photoChecks: [photo({})] }).invoke(guest)).statusCode, 200);
  assert.equal((await harness({ photoChecks: [photo({ shower: 'back' })] }).invoke(previewPayload())).statusCode, 200);
});

test('ohne Dusche kein Duschset, die Wanne mit eigener Armatur', async () => {
  // Jonathan am 25.09. (Atelier, keine Dusche, freistehende Wanne): mit dem Duschset in Bild und Text zeichnete
  // das Modell Kopf- und Handbrause ueber der Wanne und zweimal eine Dusche statt der Wanne.
  const atelier = optionsForPackage('atelier');
  const tile = atelier.tiles[0];
  const base = { paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id, kombination: 'einheitlich',
    unterbau: atelier.bases[0].id, top: atelier.tops[0].id, becken: atelier.basinTypes[0].id, finish: atelier.finishes[0].id,
    keramik: atelier.sanitary[0].id, wall: atelier.walls[0].id, waschtisch: 'einzel', spiegel: atelier.mirrors[0].id };
  const partsOf = async (changes, after) => {
    const h = harness({ checks: [() => checkedInv({}, after)] });
    await h.invoke(payload({ ...base, ...changes }));
    return h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
  };
  const promptOf = async (changes, after) => (await partsOf(changes, after))[0].text;
  const freeParts = await partsOf({ dusche: 'keine', badewanne: 'freistehend' }, { bathtub: 'back' });
  const free = freeParts[0].text;
  assert.doesNotMatch(free, /in a shower /);
  // Ohne Dusche auch kein allgemeiner Satz zu den Duscharmaturen (Gegenpruefung vom 26.09.).
  assert.doesNotMatch(free, /All shower fittings sit together/);
  // Die freistehende Wanne kommt immer, wenn gewaehlt (Diego, 25.09.): kein "nur wenn Platz" mehr.
  assert.match(free, /a freestanding bathtub standing free on the floor in the place of the old bathtub .*never a built-in bathtub/);
  assert.doesNotMatch(free, /enough space/);
  // Wannen gibt es in jeder Groesse (Diego, 25.09.): die Wanne passt sich an, der Raum bleibt.
  assert.match(free, /in the length that fits that place: .*the room is never enlarged for it/);
  assert.match(free, /beside the freestanding bathtub a floor-standing bath mixer of the same series and finish: a slim round column on a round floor base/);
  // P7 vom 26.09.: die Standarmatur kam als Up+; Hebel und Auslauf von Aurelia sind flach und eckig.
  // Gegenpruefung vom 27.09. am Bild: der Auslauf ist flach und breiter als dick, der Umsteller glatt.
  assert.match(free, /flat rectangular paddle lever lying level \(not a thin pin\), below it a flat spout, wider than it is thick, .*\(not a round tube\), below the spout a smooth round diverter knob/);
  // Neben der Saeule steht die Stabhandbrause selbst, keine zweite Stange (Gegenpruefung am Bild).
  assert.match(free, /beside the column a slim stick hand shower standing upright in a holder fixed to the column just below the spout/);
  assert.doesNotMatch(free, /second thin rod/);
  assert.match(free, /no overhead shower, no shower rail and no shower mixer anywhere/);
  // Aurelia: Waschtisch und Wannenarmatur je als eigenes Bild (Bilder von Diego, 25.09.).
  const images = freeParts.filter((part) => part.inlineData);
  assert.match(free, new RegExp(`Image ${images.length - 1} is only a product photo of the washbasin tap`));
  assert.match(free, new RegExp(`Image ${images.length} is only a product photo of the bath mixer`));
  assert.ok(images[images.length - 1].inlineData.data.startsWith('/9j/'));
  const builtIn = await promptOf({ dusche: 'keine', badewanne: 'einbau' }, { bathtub: 'back' });
  assert.doesNotMatch(builtIn, /in a shower /);
  assert.match(builtIn, /at the bathtub, on the wall at its tap end, a bath mixer of the same series and finish: a long flat horizontal wall plate in the same finish/);
  assert.match(builtIn, /is only a product photo of the bath mixer/);
  // Mit Dusche bleibt das Duschset, die Wanne bekommt ihre Armatur dazu.
  const both = await promptOf({ dusche: 'walk-in', badewanne: 'einbau' }, { shower: 'back', bathtub: 'left' });
  assert.match(both, /in a shower .*; at the bathtub, on the wall at its tap end/);
  assert.match(both, /is only a product photo of the washbasin tap: .*is only a product photo of the shower fittings: .*is only a product photo of the bath mixer/);
  // Essenza: die Wannenarmatur sichtbar an der Wand, wie das Duschsystem, mit dem Rendering von Treemme (Diego, 26.09.).
  const essenza = harness({ checks: [() => checkedInv({}, { bathtub: 'back' })] });
  await essenza.invoke(payload({ dusche: 'keine', badewanne: 'einbau' }));
  const essenzaPrompt = essenza.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(essenzaPrompt, /a bath mixer of the same series and finish: an exposed horizontal round bar mixer on two short wall connections just above the rim, .*slim stick hand shower on its hose in a small separate wall holder/);
  const essenzaParts = essenza.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
  assert.match(essenzaPrompt, new RegExp(`Image ${essenzaParts.filter((part) => part.inlineData).length} is only a product photo of the bath mixer`));
  // Colore mit Up+ (Unterputz): das Rendering der Wannenarmatur von Treemme (Diego, 26.09.), vier runde Rosetten.
  const colore = optionsForPackage('colore');
  const up = harness({ checks: [() => checkedInv({}, { bathtub: 'back' })] });
  await up.invoke(payload({ paket: 'colore', format: colore.formats[0], platte: colore.tiles[0].id, unterbau: colore.bases[0].id,
    top: colore.tops[0].id, becken: 'aufsatz', armaturenserie: 'treemme-up', finish: colore.finishes[0].id, keramik: colore.sanitary[0].id,
    wall: colore.walls[0].id, waschtisch: 'einzel', spiegel: colore.mirrors[0].id, dusche: 'keine', badewanne: 'einbau' }));
  const upParts = up.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
  assert.match(upParts[0].text, /four small round wall rosettes in one row just above the rim, .*thin pin lever, a round tube spout/);
  assert.match(upParts[0].text, new RegExp(`Image ${upParts.filter((part) => part.inlineData).length} is only a product photo of the bath mixer`));
});

test('der neue Spiegel geht als Bild mit, der alte wird ausdruecklich entfernt', async () => {
  // Jonathan am 25.09.: mit einem Wort zeichnete das Modell in 10 von 12 Proben den alten Spiegel nach.
  for (const [spiegel, words] of [
    // Gegenpruefung vom 27.09.: "as in image N above it, which replaces" hing "above it" und "which" an das Bild.
    ['spiegelschrank', /and above the vanity a new rectangular mirror cabinet as wide as the vanity, softly lighting the wall and washbasin from its underside, with flush mirror doors and a slim LED light line on its front along the top and both sides as in image \d+; this mirror replaces the old mirror or mirror cabinet and its lamp completely/],
    ['spiegel', /and above the vanity a new frameless rectangular mirror without a cabinet, as wide as the vanity, that softly lights the wall above and below it with hidden LED light along its top and bottom edges as in image \d+; this mirror replaces/],
  ]) {
    const h = harness();
    await h.invoke(payload({ spiegel }));
    const parts = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
    const prompt = parts[0].text;
    assert.match(prompt, words, spiegel);
    const number = Number(/Image (\d+) is only a product photo of the new mirror/.exec(prompt)?.[1]);
    assert.ok(number >= 2, spiegel);
    // Der Spiegel mit LED-Licht hat keine Tueren: der Satz zum Bild nennt keine (Gegenpruefung vom 26.09.).
    assert.doesNotMatch(prompt, /copy its shape, its doors/, spiegel);
    assert.match(prompt, new RegExp(`as in image ${number}; this mirror replaces the old mirror`), spiegel);
    // P7 und P8 vom 26.09.: der alte Spiegelschrank mit der Lampe darueber blieb. Der neue hat keine Lampe darueber,
    // und der alte steht mit seiner Lampe auch in der Liste dessen, was weg muss.
    assert.match(prompt, /nothing of their shape, frame or light is kept, and no lamp or light bar above the mirror;/, spiegel);
    assert.match(prompt, /REMOVE: .*; the old mirror or mirror cabinet with its lamp;/, spiegel);
    assert.ok(parts.filter((part) => part.inlineData)[number - 1].inlineData.data.startsWith('/9j/'), spiegel);
  }
});

test('Bodenplatte und Akzent gehen als eigene Muster mit, mit ihrer Bildnummer im Prompt', async () => {
  // Der Kunde waehlt beide am Bild; das Modell bekam bis zum 25.09. nur ihren Namen.
  const image = () => new Response(Buffer.from(PNG, 'base64'), { status: 200, headers: { 'content-type': 'image/png' } });
  const colore = optionsForPackage('colore');
  const floor = colore.tiles.find((entry) => entry.id !== colore.tiles[0].id);
  const h = harness({ swatch: () => image() });
  const res = await h.invoke(payload({
    paket: 'colore', format: colore.formats[0], platte: colore.tiles[0].id, boden: floor.id,
    unterbau: colore.bases[0].id, top: colore.tops[0].id, becken: 'aufsatz',
    armaturenserie: 'treemme-up', finish: colore.finishes[0].id, keramik: colore.sanitary[0].id,
    wall: colore.walls[0].id, dusche: colore.showers[0].id, badewanne: colore.bathtubs[0].id,
    waschtisch: colore.basins[0].id, spiegel: colore.mirrors[0].id,
  }));
  assert.equal(res.statusCode, 200, JSON.stringify(res.body).slice(0, 200));
  const floorPrompt = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(floorPrompt, /Image 3 is only a close-up sample of the floor tile\./);
  assert.match(floorPrompt, /and the floor in different .* tiles as in image 3;/);
  assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Boden geladen/);

  const atelier = optionsForPackage('atelier');
  const tile = atelier.tiles[0];
  const accent = atelier.accents.find((entry) => entry.placement.includes('waschtischwand'));
  const a = harness({ swatch: () => image() });
  const accentRes = await a.invoke(payload({
    paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id,
    kombination: 'kombination', akzentFlaeche: 'waschtischwand', akzent: accent.id,
    unterbau: atelier.bases[0].id, top: atelier.tops[0].id, becken: atelier.basinTypes[0].id,
    finish: atelier.finishes[0].id, keramik: atelier.sanitary[0].id,
    wall: atelier.walls[0].id, dusche: atelier.showers[0].id, badewanne: atelier.bathtubs[0].id,
    waschtisch: atelier.basins[0].id, spiegel: atelier.mirrors[0].id,
  }));
  assert.equal(accentRes.statusCode, 200, JSON.stringify(accentRes.body).slice(0, 200));
  const accentPrompt = a.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  assert.match(accentPrompt, /Image 3 is only a close-up sample of the accent material\./);
  assert.match(accentPrompt, /covered with .* as in image 3; every other surface keeps the main material\./);
  assert.match(JSON.stringify(a.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Akzent geladen/);
});

test('der Prompt bleibt kurz, und jede genannte Bildnummer hat ihr Bild', async () => {
  // Bis zum 23.09. waren es fuer diese Auswahl rund 2200 Woerter mit rund 80 Verboten. Fenster,
  // Decke und Dusche stehen seit dem 25.09. wieder im geprueften Wortlaut vom 19./20.09. (rund
  // 1540 Woerter). Die schwerste Auswahl ohne Wanne: Atelier mit Akzent, Walk-in, Aufputz, einem Fenster und dem
  // Grundriss aus der Vorpruefung. Mit Dusche und Wanne sind es mehr (Gegenpruefung vom 27.09.: Atelier mit Einbauwanne
  // rund 2210 Woerter, alles zusammen mit Dachschraege und drei Fenstern rund 2450).
  const image = () => new Response(Buffer.from(PNG, 'base64'), { status: 200, headers: { 'content-type': 'image/png' } });
  const atelier = optionsForPackage('atelier');
  const tile = atelier.tiles[0];
  const accent = atelier.accents.find((entry) => entry.placement.includes('duschnische'));
  const layout = () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom',
    walls: inv({ shower: 'back' }), order: ['washbasin', 'toilet', 'shower'], nearest: 'washbasin' }));
  const h = harness({ swatch: () => image(), photoChecks: [layout], checks: [() => checkedInv({ shower: 'back' }, { shower: 'back' })] });
  const res = await h.invoke(payload({
    paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id,
    kombination: 'kombination', akzentFlaeche: 'duschnische', akzent: accent.id,
    unterbau: atelier.bases[0].id, top: atelier.tops[0].id, becken: atelier.basinTypes[0].id,
    finish: atelier.finishes[0].id, keramik: atelier.sanitary[0].id, wall: 'halbhoch',
    dusche: 'walk-in', badewanne: 'keine', waschtisch: atelier.basins[0].id, spiegel: atelier.mirrors[0].id,
    cistern: 'aufputz', windows: '1',
  }));
  assert.equal(res.statusCode, 200, JSON.stringify(res.body).slice(0, 200));
  const parts = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
  const prompt = parts[0].text;
  const words = prompt.split(/\s+/).length;
  // Bewahren und Positionen stehen seit dem 25.09. wieder im Wortlaut der Website (dort 1954 Woerter fuer P1). Die
  // Korrekturen der sechsten Probe und ihrer Gegenpruefung (27.09.: Modul als Kasten 11 cm vor der Wand, Platten bis zur
  // Decke hinter dem Glas, Rinne mit Plattenbelag und flachem Gefaelle, Aurelia) brachten rund 110 Woerter; die Produkte
  // richtet seither vor allem der Produktdurchgang mit seinem eigenen, kurzen Auftrag.
  assert.ok(words < 2250, `der Prompt hat ${words} Woerter`);
  assert.match(prompt, /WHAT IMAGE 1 SHOWS/);
  // Foto, Platte, Akzent, Waschtisch (ein oder zwei Muster), Modul, Armaturen: jede Nummer im Text hat ihr Bild.
  const images = parts.filter((part) => part.inlineData).length;
  const named = [...new Set([...prompt.matchAll(/[Ii]mage (\d+)/g)].map((match) => Number(match[1])))].sort((x, y) => x - y);
  assert.deepEqual(named, Array.from({ length: images }, (_, index) => index + 1));
});

test('ein Fenster mehr oder weniger, an einer anderen Wand oder eine andere Decke loest den zweiten Versuch aus', async () => {
  // P4 und P5 vom 25.09.: "keine Fenster", im Ideenbild einmal ein Dachfenster, einmal ein Fenster links.
  const good = () => checkedInv({}, {}, { windows_before: 0, windows_after: 0 });
  const mailOf = (h) => JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  // Diego, 04.10.: die Fenster zuerst. Ein Fenster weniger verwirft das Bild, auch ohne extra_openings (1 -> 0).
  const lost = harness({ checks: [() => checkedInv({}, {}, { windows_before: 1, windows_after: 0 }), () => checkedInv({}, {}, { windows_before: 1, windows_after: 1 })] });
  assert.equal((await lost.invoke(payload({ windows: '1' }))).statusCode, 200);
  assert.equal(lost.counts().generation, 2);
  assert.match(lost.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text,
    /failed the check because a window was lost: the result shows 0 window\(s\) including roof windows, the photo 1/);
  // Bleibt es weg, sieht der Kunde kein Bild.
  const gone = () => checkedInv({}, {}, { windows_before: 1, windows_after: 0 });
  const goneRes = await harness({ checks: [gone, gone] }).invoke(payload({ windows: '1' }));
  assert.equal(goneRes.body.code, 'RENDER_REJECTED');
  // Verlangt ist die kleinere Zahl aus Angabe und Foto: ein Spiegel, den die Pruefung im Foto als Fenster zaehlt, verwirft
  // nichts, ein Fenster, das sie im Foto nicht sieht, wird nicht verlangt. "3 oder mehr" heisst mindestens drei.
  for (const [windows, before, after, rejected] of [['0', 1, 0, false], ['1', 2, 1, false], ['1', 0, 0, false], ['2', 2, 1, true],
    ['3', 5, 3, false], ['3', 3, 2, true], ['3', undefined, 2, true], ['3', undefined, 3, false]]) {
    const h = harness({ checks: [() => checkedInv({}, {}, { windows_before: before, windows_after: after }), good] });
    await h.invoke(payload({ windows }));
    assert.equal(h.counts().generation, rejected ? 2 : 1, `Angabe ${windows}, Foto ${before}, Bild ${after}`);
    if (rejected) assert.match(mailOf(h), /Bild 1 verworfen \(a window was lost/);
  }
  // Ein Fenster an einer anderen Wand hat dieselbe Zahl: das sieht extra_openings (weg und dazu).
  const moved = harness({ checks: [() => checkedInv({}, {}, { windows_before: 1, windows_after: 1, extra_openings: true, reason: 'the window moved from the left wall to the back wall' }),
    () => checkedInv({}, {}, { windows_before: 1, windows_after: 1 })] });
  assert.equal((await moved.invoke(payload({ windows: '1' }))).statusCode, 200);
  assert.equal(moved.counts().generation, 2);
  assert.match(mailOf(moved), /Bild 1 verworfen \(an opening was added or lost \(the window moved from the left wall to the back wall\)\)/);
  const added = harness({ checks: [() => checkedInv({}, {}, { windows_before: 0, windows_after: 1 }), good] });
  assert.equal((await added.invoke(payload({ windows: '0' }))).statusCode, 200);
  assert.equal(added.counts().generation, 2);
  assert.match(added.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text,
    /failed the check because a window was added: the result shows 1 window\(s\) including roof windows, the photo none/);
  // P8 vom 26.09.: das Fenster stand im Ideenbild an einer anderen Wand, die Pruefung sah nur ein groesseres Fenster.
  const openingsQuestion = added.calls.find((call) => call.url.includes('generativelanguage.googleapis.com') && !call.body?.generationConfig?.responseModalities
    && call.body.contents[0].parts.filter((part) => part.inlineData).length === 2).body.contents[0].parts[0].text;
  assert.match(openingsQuestion, /a window that now stands on a different wall than in image 1 counts as lost and added/);
  // Zaehlt das Pruefmodell einen Spiegel als Fenster, dann in beiden Bildern: das Bild bleibt.
  const mirror = harness({ checks: [() => checkedInv({}, {}, { windows_before: 1, windows_after: 1 })] });
  assert.equal((await mirror.invoke(payload({ windows: '0' }))).statusCode, 200);
  assert.equal(mirror.counts().generation, 1);
  // Ein Fenster wie angegeben; bei "3 oder mehr" zaehlt das Foto.
  for (const [windows, after] of [['1', 1], ['3', 5]]) {
    const same = harness({ checks: [() => checkedInv({}, {}, { windows_before: after, windows_after: after })] });
    assert.equal((await same.invoke(payload({ windows }))).statusCode, 200);
    assert.equal(same.counts().generation, 1, `windows ${windows}`);
  }
  // "3 oder mehr", und das Pruefmodell nennt keine Zahl fuer das Foto: keine Obergrenze (Pruefung vom 26.09.).
  const many = harness({ checks: [() => checkedInv({}, {}, { windows_after: 4 })] });
  assert.equal((await many.invoke(payload({ windows: '3' }))).statusCode, 200);
  assert.equal(many.counts().generation, 1);
  const twoOfOne = harness({ checks: [() => checkedInv({}, {}, { windows_before: 1, windows_after: 2 }), good] });
  await twoOfOne.invoke(payload({ windows: '1' }));
  assert.equal(twoOfOne.counts().generation, 2);
  // Decke: aus der flachen Decke wurde eine Dachschraege.
  const ceiling = harness({ checks: [() => checkedInv({}, {}, { ceiling_changed: true }), () => checkedInv({}, {}, { ceiling_changed: true })] });
  const res = await ceiling.invoke(payload());
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'RENDER_REJECTED');
  assert.match(JSON.stringify(ceiling.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /the ceiling changed its shape/);
  // Die Pruefung fragt nach der Zahl der Fenster und nach der Decke.
  const question = ceiling.calls.find((call) => /windows_after/.test(call.body?.contents?.[0]?.parts?.[0]?.text || '')).body.contents[0].parts[0].text;
  assert.match(question, /Count the windows in each image, roof windows and skylights included/);
  assert.match(question, /Set ceiling_changed true if the ceiling of image 2 has another shape/);
});

test('jede Badplaner-Mail geht an Diego mit Emanuel in Kopie, auch der Entwurf und auch ohne Variablen', async () => {
  // 25.09.: in der Vorschau (ohne BADPLANER_TO/CC) ging der Entwurf nur an Emanuel, auf der Website nur an Diego.
  const h = harness();
  await h.invoke(previewPayload());
  const draft = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(draft.body.subject, /^Badplaner-Entwurf ohne Kontakt/);
  assert.deepEqual(draft.body.to, ['diego.verdile@newlivingdesign.ch']);
  assert.deepEqual(draft.body.cc, ['emanuel.verdile@newlivingdesign.ch']);
  const lead = harness();
  await lead.invoke(payload());
  const leadMail = lead.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.deepEqual([leadMail.body.to, leadMail.body.cc], [['diego.verdile@newlivingdesign.ch'], ['emanuel.verdile@newlivingdesign.ch']]);
  const configured = harness({ env: { BADPLANER_TO: 'to@example.invalid', BADPLANER_CC: 'cc@example.invalid' } });
  await configured.invoke(previewPayload());
  const configuredDraft = configured.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.deepEqual([configuredDraft.body.to, configuredDraft.body.cc], [['to@example.invalid'], ['cc@example.invalid']]);
});

test('zeigt das Muster einer Grossformat-Platte ein Mosaik, nimmt das Modell nur Farbe und Maserung', async () => {
  // P1 vom 25.09.: fuer Dual Travertine White (120x278) ging das Mosaik 5x5 des Lieferanten als Muster mit.
  const image = () => new Response(Buffer.from(PNG, 'base64'), { status: 200, headers: { 'content-type': 'image/png' } });
  const atelier = optionsForPackage('atelier');
  const promptFor = async (tileId) => {
    const tile = atelier.tiles.find((entry) => entry.id === tileId);
    const h = harness({ swatch: () => image() });
    const res = await h.invoke(payload({
      paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id, kombination: 'einheitlich',
      unterbau: atelier.bases[0].id, top: atelier.tops[0].id, becken: atelier.basinTypes[0].id,
      finish: atelier.finishes[0].id, keramik: atelier.sanitary[0].id,
      wall: atelier.walls[0].id, dusche: atelier.showers[0].id, badewanne: atelier.bathtubs[0].id,
      waschtisch: atelier.basins[0].id, spiegel: atelier.mirrors[0].id,
    }));
    assert.equal(res.statusCode, 200, JSON.stringify(res.body).slice(0, 200));
    return h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  };
  assert.match(await promptFor('emilceramica-dual-travertine-beige-travertin'),
    /Image 2 is only a sample of the wall tile material shown as a small mosaic: take only its colour, stone pattern and finish; the tiles themselves are large slabs/);
  // Fuer Dual Travertine White liegt seit dem 25.09. das offizielle Muster der Platte im Repo.
  const white = await promptFor('emilceramica-dual-travertine-white-travertin');
  assert.match(white, /Image 2 is only a close-up sample of the wall tile: take its colour, texture and finish/);
  assert.equal(atelier.tiles.find((entry) => entry.id === 'emilceramica-dual-travertine-white-travertin').src, null);
});

test('Produktdurchgang: das gepruefte Bild geht mit den Produktbildern nochmals an Gemini, gezeigt wird das neue', async () => {
  // Diego, 27.09.: "sistemare una volta per sempre ... se servono immagini per tutto mettile". In sechs Proben blieben die
  // Produkte im ersten Durchgang oft falsch: die Platte wie von Geberit, die Duscharmaturen, der alte Spiegel, Aurelia wie Up+.
  const first = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC';
  const edited = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWM4ISd3Qk4OAAh3Agn/2+PxAAAAAElFTkSuQmCC';
  const h = harness({ env: { BADPLANER_PRODUCT_PASS: undefined }, generations: [() => generated(first), () => generated(edited)] });
  const res = await h.invoke();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(h.counts(), { generation: 2, checks: 2, mail: 2 });
  assert.equal(res.body.image.data, edited);
  const [, product] = h.calls.filter((call) => call.body?.generationConfig?.responseModalities);
  const parts = product.body.contents[0].parts;
  const prompt = parts[0].text;
  // Bild 1 ist das gepruefte Ideenbild, dann je ein Produkt mit seinem Satz: WC, Platte (Unterputz), Waschtisch, Spiegel.
  assert.deepEqual(parts.filter((part) => part.inlineData).map((part) => part.inlineData.data),
    [first, wc.WC_PHOTO.data, wc.FLUSH_PLATE_PHOTO.data, up.UP_BASIN_PHOTO.data, spiegel.MIRROR_CABINET_PHOTO.data]);
  assert.match(prompt, /^PRODUCT EDIT of image 1, not a new picture\. Image 1 is a finished photo of a renovated bathroom\./);
  // Gegenpruefung vom 27.09.: "bleibt, wo es ist" konnte heissen "das alte bleibt" und hielt ein zu flaches Modul fest.
  assert.match(prompt, /Each product keeps its wall and its place along that wall in image 1 and replaces whatever stands there, also an old or wrong model; its shape, parts, size, depth and height are those of its image and of its text, even where image 1 shows them differently\. A product that image 1 does not show at all is not added\./);
  assert.match(prompt, /Images 2 to 5 show only products: take nothing from their background, no wall, tile or floor\./);
  assert.doesNotMatch(prompt, /same proportions|plain background/);
  // Das Bild des Glam Twist zeigt das Becken ohne Sitz.
  assert.match(prompt, /\nImage 2, the toilet: it becomes exactly the toilet of image 2, with its flat, squared back, rounded only at the front, wall-hung and rimless, in white, with seat and lid in the same white, not wood; image 2 shows the bowl without its seat, which is thin and flat\./);
  // Weisse Keramik: kein Satz zur Farbe.
  assert.doesNotMatch(prompt, /keeps? (its|their) shape and place/);
  assert.match(prompt, /\nImage 3, the flush plate of the toilet: it becomes exactly the OLI Blink plate of image 3, in polished chrome: a flat rectangular plate, wider than high, with two equal round solid metal knobs about 3 cm across that stand slightly out of it side by side at mid-height, the gap between them a little wider than one knob, a small plus just below the left one and a small minus just below the right one, and nothing else on the plate\./);
  assert.match(prompt, /\nImage 4, the tap at each washbasin: it becomes exactly the fitting of image 4: exposed surface-mounted \(Aufputz\) Treemme Up\+ fittings/);
  assert.match(prompt, /\nImage 5, the mirror above the washbasin: it becomes exactly the mirror of image 5: a new rectangular mirror cabinet/);
  assert.doesNotMatch(prompt, /shower fittings|bath mixer|sanitary module/);
  // Die Pruefung vergleicht das neue Bild mit dem Foto, nicht mit dem ersten Ideenbild.
  const checks = h.calls.filter((call) => call.url.includes('generativelanguage') && !call.body.generationConfig.responseModalities
    && call.body.contents[0].parts.filter((part) => part.inlineData).length === 2);
  assert.deepEqual(checks[1].body.contents[0].parts.filter((part) => part.inlineData).map((part) => part.inlineData.data), [PNG, edited]);
  const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
  assert.match(JSON.stringify(leadMail.body), /Fensterprüfung.{0,80}>ok, Produktdurchgang ok</);
  // NLD bekommt auch das Bild davor.
  assert.deepEqual(leadMail.body.attachments.map(({ filename }) => filename), ['foto.png', 'ideenbild.png', 'vor-produktdurchgang.png']);
  assert.equal(leadMail.body.attachments[2].content, first);
});

test('Produktdurchgang: faellt das neue Bild durch, hat es einen schweren Hinweis mehr oder kommt keines, bleibt das erste', async () => {
  const first = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC';
  const edited = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWM4ISd3Qk4OAAh3Agn/2+PxAAAAAElFTkSuQmCC';
  const on = { BADPLANER_PRODUCT_PASS: undefined };
  const run = async (settings) => {
    const h = harness({ env: on, generations: [() => generated(first), settings.product ?? (() => generated(edited))], checks: settings.checks, ...settings.extra });
    const res = await h.invoke();
    assert.equal(res.statusCode, 200);
    const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
    return { res, h, mail: JSON.stringify(leadMail.body), files: leadMail.body.attachments.map(({ filename }) => filename) };
  };
  // Eine neue Oeffnung: verworfen; NLD sieht das verworfene Bild.
  const opening = await run({ checks: [() => checked(), () => checked(true)] });
  assert.equal(opening.res.body.image.data, first);
  assert.match(opening.mail, /Fensterprüfung.{0,80}>ok, Produktdurchgang verworfen \(an opening was added or lost/);
  assert.deepEqual(opening.files, ['foto.png', 'ideenbild.png', 'produktdurchgang-nicht-gezeigt.png']);
  // Das alte WC ist wieder da: ein schwerer Hinweis mehr als vorher.
  const old = await run({ checks: [() => checked(), () => checkedInv({}, {}, { toilet_kept: true })] });
  assert.equal(old.res.body.image.data, first);
  assert.match(old.mail, /Produktdurchgang nicht gezeigt \(the toilet is still the old one of the photo\)/);
  // Ein leichter Hinweis mehr reicht nicht, um das neue Bild nicht zu zeigen; er steht in der Mail.
  const light = await run({ checks: [() => checked(), () => checkedInv({}, {}, { toilet_on_low_wall_before: true, toilet_on_low_wall_after: false })] });
  assert.equal(light.res.body.image.data, edited);
  assert.match(light.mail, /Produktdurchgang ok, Hinweis: the low wall the toilet stood against is gone/);
  // Ein schwerer Hinweis, den der Produktdurchgang behebt: das neue Bild.
  const mirror = () => checkedInv({}, {}, { mirror_kept: true });
  const fixed = await run({ checks: [mirror, mirror, () => checked()], product: undefined, extra: { generations: [() => generated(first), () => generated(first), () => generated(edited)] } });
  assert.equal(fixed.res.body.image.data, edited);
  assert.equal(fixed.h.counts().generation, 3);
  // Die Mail urteilt nach dem Bild, das der Kunde bekommt, also nach dem Produktdurchgang (04.10.).
  assert.match(fixed.mail, /Bild 2 nicht gezeigt \(Hinweise: the mirror above the washbasin is still the old one of the photo\), Bild 1 ok, Produktdurchgang ok</);
  // Der Bilddienst liefert nicht: das erste, ohne weiteres Bild in der Mail.
  const down = await run({ checks: [() => checked()], product: () => response({ error: 'boom' }, 500) });
  assert.equal(down.res.body.image.data, first);
  assert.match(down.mail, /Fensterprüfung.{0,80}>ok, Produktdurchgang: Bilddienst: HTTP 500</);
  assert.deepEqual(down.files, ['foto.png', 'ideenbild.png']);
  // Zu wenig Zeit nach einem langsamen ersten Durchgang (60 s Bild, 503 und 19 s Pruefung zweimal).
  const slow = await run({ checks: [() => response({}, 503), () => checked()], extra: { generateDelays: [60000], checkDelays: [19000, 19000] } });
  assert.equal(slow.h.counts().generation, 1);
  assert.match(slow.mail, /Fensterprüfung.{0,80}>ok, kein Produktdurchgang \(zu wenig Zeit\)</);
  // Ohne Pruefung laeuft er trotzdem, und die Mail sagt es.
  const off = harness({ env: { ...on, BADPLANER_CHECK_MODEL: '' }, generations: [() => generated(first), () => generated(edited)] });
  const offRes = await off.invoke();
  assert.equal(offRes.body.image.data, edited);
  assert.match(JSON.stringify(off.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Fensterprüfung.{0,80}>deaktiviert, Produktdurchgang ok</);
});

test('Produktdurchgang: Aufputz mit dem Modul statt der Platte, Atelier mit dem WC Mare von Cielo und Aurelia', async () => {
  const on = { BADPLANER_PRODUCT_PASS: undefined };
  const productCall = (h) => h.calls.filter((call) => call.body?.generationConfig?.responseModalities).find((call) => call.body.contents[0].parts[0].text.startsWith('PRODUCT EDIT'));
  const aufputz = harness({ env: on });
  assert.equal((await aufputz.invoke(payload({ cistern: 'aufputz' }))).statusCode, 200);
  const aufputzParts = productCall(aufputz).body.contents[0].parts;
  assert.deepEqual(aufputzParts.filter((part) => part.inlineData).slice(1).map((part) => part.inlineData.data),
    [wc.WC_PHOTO.data, modul.SANITARY_MODULE_PHOTO.data, up.UP_BASIN_PHOTO.data, spiegel.MIRROR_CABINET_PHOTO.data]);
  assert.match(aufputzParts[0].text, /Image 3, the sanitary module behind the toilet: it becomes exactly the OLI QR module of image 3: a factory-made box about 50 cm wide, 115 cm high and 11 cm deep, standing on the floor with its back against the wall, so that its opaque white glass front in two parts stands 11 cm in front of the wall and its brushed steel side, 11 cm wide, is clearly visible; .*; no flush plate\. Where image 1 shows it flatter, sunk in or boxed in, it stands out to this depth, and the toilet hangs on its front\./);
  assert.doesNotMatch(aufputzParts[0].text, /flush plate of the toilet|OLI Blink/);
  // Atelier (Diego, 27.09.): das WC Mare von Ceramica Cielo, nicht das Glam Twist von Scarabeo; Farbe aus Terre di Cielo.
  const atelier = optionsForPackage('atelier');
  const tile = atelier.tiles[0];
  const pomice = atelier.sanitary.find((entry) => entry.id === 'cielo-pomice');
  const h = harness({ env: on, checks: [() => checkedInv({ bathtub: 'back' }, { bathtub: 'back' }), () => checkedInv({ bathtub: 'back' }, { bathtub: 'back' })] });
  assert.equal((await h.invoke(payload({ paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id, kombination: 'einheitlich',
    unterbau: atelier.bases[0].id, top: atelier.tops[0].id, becken: atelier.basinTypes[0].id, finish: 'treemme-nero-opaco', keramik: pomice.id,
    wall: atelier.walls[0].id, dusche: 'keine', badewanne: 'freistehend', waschtisch: atelier.basins[0].id, spiegel: 'spiegel' }))).statusCode, 200);
  const first = h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts;
  assert.ok(first.some((part) => part.inlineData?.data === wc.CIELO_WC_PHOTO.data));
  assert.ok(!first.some((part) => part.inlineData?.data === wc.WC_PHOTO.data));
  assert.match(first[0].text, /the new toilet of image \d+ with its smooth body that narrows towards its rounded underside, with a thin flat seat and lid, never shaped like the old one, wall-hung and rimless in pumice/);
  const parts = productCall(h).body.contents[0].parts;
  assert.deepEqual(parts.filter((part) => part.inlineData).slice(1).map((part) => part.inlineData.data),
    [wc.CIELO_WC_PHOTO.data, wc.FLUSH_PLATE_PHOTO.data, aurelia.AURELIA_BASIN_PHOTO.data, aurelia.AURELIA_BATH_FLOOR_PHOTO.data, spiegel.LED_MIRROR_PHOTO.data]);
  assert.match(parts[0].text, new RegExp(`Image 2, the toilet: it becomes exactly the toilet of image 2, with its smooth body .*in ${pomice.prompt.replace(/[()]/g, '\\$&')}, with seat and lid in the same`));
  // Das Mare hat seinen Sitz im Bild.
  assert.doesNotMatch(parts[0].text, /without its seat/);
  // Farbige Keramik: das Becken (Aufsatzbecken) nimmt die Farbe des WC; ohne Duschwanne nur das Becken.
  assert.match(parts[0].text, new RegExp(`\\nThe washbasin bowl keeps its shape and place and takes the same ${pomice.prompt} as the toilet; the product photos are white, only their shapes count\\.\\n`));
  assert.match(parts[0].text, /Image 3, the flush plate of the toilet: it becomes exactly the OLI Blink plate of image 3, in matte black/);
  assert.match(parts[0].text, /Image 4, the tap at each washbasin: it becomes exactly the fitting of image 4: concealed built-in \(Unterputz\) Treemme Aurelia wall fittings in matte black/);
  // "of the same series and finish" verweist im ersten Durchgang auf die anderen Armaturen; hier gibt es keinen Bezug.
  assert.match(parts[0].text, /Image 5, the bath mixer: it becomes exactly the fitting of image 5, in matte black: beside the freestanding bathtub a floor-standing bath mixer: a slim round column/);
  assert.match(parts[0].text, /Image 6, the mirror above the washbasin: it becomes exactly the mirror of image 6: a new frameless rectangular mirror/);
  assert.doesNotMatch(parts[0].text, /shower fittings/);
  // Mit Dusche: das Duschset mit seinem Satz, alle Armaturen an einer Wand.
  const shower = harness({ env: on, checks: [() => checkedInv({}, { shower: 'back' }), () => checkedInv({}, { shower: 'back' })] });
  assert.equal((await shower.invoke(payload({ paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id, kombination: 'einheitlich',
    unterbau: atelier.bases[0].id, top: atelier.tops[0].id, becken: atelier.basinTypes[0].id, finish: atelier.finishes[0].id, keramik: atelier.sanitary[0].id,
    wall: atelier.walls[0].id, dusche: 'walk-in', badewanne: 'keine', waschtisch: atelier.basins[0].id, spiegel: atelier.mirrors[0].id }))).statusCode, 200);
  // Ohne Stirnwand aus der Vorpruefung: die Wand der Handbrause im Bild.
  assert.match(productCall(shower).body.contents[0].parts[0].text, /Image 5, the shower fittings: they become exactly the fittings of image 5, in polished chrome: in one row at the same height: the hose outlet .*never one large plate with both.*\. They all sit together on the wall where image 1 has the hand shower; any other shower mixer, plate or hand shower inside the shower area is removed, and the wall surface simply continues over its place\.\n/);
  // Mit Stirnwand: dieselbe Wand wie im ersten Durchgang, beim Walk-in mit der Rinne an ihrem Fuss.
  const end = () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv({ bathtub: 'back' }), order: ['toilet', 'bathtub', 'washbasin'], nearest: 'washbasin', shower_back: 'along', shower_left: true }));
  const known = harness({ env: on, photoChecks: [end], checks: [() => checkedInv({ bathtub: 'back' }, { shower: 'left' }), () => checkedInv({ bathtub: 'back' }, { shower: 'left' })] });
  assert.equal((await known.invoke(payload({ paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id, kombination: 'einheitlich',
    unterbau: atelier.bases[0].id, top: atelier.tops[0].id, becken: atelier.basinTypes[0].id, finish: atelier.finishes[0].id, keramik: atelier.sanitary[0].id,
    wall: atelier.walls[0].id, dusche: 'walk-in', badewanne: 'keine', waschtisch: atelier.basins[0].id, spiegel: atelier.mirrors[0].id }))).statusCode, 200);
  assert.match(productCall(known).body.contents[0].parts[0].text, /They all sit together on the left wall seen from the camera, the short end wall of the shower, at whose foot the channel drain lies, seen from the side and foreshortened; the back wall of the shower carries none; any other shower mixer/);
  assert.doesNotMatch(productCall(known).body.contents[0].parts[0].text, /The bath mixer at the bathtub is separate/);
});

test('Produktdurchgang: farbige Keramik fuer Becken und Duschwanne, die weisse Vorlage zaehlt nur fuer die Form', async () => {
  // Siebte Probe mit farbiger Keramik (Diego, 27.09.). Die Bilder von WC und Modul sind weiss; Becken und Duschwanne
  // haben kein Bild und bekamen im ersten Durchgang manchmal eine andere Farbe als das WC.
  const colore = optionsForPackage('colore');
  const ardesia = colore.sanitary.find((entry) => entry.id === 'scarabeo-ardesia');
  const h = harness({ env: { BADPLANER_PRODUCT_PASS: undefined }, checks: [() => checkedInv({}, { shower: 'back' }), () => checkedInv({}, { shower: 'back' })] });
  assert.equal((await h.invoke(payload({ paket: 'colore', format: colore.formats[0], platte: colore.tiles[0].id, unterbau: colore.bases[0].id, top: colore.tops[0].id,
    becken: 'aufsatz', armaturenserie: 'treemme-up', finish: 'treemme-cromo', keramik: ardesia.id, wall: colore.walls[0].id,
    dusche: 'duschwanne', badewanne: 'keine', waschtisch: 'einzel', spiegel: colore.mirrors[0].id }))).statusCode, 200);
  const product = h.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text;
  assert.match(product, /Image 2, the toilet: it becomes exactly the toilet of image 2, .*in slate grey matte ceramic, with seat and lid in the same slate grey matte ceramic, not wood/);
  assert.match(product, /\nThe washbasin bowl and the shower tray keep their shape and place and take the same slate grey matte ceramic as the toilet; the product photos are white, only their shapes count\.\nEverything else stays exactly as it is in image 1\./);
  // Ein Becken aus dem Material der Platte (integriert) nimmt die Farbe nicht.
  const atelier = optionsForPackage('atelier');
  const tile = atelier.tiles[0];
  const integrated = harness({ env: { BADPLANER_PRODUCT_PASS: undefined } });
  assert.equal((await integrated.invoke(payload({ paket: 'atelier', look: tile.look, format: tile.format, platte: tile.id, kombination: 'einheitlich',
    unterbau: atelier.bases[0].id, top: atelier.tops[0].id, becken: 'integriert', finish: atelier.finishes[0].id, keramik: 'cielo-basalto',
    wall: atelier.walls[0].id, dusche: 'keine', badewanne: 'keine', waschtisch: atelier.basins[0].id, spiegel: atelier.mirrors[0].id }))).statusCode, 200);
  assert.doesNotMatch(integrated.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text, /keeps? (its|their) shape and place/);
});

test('Badewanne und Dusche zusammen nur, wenn das Foto schon beide zeigt', async () => {
  // Diego, 27.09.: "la combinazione vasca + doccia si fa solo se la foto mostra già una combinazione vasca e doccia".
  const photo = (walls) => () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv(walls), order: ['washbasin', 'toilet'], nearest: 'toilet' }));
  const both = previewPayload({ dusche: 'walk-in', badewanne: 'einbau' });
  for (const [walls, seen] of [[{ bathtub: 'back' }, 'nur eine Badewanne'], [{ shower: 'back' }, 'nur eine Dusche'], [{}, 'weder eine Badewanne noch eine Dusche']]) {
    const h = harness({ photoChecks: [photo(walls)] });
    const res = await h.invoke(both);
    assert.equal(res.statusCode, 422);
    assert.equal(res.body.code, 'BATH_AND_SHOWER_NOT_IN_PHOTO');
    assert.equal(res.body.error, `Auf Ihrem Foto sehen wir ${seen}. Badewanne und Dusche zusammen planen wir nur, wenn auf dem Foto beide schon zu sehen sind. Bitte wählen Sie in Schritt 2 unter «Dusche / Badewanne» nur die Dusche oder nur die Badewanne und erstellen Sie das Ideenbild danach nochmals.`);
    assert.equal(h.counts().generation, 0);
    assert.equal(res.headers['Set-Cookie'], undefined, 'kein Tagesversuch');
    const leadMail = h.calls.find((call) => call.url === 'https://api.resend.com/emails');
    assert.match(leadMail.body.subject, /Wanne und Dusche, Foto zeigt nicht beide/);
    assert.match(JSON.stringify(leadMail.body), new RegExp(`Badewanne und Dusche gewählt, auf dem Foto ist aber ${seen} zu sehen`));
    assert.deepEqual(leadMail.body.attachments.map(({ filename }) => filename), ['foto.png']);
  }
  // Beide im Foto, nur eines gewaehlt oder der Grundriss unlesbar: das Bild wie bisher.
  const fine = () => checkedInv({ bathtub: 'back', shower: 'right' }, { bathtub: 'back', shower: 'right' });
  const ok = harness({ photoChecks: [photo({ bathtub: 'back', shower: 'right' })], checks: [fine] });
  assert.equal((await ok.invoke(both)).statusCode, 200);
  const one = harness({ photoChecks: [photo({ bathtub: 'back' })], checks: [() => checkedInv({ bathtub: 'back' }, { bathtub: 'back' })] });
  assert.equal((await one.invoke(previewPayload({ dusche: 'keine', badewanne: 'einbau' }))).statusCode, 200);
  const unread = harness({ checks: [fine] });
  assert.equal((await unread.invoke(both)).statusCode, 200);
});

test('Vorpruefung: die beruehrten Waende sagen die Enden der Wanne, die Armaturen kommen zum Waschtisch, sonst zum WC', async () => {
  // P2 und P5 der siebten Probe: die quere Wanne, von Wand zu Wand an der Rueckwand, las die Vorpruefung als laengs an der
  // linken Wand. Jetzt sagt sie nur, welche Waende die Wanne beruehrt; Enden und Laengsseite rechnet der Code (Diego, 27.09.).
  const photo = (extra, walls = {}) => () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv({ bathtub: 'back', ...walls }), order: ['toilet', 'bathtub', 'washbasin'], nearest: 'washbasin', ...extra }));
  const run = async (extra, walls) => {
    const h = harness({ photoChecks: [photo(extra, walls)], checks: [() => checkedInv({ bathtub: 'back' }, { shower: 'back' })] });
    assert.equal((await h.invoke(payload({ dusche: 'walk-in', badewanne: 'keine' }))).statusCode, 200);
    return h;
  };
  const promptOf = (h) => h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  // Mit einem Ende an der Rueckwand, der rechten Wand entlang: die Rueckwand ist die Stirnwand.
  assert.match(promptOf(await run({ shower_back: 'end', shower_right: true })), /The short end wall of the shower is the back wall seen from the camera: .*lies along its foot; its long side runs along the right wall, which carries no fitting, only tiles\./);
  // Der Rueckwand entlang, von Wand zu Wand (P2): die Armaturen an das Ende zum Waschtisch, dort kommt das Wasser an.
  const wide = { shower_back: 'along', shower_left: true, shower_right: true };
  const p2 = await run(wide, { washbasin: 'right', toilet: 'right' });
  assert.match(promptOf(p2), /The short end wall of the shower is the right wall seen from the camera\. Seen from the door, the mixer, the overhead shower and the hand shower are on this right wall, next to the washbasin cabinet, seen from the side and foreshortened, with the overhead shower sticking out from it towards the left, and the channel drain lies along its foot\. The back wall of the shower stays empty: only tiles, no mixer, no hand shower and no shower head\./);
  assert.match(JSON.stringify(p2.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Wanne\/Dusche berührt links, rechts, hinten der Länge nach; Längsseite hinten, Stirnwand rechts \(zum Waschtisch\)/);
  // Steht der Waschtisch an keiner Seitenwand, zaehlt seine Seite in der Reihe von links nach rechts; ohne ihn die des WCs.
  assert.match(promptOf(await run(wide, { washbasin: 'front' })), /The short end wall of the shower is the right wall/);
  assert.match(promptOf(await run(wide, { washbasin: 'none', toilet: 'left' })), /The short end wall of the shower is the left wall/);
  // Nie an ein offenes Ende: beruehrt die Wanne nur die linke Wand, bleibt es links, auch mit dem Waschtisch rechts.
  assert.match(promptOf(await run({ shower_back: 'along', shower_left: true }, { washbasin: 'right' })), /The short end wall of the shower is the left wall/);
  // Kein Ende an einer Wand: keine Stirnwand.
  assert.doesNotMatch(promptOf(await run({ shower_back: 'along' })), /The short end wall/);
  // Liest sie die quere Wanne trotzdem als laengs (P2), gilt der Waschtisch gleich neben einem Ende: seine Wand ist die Stirnwand.
  const misread = { shower_back: 'end', shower_left: true, basin_beside_end: true };
  assert.match(promptOf(await run(misread, { washbasin: 'right', toilet: 'right' })), /The short end wall of the shower is the right wall seen from the camera\. .*The back wall of the shower stays empty/);
  // Nicht, wenn seine Wand die Laengsseite ist: dann steht er vor dem offenen Ende, und die Rueckwand bleibt.
  assert.match(promptOf(await run(misread, { washbasin: 'left' })), /The short end wall of the shower is the back wall/);
  // Die Frage selbst.
  const h = harness();
  await h.invoke();
  const question = h.calls.find((call) => call.url.includes('generativelanguage') && call.body.contents[0].parts.filter((part) => part.inlineData).length === 1).body.contents[0].parts[0].text;
  assert.match(question, /If the photo shows a bathtub, or a shower when there is no bathtub, say which walls it touches, seen from the camera: /);
  assert.match(question, /Then set basin_beside_end true if the washbasin or its cabinet stands right beside one of the two narrow ends of that bathtub or shower, almost touching it/);
  assert.match(question, /"shower_left":false,"shower_right":false,"shower_back":"none","basin_beside_end":false\}$/);
});

test('die Pruefung fragt, ob das WC noch das alte ist; das ist ein schwerer Hinweis', async () => {
  // P3 der sechsten Probe: das WC war nicht das neue, und das Bild ging an den Kunden. Seit dem 04.10. geht es nicht
  // mehr hinaus, wenn auch der zweite Durchgang das alte WC zeigt.
  const old = () => checkedInv({}, {}, { toilet_kept: true });
  const h = harness({ checks: [old, old] });
  assert.equal((await h.invoke()).statusCode, 502);
  assert.equal(h.counts().generation, 2);
  const question = h.calls.find((call) => call.url.includes('generativelanguage') && !call.body.generationConfig.responseModalities
    && call.body.contents[0].parts.filter((part) => part.inlineData).length === 2).body.contents[0].parts[0].text;
  assert.match(question, /set toilet_kept true if the toilet of image 2 is still the old toilet of image 1, with the same shape, not a new model/);
  assert.match(question, /"mirror_kept":false,"toilet_kept":false,/);
  assert.match(h.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text,
    /A previous attempt was wrong because the toilet is still the old one of the photo\. Start again from image 1/);
  assert.match(JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body), /Hinweis: the toilet is still the old one of the photo/);
});

test('Gegenpruefung des Codes vom 27.09.: Produktdurchgang mit zwei Bildern, ohne WC oder Waschtisch im Foto, ungeprueftes Bild davor', async () => {
  const other = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC';
  const edited = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWM4ISd3Qk4OAAh3Agn/2+PxAAAAAElFTkSuQmCC';
  const on = { BADPLANER_PRODUCT_PASS: undefined };
  const mailOf = (h) => JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  const generations = (h) => h.calls.filter((call) => call.body?.generationConfig?.responseModalities);
  // Wie auf der Seite: zwei Bilder, dann der Produktdurchgang auf dem besseren.
  const byImage = (answers) => (init) => answers[JSON.parse(init.body).contents[0].parts.filter((part) => part.inlineData)[1].inlineData.data]();
  const lowWall = () => checkedInv({}, {}, { toilet_on_low_wall_before: true, toilet_on_low_wall_after: false });
  const answers = byImage({ [PNG]: lowWall, [other]: () => checked(), [edited]: () => checked() });
  const two = harness({ env: { ...on, BADPLANER_CANDIDATES: undefined }, generations: [() => generated(PNG), () => generated(other), () => generated(edited)], checks: [answers, answers, answers] });
  const twoRes = await two.invoke();
  assert.equal(twoRes.statusCode, 200);
  assert.equal(generations(two).length, 3);
  assert.equal(generations(two)[2].body.contents[0].parts.find((part) => part.inlineData).inlineData.data, other);
  assert.equal(twoRes.body.image.data, edited);
  assert.match(mailOf(two), /Bild 1 nicht gezeigt \(Hinweise: the low wall the toilet stood against is gone\), Bild 2 ok, Produktdurchgang ok</);
  // Zeigt das Foto kein WC, nennt der Produktdurchgang weder WC noch Platte; ohne Waschtisch weder Armatur noch Spiegel.
  const layout = (walls) => () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv(walls), order: ['washbasin'], nearest: 'washbasin' }));
  const noToilet = harness({ env: on, photoChecks: [layout({ toilet: 'none' })] });
  assert.equal((await noToilet.invoke()).statusCode, 200);
  const noToiletPrompt = generations(noToilet)[1].body.contents[0].parts[0].text;
  assert.doesNotMatch(noToiletPrompt, /the toilet:|flush plate/);
  assert.match(noToiletPrompt, /\nImage 2, the tap at each washbasin: .*\nImage 3, the mirror above the washbasin:/);
  const noBasin = harness({ env: on, photoChecks: [layout({ washbasin: 'none' })] });
  assert.equal((await noBasin.invoke()).statusCode, 200);
  const noBasinPrompt = generations(noBasin)[1].body.contents[0].parts[0].text;
  assert.doesNotMatch(noBasinPrompt, /tap at each washbasin|mirror above the washbasin/);
  assert.match(noBasinPrompt, /\nImage 2, the toilet: .*\nImage 3, the flush plate of the toilet:/);
  // Liess sich das Bild davor nicht pruefen und besteht der Produktdurchgang die Pruefung, urteilt die Mail seit der
  // Revision vom 04.10. nach dem gezeigten Bild (eigener Test unten).
  const busy = () => response({ error: 'busy' }, 503);
  const unchecked = harness({ env: on, generations: [() => generated(PNG), () => generated(edited)], checks: [busy, busy, () => checked()] });
  const uncheckedRes = await unchecked.invoke();
  assert.equal(uncheckedRes.body.image.data, edited);
  assert.match(mailOf(unchecked), /Fensterprüfung.{0,80}>ok, Produktdurchgang ok</);
});

test('Revision vom 04.10.: das Etikett in der Mail urteilt nur nach dem gezeigten Bild, auch wenn das Bild davor ungeprueft war', async () => {
  const edited = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWM4ISd3Qk4OAAh3Agn/2+PxAAAAAElFTkSuQmCC';
  const on = { BADPLANER_PRODUCT_PASS: undefined };
  const busy = () => response({ error: 'busy' }, 503);
  const mailOf = (h) => JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  const run = (productCheck) => harness({ env: on, generations: [() => generated(PNG), () => generated(edited)], checks: [busy, busy, productCheck] });
  // Bild 1 ungeprueft, der Produktdurchgang besteht ohne Hinweis: das Bild geht hinaus, und die Mail sagt nicht "ungeprüft".
  const clean = run(() => checked());
  const cleanRes = await clean.invoke();
  assert.equal(cleanRes.statusCode, 200);
  assert.equal(cleanRes.body.image.data, edited);
  assert.match(mailOf(clean), /Fensterprüfung.{0,80}>ok, Produktdurchgang ok</);
  assert.doesNotMatch(mailOf(clean), /ungeprüft/);
  // Bild 1 ungeprueft, der Produktdurchgang mit einem schweren Hinweis: ohne Pruefung davor wird er gezeigt, darum haelt
  // ihn erst der Schluss zurueck, und das Etikett nennt den Hinweis des gezeigten Bildes.
  const kept = run(() => checkedInv({}, {}, { mirror_kept: true }));
  const keptRes = await kept.invoke();
  assert.equal(keptRes.statusCode, 502);
  assert.equal(keptRes.body.code, 'RENDER_REJECTED');
  assert.equal(keptRes.body.image, undefined);
  assert.match(mailOf(kept), /Ideenbild zurückgehalten \(schwerer Hinweis\)/);
  assert.match(mailOf(kept), /Fensterprüfung.{0,80}>Bild 1 mit schwerem Hinweis, Produktdurchgang ok, Hinweis: the mirror above the washbasin is still the old one of the photo/);
  assert.doesNotMatch(mailOf(kept), /ungeprüft/);
});

test('Gegenpruefung des Codes vom 27.09.: Stirnwand und Laengsseite in Vorpruefung und Pruefung', async () => {
  const photo = (extra) => () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv({ bathtub: 'back' }), order: ['toilet', 'bathtub', 'washbasin'], nearest: 'washbasin', ...extra }));
  const body = payload({ dusche: 'walk-in', badewanne: 'keine' });
  // Beruehrt die Wanne die Rueckwand nicht, hat kein Ende eine Wand: keine Stirnwand im Prompt.
  const parallel = harness({ photoChecks: [photo({ shower_left: true, shower_right: true })], checks: [() => checkedInv({ bathtub: 'back' }, { shower: 'back' })] });
  assert.equal((await parallel.invoke(body)).statusCode, 200);
  assert.doesNotMatch(parallel.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text, /The short end wall/);
  // Wanne mit dem Kopfende hinten und der Laengsseite rechts: die Dusche an der rechten Wand ist richtig (P2 und P5).
  const corner = photo({ shower_back: 'end', shower_right: true });
  const right = harness({ photoChecks: [corner], checks: [() => checkedInv({ bathtub: 'back' }, { shower: 'right' })] });
  assert.equal((await right.invoke(body)).statusCode, 200);
  assert.equal(right.counts().generation, 1);
  // An der linken Wand bleibt es ein grober Fehler.
  const left = harness({ photoChecks: [corner], checks: [() => checkedInv({ bathtub: 'back' }, { shower: 'left' }), () => checkedInv({ bathtub: 'back' }, { shower: 'back' })] });
  assert.equal((await left.invoke(body)).statusCode, 200);
  assert.equal(left.counts().generation, 2);
  assert.match(left.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text,
    /failed the check because the new shower stands on the left wall, the bathtub it replaces stood on the back wall/);
});

test('Problem 1 der siebten Probe: die Armaturen an der Stirnwand, die Vorpruefung liest die Lage der Wanne, die Pruefung die Waende der Armaturen', async () => {
  // P1 und P5 der siebten Probe: alle Armaturen an der Laengswand; P8: zwei Saetze an zwei Waenden. Sechste Probe: P2, P5.
  const photo = (extra) => () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv({ toilet: 'right', washbasin: 'right', bathtub: 'back' }),
    order: ['bathtub', 'washbasin', 'toilet'], nearest: 'toilet', ceiling: 'flat', ...extra }));
  const across = { shower_back: 'along', shower_left: true };
  const body = payload({ dusche: 'walk-in', badewanne: 'keine' });
  const promptOf = (h) => h.calls.find((call) => call.body?.generationConfig?.responseModalities).body.contents[0].parts[0].text;
  const mailOf = (h) => JSON.stringify(h.calls.find((call) => call.url === 'https://api.resend.com/emails').body);
  // Wanne quer an der Rueckwand, Stirnwand links: die Armaturen links, von der Seite gesehen, die Rueckwand ohne.
  const right = () => checkedInv({ bathtub: 'back' }, { shower: 'back' }, { shower_fittings_walls: ['left'], drain_wall: 'left', shower_floor_after: 'tiles', shower_step: false });
  const h = harness({ photoChecks: [photo(across)], checks: [right] });
  assert.equal((await h.invoke(body)).statusCode, 200);
  assert.equal(h.counts().generation, 1);
  assert.match(promptOf(h), /The short end wall of the shower is the left wall seen from the camera\. Seen from the door, the mixer, the overhead shower and the hand shower are on this left wall, seen from the side and foreshortened, with the overhead shower sticking out from it towards the right, and the channel drain lies along its foot\. The back wall of the shower stays empty: only tiles, no mixer, no hand shower and no shower head\./);
  // Was Vorpruefung und Pruefung sahen, steht in der Mail (die Logs von Vercel sind fuer uns nicht lesbar).
  assert.match(mailOf(h), /Vorprüfung<\/td><td[^>]*>WC rechts, Waschtisch rechts, Wanne hinten; Wanne\/Dusche berührt links, hinten der Länge nach; Längsseite hinten, Stirnwand links; Decke flach</);
  assert.match(mailOf(h), /Dusche im Bild<\/td><td[^>]*>Armaturen: links; Rinne: links; Boden: Platten; Stufe: nein</);
  // Die Vorpruefung denkt mehr nach als die Pruefung jedes Bildes.
  const levels = h.calls.filter((call) => call.url.includes('generativelanguage') && !call.body.generationConfig.responseModalities)
    .map((call) => call.body.generationConfig.thinkingConfig?.thinkingLevel);
  assert.deepEqual(levels, ['high', 'low']);
  // Armaturen an der Rueckwand, der Laengsseite: ein schwerer Hinweis, ein zweiter Durchgang mit dem Grund.
  const back = () => checkedInv({ bathtub: 'back' }, { shower: 'back' }, { shower_fittings_walls: ['back'] });
  const wrong = harness({ photoChecks: [photo(across)], checks: [back, right] });
  assert.equal((await wrong.invoke(body)).statusCode, 200);
  assert.equal(wrong.counts().generation, 2);
  assert.match(wrong.calls.filter((call) => call.body?.generationConfig?.responseModalities)[1].body.contents[0].parts[0].text,
    /A previous attempt was wrong because the shower fittings are on the back wall; seen from the door they all belong on the left wall at the short end of the shower, seen from the side, and the back wall stays empty\. Start again from image 1/);
  assert.match(mailOf(wrong), /Bild 1 nicht gezeigt \(Hinweise: the shower fittings are on the back wall; seen from the door they all belong on the left wall at the short end of the shower, seen from the side, and the back wall stays empty\), Bild 2 ok/);
  // Zwei Saetze an zwei Waenden (P8): ebenso.
  const split = () => checkedInv({ bathtub: 'back' }, { shower: 'back' }, { shower_fittings_walls: ['back', 'left'] });
  const twice = harness({ photoChecks: [photo(across)], checks: [split, right] });
  assert.equal((await twice.invoke(body)).statusCode, 200);
  assert.equal(twice.counts().generation, 2);
  assert.match(mailOf(twice), /Bild 1 nicht gezeigt \(Hinweise: the shower fittings are spread over two walls; they all belong together on one wall\)/);
  // Ohne Stirnwand aus der Vorpruefung sagt die Wand der Armaturen nichts.
  const unknown = harness({ checks: [back] });
  assert.equal((await unknown.invoke(body)).statusCode, 200);
  assert.equal(unknown.counts().generation, 1);
  // Hat kein Ende der Wanne eine Wand, gibt es keine Stirnwand, und die Mail sagt es.
  for (const extra of [{ shower_back: 'along' }, { shower_left: true }, { shower_back: 'none', shower_right: true }]) {
    const odd = harness({ photoChecks: [photo(extra)], checks: [right] });
    assert.equal((await odd.invoke(body)).statusCode, 200);
    assert.doesNotMatch(promptOf(odd), /The short end wall/, JSON.stringify(extra));
    assert.match(mailOf(odd), /Stirnwand –; Decke flach</, JSON.stringify(extra));
  }
  // Laengs an der linken Wand, Ende hinten: die Armaturen an der Rueckwand, von vorne gesehen. Die Pruefung sieht sie
  // links, ein Widerspruch zur Vorpruefung: das Bild geht nicht hinaus (04.10.).
  const deep = harness({ photoChecks: [photo({ shower_back: 'end', shower_left: true })], checks: [right] });
  assert.equal((await deep.invoke(body)).statusCode, 502);
  assert.match(mailOf(deep), /Ideenbild zurückgehalten \(schwerer Hinweis\)/);
  assert.match(promptOf(deep), /The short end wall of the shower is the back wall seen from the camera: the mixer, the overhead shower and the hand shower sit on it, facing the camera, and the channel drain lies along its foot; its long side runs along the left wall, which carries no fitting, only tiles\./);
  assert.match(mailOf(deep), /Wanne\/Dusche berührt links, hinten mit einem Ende; Längsseite links, Stirnwand hinten;/);
});

test('ein Bild mit schwerem Hinweis nach allen Durchgaengen geht nicht hinaus; es zaehlt das Bild nach dem Produktdurchgang', async () => {
  // Carla und Diego, 04.10.: in P2 und P5 sagte die Vorpruefung "Stirnwand rechts", "Dusche im Bild" "Armaturen: hinten",
  // und das Bild ging trotzdem an den Kunden. Jetzt bekommt er die Antwort eines verworfenen Bildes mit dem Weg zur
  // Beratung, NLD Foto, Bild und Grund. Eine Vorschau ist anonym: kein Versprechen, das Bild nachzuschicken.
  const photo = () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv({ toilet: 'right', washbasin: 'right', bathtub: 'back' }),
    order: ['bathtub', 'washbasin', 'toilet'], nearest: 'toilet', ceiling: 'flat', shower_back: 'along', shower_left: true, shower_right: true, basin_beside_end: true }));
  const at = (walls) => () => checkedInv({ bathtub: 'back' }, { shower: 'back' }, { shower_fittings_walls: walls, shower_floor_after: 'tray', shower_step: false });
  const choice = { dusche: 'duschwanne', badewanne: 'keine' };
  const mails = (h) => h.calls.filter((call) => call.url === 'https://api.resend.com/emails').map((call) => call.body);

  // Vorschau ohne Kontaktdaten: zwei Durchgaenge, beide mit den Armaturen an der Rueckwand.
  const anonymous = harness({ photoChecks: [photo], checks: [at(['back']), at(['back'])] });
  const res = await anonymous.invoke(previewPayload(choice));
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'RENDER_REJECTED');
  assert.equal(res.body.image, undefined);
  assert.equal(res.body.ticket, undefined);
  assert.equal(res.headers['Set-Cookie'], undefined);
  assert.equal(res.body.error, 'Ihr Ideenbild hat unsere Qualitätsprüfung nicht bestanden und wird deshalb nicht angezeigt. Sie können ein anderes Foto verwenden oder eine persönliche Beratung anfragen.');
  assert.equal(anonymous.counts().generation, 2);
  assert.equal(mails(anonymous).length, 1);
  const [held] = mails(anonymous);
  assert.match(held.subject, /^Badplaner-Fehler ohne Kontakt – .+ – Ideenbild zurückgehalten \(schwerer Hinweis\)$/);
  assert.deepEqual(held.attachments.map((attachment) => attachment.filename), ['foto.png', 'zurueckgehalten.png']);
  const text = JSON.stringify(held);
  assert.match(text, /ohne Kontaktdaten können wir es nicht nachschicken/);
  assert.match(text, /Stirnwand rechts \(Waschtisch am Ende\)/);
  assert.match(text, /Dusche im Bild<\/td><td[^>]*>Armaturen: hinten;/);
  assert.match(text, /Bild 1 mit schwerem Hinweis, Hinweis: the shower fittings are on the back wall; seen from the door they all belong on the right wall/);
  assert.match(text, /Ideenbild<\/td><td[^>]*>zurückgehalten \(schwerer Hinweis\), nicht angezeigt</);

  // Mit Kontaktdaten (Formular vor dem Bild): keine Kundenmail mit dem Bild, nur die Mail an NLD.
  const contact = harness({ photoChecks: [photo], checks: [at(['back']), at(['back'])] });
  const withContact = await contact.invoke(payload(choice));
  assert.equal(withContact.statusCode, 502);
  assert.equal(withContact.body.image, undefined);
  assert.equal(withContact.body.error, 'Ihr Ideenbild hat unsere Qualitätsprüfung nicht bestanden und wird deshalb nicht angezeigt. Ihre Angaben und Ihr Foto sind bei uns. Wir melden uns persönlich bei Ihnen.');
  assert.equal(mails(contact).length, 1);
  assert.match(mails(contact)[0].subject, /^Badplaner-Lead: Fixture Person – .+ – Ideenbild zurückgehalten \(schwerer Hinweis\)$/);
  assert.match(JSON.stringify(mails(contact)[0]), /dem Kunden weder angezeigt noch geschickt/);

  // Behebt der Produktdurchgang den Hinweis, zaehlt sein Bild: es geht hinaus, und die Mail sagt "ok".
  const fixed = harness({ env: { BADPLANER_PRODUCT_PASS: undefined }, photoChecks: [photo], checks: [at(['back']), at(['back']), at(['right'])] });
  const fixedRes = await fixed.invoke(previewPayload(choice));
  assert.equal(fixedRes.statusCode, 200);
  assert.ok(fixedRes.body.image?.data);
  assert.equal(fixed.counts().generation, 3);
  assert.match(JSON.stringify(mails(fixed)[0]), /Bild 1 ok, Produktdurchgang ok/);
});

test('Beratung nach einem zurueckgehaltenen Bild nennt dessen Lead-ID in eigener Zeile; Foto und Auswahl bleiben dabei', async () => {
  // Diego, 05.10.: NLD soll die Beratung sicher der Mail mit dem nicht gezeigten Bild zuordnen. Die Lead-ID ist nur ein
  // Verweis; der Server merkt sich nichts, und jeder neue Versuch hat seine eigene.
  const photo = () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv({ toilet: 'right', washbasin: 'right', bathtub: 'back' }),
    order: ['bathtub', 'washbasin', 'toilet'], nearest: 'toilet', ceiling: 'flat', shower_back: 'along', shower_left: true, shower_right: true, basin_beside_end: true }));
  const back = () => checkedInv({ bathtub: 'back' }, { shower: 'back' }, { shower_fittings_walls: ['back'], shower_floor_after: 'tray', shower_step: false });
  const h = harness({ photoChecks: [photo, photo], checks: [back, back, back, back] });
  const mails = () => h.calls.filter((call) => call.url === 'https://api.resend.com/emails').map((call) => call.body);
  const row = (label, value) => new RegExp(`>${label}</td><td[^>]*>${value}<`);

  const first = await h.invoke(previewPayload({ dusche: 'duschwanne', badewanne: 'keine' }));
  const second = await h.invoke(previewPayload({ dusche: 'duschwanne', badewanne: 'keine' }));
  for (const [index, held] of [first, second].entries()) {
    assert.equal(held.statusCode, 502);
    assert.equal(held.body.code, 'RENDER_REJECTED');
    assert.match(mails()[index].subject, /Ideenbild zurückgehalten \(schwerer Hinweis\)$/);
    assert.match(JSON.stringify(mails()[index]), row('Lead-ID', held.body.leadId));
  }
  assert.notEqual(second.body.leadId, first.body.leadId);

  const consultation = {
    kind: 'beratung', raum: 'badezimmer', priorities: 'Ich wünsche eine persönliche Beratung zu meiner Auswahl im Badplaner.',
    renderFailure: 'RENDER_REJECTED', auswahl: [['Paket', 'Essenza'], ['Dusche', 'Duschwanne']],
    file: { name: 'badfoto.png', mime: 'image/png', data: PNG },
    name: 'Fixture Person', email: 'fixture@example.invalid', telefon: '+41 00 000 00 00', consent: true,
  };
  const res = await h.invoke({ ...consultation, renderLeadId: second.body.leadId });
  assert.equal(res.statusCode, 200);
  const mail = mails().at(-1);
  const text = JSON.stringify(mail);
  assert.match(mail.subject, /^Badplaner-Beratung:/);
  assert.match(text, row('Lead-ID Ideenbild zurückgehalten', second.body.leadId));
  assert.match(text, row('Lead-ID', res.body.leadId));
  assert.ok(![first.body.leadId, second.body.leadId].includes(res.body.leadId));
  assert.doesNotMatch(text, new RegExp(`${first.body.leadId}<`));
  assert.match(text, /Paket.*Essenza/);
  assert.deepEqual(mail.attachments.map(({ filename }) => filename), ['beratung.png']);
  assert.equal(h.counts().generation, 4, 'die Beratung erzeugt kein Bild');

  // Das Format von newId() in Produktion, auch mit kurzem Zufallsteil.
  for (const leadId of [`bp-${(1790000000000).toString(36)}-${(0.123456789).toString(36).slice(2, 8)}`, `bp-${(1790000000000).toString(36)}-${(0.5).toString(36).slice(2, 8)}`]) {
    const accepted = await h.invoke({ ...consultation, renderLeadId: leadId });
    assert.equal(accepted.statusCode, 200);
    assert.match(JSON.stringify(mails().at(-1)), row('Lead-ID Ideenbild zurückgehalten', leadId));
  }
});

// Versuch "persoenliche Pruefung" (Diego, 05.10.): bei einem Bad mit Dusche zuerst der Kontakt, dann das Bild nur an NLD,
// das es prueft, anruft und erst danach schickt. Intern: nur mit VITE_BADPLANER_PRUEFUNG=1 auf einem Vorschau-Deployment.
const reviewTrial = { VITE_BADPLANER_PRUEFUNG: '1', VERCEL_ENV: 'preview' };
const reviewShower = { dusche: 'duschwanne', badewanne: 'keine' };
const reviewMails = (h) => h.calls.filter((call) => call.url === 'https://api.resend.com/emails').map((call) => call.body);
// Wie im Test oben: Vorpruefung mit Stirnwand rechts, die Armaturen im Bild an der genannten Wand.
const reviewPhoto = () => photoChecked(true, JSON.stringify({ is_bathroom: true, reason: 'bathroom', walls: inv({ toilet: 'right', washbasin: 'right', bathtub: 'back' }),
  order: ['bathtub', 'washbasin', 'toilet'], nearest: 'toilet', ceiling: 'flat', shower_back: 'along', shower_left: true, shower_right: true, basin_beside_end: true }));
const reviewCheck = (walls) => () => checkedInv({ bathtub: 'back' }, { shower: 'back' }, { shower_fittings_walls: walls, shower_floor_after: 'tray', shower_step: false });
const reviewOk = { photoChecks: [reviewPhoto], checks: [reviewCheck(['right'])] };
// Der ganze Auftrag an Diego in der Mail an NLD (Checkliste von Carla, 06.10.), Wort fuer Wort.
const reviewChecklist = (file) => 'Diego prüft das Bild selbst, ohne zweiten Prüfer: Foto und Bild in voller Auflösung im Anhang, '
  + 'Lead-ID, Foto und Auswahl abgleichen; Fenster, Raumform, alle Armaturen, Glas und Produkte prüfen. Ist das Bild klar richtig: '
  + `zuerst den Kunden anrufen, dann nur ${file} per E-Mail senden, keinen anderen Anhang. Ist es falsch oder zweifelhaft, oder `
  + 'zeigt es eine Duschsäule statt des gewählten Up+: nicht senden, den Kunden anrufen und es erklären.';
const reviewIntro = (file) => `Persönliche Prüfung (Versuch): Der Kunde hat das Ideenbild weder gesehen noch per Mail erhalten. ${reviewChecklist(file)}`;

test('Versuch persoenliche Pruefung: nur auf Vorschau-Deployments; dort zuerst der Kontakt, ohne Modellaufruf', async () => {
  // Ohne Schalter oder in Produktion: die Vorschau wie bisher, und pruefung: true wird vor jedem Aufruf abgelehnt.
  for (const env of [{}, { VITE_BADPLANER_PRUEFUNG: '1', VERCEL_ENV: 'production' }, { VERCEL_ENV: 'preview' }]) {
    const res = await harness({ env, ...reviewOk }).invoke(previewPayload(reviewShower));
    assert.equal(res.statusCode, 200, JSON.stringify(env));
    assert.ok(res.body.image?.data);
    const off = harness({ env });
    const refused = await off.invoke(payload({ ...reviewShower, pruefung: true }));
    assert.equal(refused.statusCode, 400, JSON.stringify(env));
    assert.equal(off.calls.length, 0);
  }

  // Im Versuch: die Vorschau eines Badezimmers mit Dusche endet vor jedem Aufruf (keine Vorpruefung, kein Bild, keine
  // Mail) und ohne Zaehler; erst der Versuch mit Kontakt ruft Gemini, so oft wie eine normale Vorschau.
  const normal = harness({ env: { VERCEL_ENV: 'preview' }, ...reviewOk });
  assert.equal((await normal.invoke(previewPayload(reviewShower))).statusCode, 200);
  const h = harness({ env: { ...reviewTrial, BADPLANER_DAILY_CAP: '2' }, photoChecks: [reviewPhoto, reviewPhoto], checks: [reviewCheck(['right']), reviewCheck(['right'])] });
  const stopped = async () => {
    const stop = await h.invoke(previewPayload(reviewShower));
    assert.equal(stop.statusCode, 409);
    assert.equal(stop.body.code, 'PERSONAL_REVIEW');
    assert.equal(stop.body.image, undefined);
    assert.equal(stop.headers['Set-Cookie'], undefined);
  };
  const withContact = async () => (await h.invoke(payload({ ...reviewShower, pruefung: true }))).statusCode;
  await stopped();
  await stopped();
  assert.equal(h.calls.length, 0, 'vor dem Kontakt kein Aufruf');
  assert.equal(await withContact(), 200);
  assert.deepEqual(h.counts(), normal.counts(), 'so viele Bilder, Pruefungen und Mails wie eine normale Vorschau');
  assert.equal(h.photoCount(), normal.photoCount());
  // Tagesdeckel 2: die Antworten 409 zaehlen nicht, also geht ein zweiter Versuch mit Kontakt durch, ein dritter nicht.
  await stopped();
  await stopped();
  assert.equal(await withContact(), 200);
  assert.equal(await withContact(), 429);
  // Ohne Dusche bleibt es die Vorschau mit Bild.
  const noShower = await harness({ env: reviewTrial }).invoke(previewPayload({ dusche: 'keine' }));
  assert.equal(noShower.statusCode, 200);
  assert.ok(noShower.body.image?.data);
});

test('Versuch persoenliche Pruefung: das Bild geht nur an NLD, ohne Kundenmail und ohne Bild in der Antwort', async () => {
  const h = harness({ env: reviewTrial, ...reviewOk });
  const res = await h.invoke(payload({ ...reviewShower, pruefung: true }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.pruefung, true);
  assert.equal(res.body.image, undefined);
  assert.equal(res.body.ticket, undefined);
  const mails = reviewMails(h);
  assert.equal(mails.length, 1, 'keine Kundenmail');
  const [lead] = mails;
  assert.ok(!lead.to.includes('fixture@example.invalid'));
  assert.equal(lead.reply_to, 'fixture@example.invalid');
  assert.match(lead.subject, /^Badplaner-Lead: Fixture Person – .+ – Ideenbild persönlich prüfen$/);
  assert.deepEqual(lead.attachments.map(({ filename }) => filename), ['foto.png', 'ideenbild.png']);
  const text = JSON.stringify(lead);
  assert.match(text, /Persönliche Prüfung \(Versuch\): Der Kunde hat das Ideenbild weder gesehen noch per Mail erhalten/);
  assert.match(text, new RegExp(`>Lead-ID</td><td[^>]*>${res.body.leadId}<`));
  assert.match(text, />Ideenbild<\/td><td[^>]*>nicht angezeigt, persönliche Prüfung</);
  assert.match(text, />PLZ \/ Ort<\/td><td[^>]*>4800 Zofingen</);
  assert.match(text, />Newsletter<\/td><td[^>]*>nein</);
  // Diego und Carla, 06.10.: er prueft selbst; ein klar richtiges Bild erst nach dem Anruf senden, sonst nicht senden und
  // anrufen (falsch, zweifelhaft oder eine Duschsaeule statt des gewaehlten Up+).
  assert.match(text, /Diego prüft das Bild selbst, ohne zweiten Prüfer/);
  assert.match(text, /Ist das Bild klar richtig: zuerst den Kunden anrufen, dann nur ideenbild\.png per E-Mail senden, keinen anderen Anhang\./);
  assert.match(text, /falsch oder zweifelhaft, oder zeigt es eine Duschsäule statt des gewählten Up\+: nicht senden, den Kunden anrufen und es erklären/);
  assert.equal(lead.text.split('\n')[0], reviewIntro('ideenbild.png'), 'die ganze Checkliste');

  // Diego, 06.10.: haelt die Pruefung das Bild nur wegen der Armaturen zurueck (moeglicher Fehlalarm, P2/P5), darf er es nach
  // eigener Pruefung und dem Anruf von Hand senden; es kommt als ideenbild.* mit diesem Auftrag. Ein anderer schwerer Hinweis,
  // auch neben den Armaturen, und ein verworfenes Bild bleiben gesperrt. Der Kunde bekommt in allen Faellen weder Bild noch Mail.
  const fittings = (extra = {}) => () => checkedInv({ bathtub: 'back' }, { shower: 'back' }, { shower_fittings_walls: ['back'], shower_floor_after: 'tray', shower_step: false, ...extra });
  for (const [settings, subject, file, finding, sendable] of [
    [{ photoChecks: [reviewPhoto], checks: [fittings(), fittings()] }, /– Ideenbild zurückgehalten \(Armaturen, möglicher Fehlalarm\)$/, 'ideenbild.png',
      /nur wegen der Armaturen zurückgehalten \(siehe Fensterprüfung\), möglicherweise ein Fehlalarm\. Diego prüft das Bild selbst.+zuerst den Kunden anrufen, dann nur ideenbild\.png per E-Mail senden, keinen anderen Anhang.+Duschsäule statt des gewählten Up\+: nicht senden/, true],
    [{ photoChecks: [reviewPhoto], checks: [fittings({ mirror_kept: true }), fittings({ mirror_kept: true })] }, /– Ideenbild zurückgehalten \(schwerer Hinweis\)$/, 'zurueckgehalten.png',
      /hat das Bild zurückgehalten \(schwerer Hinweis, siehe Fensterprüfung\): nicht senden, den Kunden anrufen und es erklären/, false],
    [{ checks: [() => checked(true), () => checked(true)] }, /– Ideenbild abgelehnt$/, 'verworfen.jpg', /hat das Bild verworfen \(siehe Fensterprüfung\): nicht senden, den Kunden anrufen und es erklären/, false],
  ]) {
    const held = harness({ env: reviewTrial, ...settings });
    const answer = await held.invoke(payload({ ...reviewShower, pruefung: true }));
    assert.equal(answer.statusCode, 200);
    assert.equal(answer.body.pruefung, true);
    assert.equal(answer.body.image, undefined);
    const [mail, ...more] = reviewMails(held);
    assert.equal(more.length, 0, 'keine Kundenmail');
    assert.ok(!mail.to.includes('fixture@example.invalid'));
    assert.match(mail.subject, subject);
    assert.deepEqual(mail.attachments.map(({ filename }) => filename), ['foto.png', file]);
    assert.match(JSON.stringify(mail), finding);
    if (sendable) assert.ok(mail.text.split('\n')[0].endsWith(`möglicherweise ein Fehlalarm. ${reviewChecklist(file)}`), 'die ganze Checkliste');
    if (!sendable) assert.doesNotMatch(JSON.stringify(mail), /per E-Mail senden|Fehlalarm/, 'gesperrt: kein Auftrag zum Senden');
  }
});

test('Versuch persoenliche Pruefung: ohne Resend geht der Kontakt ohne Bilder an NLD, als Rueckruf und nicht als pruefbereites Bild', async () => {
  // Bild ohne schweren Hinweis und zurueckgehaltenes Bild: ohne Anhaenge sagen Betreff und Text "anrufen", nicht "pruefen".
  for (const settings of [reviewOk, { photoChecks: [reviewPhoto], checks: [reviewCheck(['back']), reviewCheck(['back'])] }]) {
    const fallback = harness({ env: reviewTrial, ...settings, mails: [() => response({ message: 'fixture' }, 500)] });
    const res = await fallback.invoke(payload({ ...reviewShower, pruefung: true }));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.delivery.leadAttachments, false);
    assert.equal(reviewMails(fallback).length, 1, 'nur der gescheiterte Versuch an NLD, keine Kundenmail');
    const form = fallback.calls.find((call) => call.url.startsWith('https://formspree.io/')).body;
    const intro = form.message.split('\n')[0];
    assert.match(form._subject, /^Badplaner-Lead: Fixture Person – .+ – OHNE Foto und Ideenbild: Kunde anrufen$/);
    assert.match(intro, /Foto und Ideenbild fehlen in dieser Mail.+Nichts prüfen und nichts senden: den Kunden anrufen/);
    assert.doesNotMatch(`${form._subject} ${intro}`, /persönlich prüfen|Vor dem Senden|zurückgehalten|abgelehnt|Fehlalarm|per E-Mail senden/);
    assert.equal(form.hinweis, 'Bilder konnten nicht angehängt werden');
    assert.equal(form['PLZ / Ort'], '4800 Zofingen');
  }
  // Ausserhalb des Versuchs bleibt die Mail ohne Anhaenge wie bisher.
  const ordinary = harness({ mails: [() => response({}, 500)] });
  await ordinary.invoke();
  assert.equal(ordinary.calls.find((call) => call.url.startsWith('https://formspree.io/')).body._subject, 'Badplaner-Lead: Fixture Person – Essenza');

  const lost = harness({ env: reviewTrial, ...reviewOk, mails: [() => response({}, 500)], formspree: () => response({}, 500) });
  const lostRes = await lost.invoke(payload({ ...reviewShower, pruefung: true }));
  assert.equal(lostRes.statusCode, 502);
  assert.equal(lostRes.body.code, 'LEAD_DELIVERY_FAILED');
  assert.equal(lostRes.body.image, undefined);
});

test('Versuch persoenliche Pruefung: auch der alte Weg ohne stage und ohne pruefung bringt bei einem Bad mit Dusche weder Bild noch Kundenmail', async () => {
  // Bis 6c4f858 gab kind 'render' mit Kontakt, aber ohne stage und ohne pruefung, im Versuch das Bild zurueck und schickte die
  // Kundenmail. Jetzt ist jedes Bild mit Kontakt fuer ein Bad mit Dusche eine persoenliche Pruefung, auch mit Newsletter.
  for (const [changes, settings, subject, file] of [
    [{}, reviewOk, /– Ideenbild persönlich prüfen$/, 'ideenbild.png'],
    [{ stage: 'kontakt', pruefung: false, newsletter: true }, reviewOk, /– Ideenbild persönlich prüfen$/, 'ideenbild.png'],
    [{}, { checks: [() => checked(true), () => checked(true)] }, /– Ideenbild abgelehnt$/, 'verworfen.jpg'],
  ]) {
    const h = harness({ env: { ...reviewTrial, RESEND_AUDIENCE_ID: 'fixture-audience' }, ...settings });
    const res = await h.invoke(payload({ ...reviewShower, ...changes }));
    assert.equal(res.statusCode, 200, JSON.stringify(changes));
    assert.equal(res.body.pruefung, true);
    assert.equal(res.body.image, undefined);
    assert.equal(res.body.ticket, undefined);
    assert.ok(!h.calls.some((call) => call.url.includes('/audiences/')), 'kein Newsletter-Eintrag');
    assert.match(reviewMails(h)[0].text, /\nNewsletter: nein\n/);
    const [lead, ...more] = reviewMails(h);
    assert.equal(more.length, 0, 'keine Kundenmail');
    assert.ok(!lead.to.includes('fixture@example.invalid'));
    assert.match(lead.subject, subject);
    assert.deepEqual(lead.attachments.map(({ filename }) => filename), ['foto.png', file]);
    assert.match(lead.text, /\nDusche: Dusche mit Duschwanne\n/);
    assert.match(lead.text, /\nLead-ID: bp-fixture-\d+$/);
    if (file === 'ideenbild.png') assert.equal(lead.text.split('\n')[0], reviewIntro(file), 'die ganze Checkliste');
  }
  // Ohne Dusche und im Gaeste-WC bleibt der alte Weg auch im Versuch: Bild in der Antwort und Kundenmail.
  for (const changes of [{ dusche: 'keine' }, { raum: 'gaeste-wc', dusche: '', badewanne: '', waschtisch: 'einzel' }]) {
    const res = await harness({ env: reviewTrial }).invoke(payload(changes));
    assert.equal(res.statusCode, 200, JSON.stringify(changes));
    assert.ok(res.body.image?.data);
    assert.equal(res.body.delivery.customer, 'accepted');
  }
});

test('Versuch persoenliche Pruefung: eine Vorschau von vor dem Einschalten bringt bei einem Bad mit Dusche keine Kundenmail', async () => {
  // Das Ticket gilt 2 h und haengt nur am Schluessel: eine Vorschau aus einem Deployment ohne Versuch kann eingeloest
  // werden, wenn der Versuch schon laeuft. Geprueft wird beim Einloesen, vor jeder Mail und ohne Anbieter.
  const anfrage = (preview) => anfrageBody({ ...contactFields, newsletter: true, leadId: preview.leadId, exp: preview.exp, ticket: preview.ticket,
    auswahl: preview.auswahl, paket: preview.paket, mime: preview.image.mime }, Buffer.from(preview.image.data, 'base64'));
  const before = (await harness({ env: { VERCEL_ENV: 'preview' }, ...reviewOk }).invoke(previewPayload(reviewShower))).body;
  assert.ok(before.ticket);
  const trial = harness({ env: { ...reviewTrial, RESEND_AUDIENCE_ID: 'fixture-audience' } });
  const refused = await trial.invoke(anfrage(before));
  assert.equal(refused.statusCode, 409);
  assert.equal(refused.body.code, 'PERSONAL_REVIEW');
  assert.equal(trial.calls.length, 0, 'keine Mail an NLD oder den Kunden, kein Newsletter');
  // Dasselbe Ticket ohne Versuch: wie bisher Lead und Kundenmail.
  assert.equal((await harness({ env: { VERCEL_ENV: 'preview' } }).invoke(anfrage(before))).body.delivery.customer, 'accepted');
  // Im Versuch bleiben die Vorschau ohne Dusche und die des Gaeste-WCs mit ihrer Anfrage wie bisher.
  for (const changes of [{ dusche: 'keine' }, { raum: 'gaeste-wc', dusche: '', badewanne: '', waschtisch: 'einzel' }]) {
    const h = harness({ env: reviewTrial });
    const preview = (await h.invoke(previewPayload(changes))).body;
    const res = await h.invoke(anfrage(preview));
    assert.equal(res.statusCode, 200, JSON.stringify(changes));
    assert.equal(res.body.delivery.customer, 'accepted');
  }
});
