/**
 * Badplaner-API (Vercel Serverless Function, Node-Runtime).
 *
 * POST /api/badplaner mit JSON-Body:
 *   kind: 'render'     Foto + Ausstattung -> Ideenbild (Gemini); Lead-Mail an NLD,
 *                      Kundenmail mit dem Ideenbild, auf Wunsch Newsletter-Eintrag
 *   kind: 'render' mit stage: 'vorschau'
 *                      Ideenbild VOR den Kontaktangaben: nur Einwilligung, kein Name.
 *                      Mail "Badplaner-Entwurf" mit Foto und Bild an NLD, Antwort mit
 *                      Bild und Ticket (HMAC ueber Lead-ID, Auswahl und SHA-256 des Bildes).
 *   kind: 'anfrage'    Kontakt nach der Vorschau, als Binaerkoerper (siehe handleAnfrage):
 *                      Lead-Mail an NLD und Kundenmail mit demselben, vom Ticket
 *                      bestaetigten Bild. Keine zweite Bilderzeugung, keine Speicherung.
 *   kind: 'grundriss'  Grundriss/m²/Bemerkung zu einem bestehenden Lead per E-Mail
 *
 * Ablauf bei kind: 'render'
 *   1. Pflichtfelder, alle aktiven Ausstattungs-IDs und Bildheader streng prüfen.
 *      Bekannte Legacy-Feldnamen bleiben gültig; widersprüchliche Auswahl-IDs nicht.
 *   2. Grenzen prüfen: Cookie 3 Ideenbilder pro Gerät und Tag, 6 pro IP, Tagesdeckel.
 *   3. Musterbild der Wandplatte laden, Prompt bauen, Ideenbild bei Gemini erzeugen.
 *   4. Fensterprüfung: abgelehnte Bilder werden verworfen. Ist der Prüfdienst auch
 *      nach einem kurzen Retry nicht erreichbar, wird das Bild mit Warnhinweis zugestellt.
 *   5. Lead-Mail an NLD; bei eindeutigem HTTP-Fehler Formspree ohne Bilder.
 *      Ohne bestätigte Provider-Annahme kein Erfolg. Unklare Zustellung nicht blind wiederholen.
 *   6. Kundenmail/Newsletter mit separatem Zustellstatus, kein falsches Versandversprechen.
 *   Alle Netzwerkaufrufe einschliesslich Body-Lesen unter einer 110-Sekunden-Deadline.
 *
 * Umgebungsvariablen (Vercel > Settings > Environment Variables):
 *   GEMINI_API_KEY       Pflicht. API-Schlüssel von Google AI Studio (Bildmodell).
 *   RESEND_API_KEY       E-Mail-Versand mit Anhängen über Resend. Fehlt er oder
 *                        wird der Versand eindeutig abgelehnt, geht der Lead ohne Bilder
 *                        an Formspree. Fehlende Kundenmail wird im Ergebnis ausgewiesen.
 *   RESEND_AUDIENCE_ID   Audience bei Resend für den Newsletter. Ohne diese Variable
 *                        wird die Einwilligung nur im Lead-Mail vermerkt.
 *   BADPLANER_TO         Empfänger (Default diego.verdile@newlivingdesign.ch)
 *   BADPLANER_CC         Kopie (Default emanuel.verdile@newlivingdesign.ch)
 *   BADPLANER_FROM       Absender für Lead- und Kundenmail (Default
 *                        "Badplaner <badplaner@newlivingdesign.ch>",
 *                        Domain muss bei Resend verifiziert sein)
 *   BADPLANER_DAILY_CAP  Maximale Ideenbilder pro Tag insgesamt (Default 60)
 *   BADPLANER_MODEL      Gemini-Modell (Default gemini-3-pro-image, das genaueste)
 *   BADPLANER_CHECK_MODEL Gemini-Textmodell für die Fensterprüfung (Default gemini-3.6-flash);
 *                        leer lassen = Prüfung bewusst deaktiviert
 *
 * Fotos und Ideenbilder werden NICHT gespeichert (kein Blob, kein KV): sie gehen
 * nur an Google zur Bilderzeugung und per E-Mail an uns und an den Kunden.
 * Diese synchrone Zwischenlösung bietet KEINE durable Speicherung oder Idempotenz.
 * Provider-Annahme ist kein Nachweis der Postfachzustellung. Siehe docs/BADPLANER_PR1.md.
 * Siehe /datenschutz#badplaner.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- keine @vercel/node-Typen im Projekt, req/res sind deshalb any */
import { type PackageId } from '../src/data/badplaner.js';
import { bathPackages, business, individualPackage, packageNote, type BathPackage } from '../src/config/business.js';
import { Budget, TimeoutError, type Clock } from '../server/badplaner/budget.js';
import { normalizeSelection, ValidationError } from '../server/badplaner/validation.js';
import { normalizeBase64, validateImageBytes, MAX_PHOTO_BASE64, MAX_PLAN_BASE64 } from '../src/pages/badplaner/imageValidation.js';
import { SANITARY_MODULE_PHOTO } from '../server/badplaner/sanitaermodul.js';
import { AURELIA_TAPS_PHOTO } from '../server/badplaner/aurelia.js';

// Node-Globals ohne @types/node (api/tsconfig.json ist auf Edge ausgelegt)
declare const process: any;
declare const Buffer: any;

// 230 s: zwei volle Durchgaenge (Bild 65 s + Pruefung 20 s) plus Vorpruefung und Mails.
// Vercel erlaubt bis 300 s; vercel.json nennt denselben Wert.
export const config = { maxDuration: 230 };

/* ---------- Grenzen ---------- */

const MAX_FILE_BASE64 = MAX_PLAN_BASE64;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
// Ein 2K-Ideenbild ist ein Vielfaches eines 1K-Bildes. Diese drei Grenzen waren
// auf 1K zugeschnitten und haben das erste Pro-Bild nach 25 s weggeworfen.
const MAX_RESPONSE_BASE64 = 16 * 1024 * 1024;
const MAX_MODEL_JSON_BYTES = 24 * 1024 * 1024;
const GENERATED_IMAGE_LIMITS = { maxBytes: 12 * 1024 * 1024, maxPixels: 12_000_000, maxSide: 3000 };
const MAX_SWATCH_BYTES = 5 * 1024 * 1024; // current catalog originals include files >4 MiB
// Am 19.09. um 12:11 blieb bei 110 s kein Platz fuer den zweiten Versuch: der erste
// Durchgang (Bild + Pruefung) dauert mit gemini-3-pro-image 33 bis 90 s, und der zweite
// lief nur, wenn der erste unter rund 43 s blieb. Um 12:25 lief er und das Bild kam durch.
// 220 s reichen fuer zwei Durchgaenge in der langsamsten Form (2 x 90 s) plus Mails.
const TOTAL_TIMEOUT_MS = 220000; // 10 seconds below the platform limit (vercel.json maxDuration 230)
const DELIVERY_RESERVE_MS = 10000; // Lead- und Kundenmail brauchen zusammen 2 bis 5 s (Logs 19.09.)
const PER_DEVICE_PER_DAY = 5;                 // Cookie nldbp
const PER_IP_PER_DAY = 10;                    // In-Memory, muss über dem Gerätelimit liegen
const GEMINI_TIMEOUT_MS = 65000;  // gemini-3-pro-image denkt mit und braucht laenger als Flash
// 20.09., 09:25 (Preview, 87 s): Fotopruefung 16 s, Bild 28 s, Pruefung nach 25 s abgelaufen,
// dieselbe Pruefung nochmals 17 s. Beide Pruefungen denken jetzt nur wenig (checkThinking),
// darum reichen kuerzere Grenzen; die alten waren auf "medium" zugeschnitten.
const CHECK_TIMEOUT_MS = 20000;       // liest ein 2K-Bild
const QUICK_CHECK_TIMEOUT_MS = 10000; // zweiter Anlauf nach einem Timeout: kurz, nicht nochmals 20 s
const PHOTO_CHECK_TIMEOUT_MS = 12000; // haelt das Bild auf; laeuft sie ab, wird ohne Grundriss gerendert
const CHECK_RETRY_DELAY_MS = 750;
// Die Pruefmodelle lesen nur ab und fuellen JSON aus. gemini-3.6-flash denkt ab Werk "medium";
// "low" kennen alle Gemini-3-Modelle (ai.google.dev/gemini-api/docs/generate-content/thinking),
// aeltere Modelle bekommen den Parameter nicht.
const checkThinking = (model: string) => (/^gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {});
const COOKIE_NAME = 'nldbp';
const TICKET_TTL_MS = 2 * 60 * 60 * 1000;     // so lange gilt die Vorschau fuer die Anfrage
const MAX_ANFRAGE_BYTES = 4_400_000;          // unter der 4.5-MB-Grenze von Vercel fuer den Request

/* ---------- Typen ---------- */

/** Feldnamen nach Kapitel 10 der Spezifikation, dazu die alten Namen als Fallback. */
interface RenderBody {
  kind: 'render';
  raum?: string;
  room?: string;
  paket?: string;
  package?: string;             // alt
  individuell?: boolean;
  format?: string;
  look?: string;
  platte?: string;
  tile?: string;                // alt
  boden?: string;
  kombination?: string;
  akzentFlaeche?: string;       // 'waschtisch' | 'dusche'
  akzent?: string;
  top?: string;
  unterbau?: string;
  furniture?: string;           // alt
  becken?: string;
  armaturenserie?: string;
  finish?: string;
  keramik?: string;
  sanitary?: string;            // alt
  wall?: string;
  dusche?: string;
  shower?: string;              // alt
  badewanne?: string;
  bathtub?: string;
  waschtisch?: string;
  basin?: string;               // alt
  spiegel?: string;
  mirror?: string;              // alt
  windows?: string;
  cistern?: string;
  foto?: string;                // data-URL
  photo?: { mime: string; data: string };   // alt
  name?: string;
  email?: string;
  telefon?: string;
  phone?: string;               // alt
  place?: string;
  newsletter?: boolean;
  consent?: boolean;
  website?: string;             // Honeypot, muss leer sein
  stage?: string;               // 'vorschau': Bild vor den Kontaktangaben
}

interface BeratungBody {
  kind: 'beratung';
  raum?: string;
  priorities?: string;
  measurements?: string;
  style?: string;
  budget?: string;
  imageWanted?: boolean;
  renderFailure?: string;
  auswahl?: unknown;
  file?: { name: string; mime: string; data: string };
  name?: string;
  email?: string;
  telefon?: string;
  phone?: string;
  newsletter?: boolean;
  consent?: boolean;
  website?: string;
}

type RenderFailureCode = 'PHOTO_NOT_A_BATHROOM' | 'RENDER_FAILED' | 'RENDER_REJECTED';
const RENDER_FAILURE_LABELS: Record<RenderFailureCode, string> = {
  PHOTO_NOT_A_BATHROOM: 'Foto nicht als Bad oder Gäste-WC erkannt – kein Ideenbild erzeugt',
  RENDER_FAILED: 'Bildgenerierung fehlgeschlagen – kein Ideenbild erzeugt',
  RENDER_REJECTED: 'Ideenbild von der Qualitätsprüfung abgelehnt – nicht angezeigt',
};

interface GrundrissBody {
  kind: 'grundriss';
  leadId: string;
  name: string;
  phone?: string;
  telefon?: string;
  sqm?: string | number;
  note?: string;
  file?: { name: string; mime: string; data: string };
  website?: string;
}

interface Photo {
  mime: string;
  data: string;
}

/**
 * Gemini rendert nur in festen Seitenverhältnissen. Ohne Angabe wählt das Modell
 * selbst eines: ein Ideenbild im anderen Format sieht aus wie ein verschobener
 * Bildausschnitt, und genau das lehnt die Prüfung ab. Darum das nächstgelegene
 * unterstützte Verhältnis des Kundenfotos mitschicken.
 */
const ASPECT_RATIOS: ReadonlyArray<readonly [string, number]> = [
  ['9:16', 9 / 16], ['3:4', 3 / 4], ['1:1', 1], ['4:3', 4 / 3], ['16:9', 16 / 9],
];

export function nearestAspectRatio(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
  const ratio = width / height;
  // Abstand im Logarithmus: 4:3 und 3:4 liegen damit gleich weit von 1:1 entfernt.
  let best = ASPECT_RATIOS[0];
  for (const candidate of ASPECT_RATIOS) {
    if (Math.abs(Math.log(ratio / candidate[1])) < Math.abs(Math.log(ratio / best[1]))) best = candidate;
  }
  return best[0];
}

/* ---------- Handler ---------- */

export interface BadplanerDependencies {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  clock: Clock;
  sleep: (milliseconds: number) => Promise<void>;
  newId: () => string;
}

type DeliveryStatus = 'accepted' | 'failed' | 'unknown' | 'skipped';
interface MailResult { status: DeliveryStatus; provider?: 'resend' | 'formspree'; attachments?: boolean }
interface RequestContext { budget: Budget }
/**
 * Die Pruefung beurteilt nicht mehr selbst, sie zaehlt nur auf: welches Stueck
 * steht an welcher Wand, vorher und nachher. Geurteilt wird hier im Code.
 * Ein Modell beobachtet zuverlaessiger, als es urteilt.
 */
type Wall = 'left' | 'right' | 'back' | 'front' | 'none';
const WALLS: Wall[] = ['left', 'right', 'back', 'front', 'none'];
interface Inventory { toilet: Wall; washbasin: Wall; shower: Wall; bathtub: Wall; bidet: Wall }
const FIXTURES = ['toilet', 'washbasin', 'shower', 'bathtub', 'bidet'] as const;
type Fixture = typeof FIXTURES[number];

interface CheckFlags {
  extra_openings: boolean;
  view_changed: boolean;
  before: Inventory;
  after: Inventory;
  orderBefore: Fixture[];
  orderAfter: Fixture[];
  nearestBefore: Fixture | 'none';
  nearestAfter: Fixture | 'none';
  // Im Log fehlte am 20.09. (Colore, 502), welche Antwort "Nische dazu" ausgeloest hatte.
  wallAnswers: Record<string, boolean>;
}
type CheckResult = { status: 'approved'; note?: string; hints?: string[] } | { status: 'rejected'; reason: string; flags: CheckFlags } | { status: 'unavailable'; detail: string } | { status: 'disabled' };

/** Each factory owns its best-effort counters. Tests inject HTTP, clock and IDs. */
export function createHandler(overrides: Partial<BadplanerDependencies> = {}) {
  const dependencies: BadplanerDependencies = {
    fetch: globalThis.fetch.bind(globalThis),
    env: process.env,
    clock: { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (timer) => clearTimeout(timer) },
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    newId: () => `bp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  };
  const env = dependencies.env;
  const ipCounter = new Map<string, { date: string; count: number }>();
  const globalCounter = { date: '', count: 0 };

async function request(ctx: RequestContext, url: string, init: RequestInit = {}, timeout = 8000, bytes = false) {
  return ctx.budget.run(timeout, async (signal) => {
    const response = await dependencies.fetch(url, { ...init, signal, redirect: 'error' });
    // Keep the timeout active while consuming the response body, not only headers.
    if (signal.aborted) { void response.body?.cancel(); throw new TimeoutError(); }
    const limit = bytes ? MAX_SWATCH_BYTES : MAX_MODEL_JSON_BYTES;
    const length = Number(response.headers.get('content-length'));
    if (length > limit) { void response.body?.cancel(); throw new Error('Provider response too large'); }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (reader) {
      const cancel = () => { void reader.cancel().catch(() => undefined); };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          total += part.value.byteLength;
          if (total > limit) { await reader.cancel(); throw new Error('Provider response too large'); }
          chunks.push(part.value);
        }
      } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    let json: any = null;
    if (!bytes) { try { json = JSON.parse(new TextDecoder().decode(body)); } catch { /* malformed provider response */ } }
    return { ok: response.ok, status: response.status, headers: response.headers, bytes: body, json };
  });
}

async function handler(req: any, res: any) {
  const ctx: RequestContext = { budget: new Budget(dependencies.clock, TOTAL_TIMEOUT_MS) };
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Nur POST erlaubt.' });
  }

  let body: any = req.body;
  if (Buffer.isBuffer(body)) {
    if (body.length > MAX_ANFRAGE_BYTES) return res.status(413).json({ ok: false, code: 'INPUT_TOO_LARGE', error: 'Die Anfrage ist zu gross.' });
    try { return await handleAnfrage(res, body, ctx); }
    catch (err: any) {
      if (err instanceof TimeoutError) return res.status(504).json({ ok: false, code: 'TIMEOUT', error: 'Das hat zu lange gedauert. Bitte versuchen Sie es noch einmal.' });
      console.error('[badplaner] Anfrage: unerwarteter Fehler', err?.name || 'Error');
      return res.status(500).json({ ok: false, error: 'Das hat nicht geklappt. Bitte versuchen Sie es später noch einmal.' });
    }
  }
  let rawSize: number;
  try { rawSize = typeof body === 'string' ? Buffer.byteLength(body, 'utf8') : Buffer.byteLength(JSON.stringify(body ?? null), 'utf8'); }
  catch { return res.status(400).json({ ok: false, error: 'Ungültige Anfrage.' }); }
  if (rawSize > MAX_REQUEST_BYTES) return res.status(413).json({ ok: false, code: 'INPUT_TOO_LARGE', error: 'Die Anfrage ist zu gross. Bitte eine kleinere Datei wählen.' });
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ ok: false, error: 'Ungültige Anfrage.' });
  }
  // Honeypot: Bots füllen das versteckte Feld aus. Wir antworten freundlich, tun aber nichts.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return res.status(200).json({ ok: true, leadId: newId() });
  }

  try {
    if (body.kind === 'render') return await handleRender(req, res, body as RenderBody, ctx);
    if (body.kind === 'beratung') return await handleBeratung(req, res, body as BeratungBody, ctx);
    if (body.kind === 'grundriss') return await handleGrundriss(req, res, body as GrundrissBody, ctx);
    return res.status(400).json({ ok: false, error: 'Unbekannte Anfrage.' });
  } catch (err: any) {
    if (err instanceof ValidationError) return res.status(400).json({ ok: false, code: 'INVALID_SELECTION', field: err.field, error: err.message });
    if (err instanceof TimeoutError) return res.status(504).json({ ok: false, code: 'TIMEOUT', error: 'Das hat zu lange gedauert. Bitte versuchen Sie es später noch einmal.' });
    console.error('[badplaner] unerwarteter Fehler', err?.name || 'Error');
    return res.status(500).json({ ok: false, error: 'Das hat nicht geklappt. Bitte versuchen Sie es später noch einmal.' });
  }
}

/* ---------- kind: render ---------- */

async function handleRender(req: any, res: any, body: RenderBody, ctx: RequestContext) {
  const { room, isGuestWc, cistern, pkg, opts, isAtelier, individuell, tile, floorTile, base, top, basinType,
    tapSeriesOption, finish, sanitary, wall, shower, bathtub, basin, mirror, look, format,
    floorFormat, accentMode, placement, accent, requiresQuote } = normalizeSelection(body as unknown as Record<string, unknown>);

  // 3. Fenster und Kontakt (Pflichtfelder)
  const windows = text(body.windows, 4);
  if (!/^[0-3]$/.test(windows)) return bad(res, 'Bitte geben Sie an, wie viele Fenster auf dem Foto zu sehen sind.');
  // Vorschau: das Bild kommt vor den Kontaktangaben, die folgen mit kind 'anfrage'.
  const preview = body.stage === 'vorschau';
  const name = preview ? '(noch ohne Kontakt)' : text(body.name, 120);
  const phone = preview ? '–' : text(body.telefon ?? body.phone, 60);
  const email = preview ? '' : text(body.email, 120);
  const place = preview ? '' : text(body.place, 120);
  const newsletter = !preview && body.newsletter === true;
  if (!preview) {
    const contactError = contactProblem(name, phone, email, place);
    if (contactError) return bad(res, contactError);
  }
  if (body.consent !== true) return bad(res, 'Bitte bestätigen Sie die Datenschutzerklärung.');

  // 4. Foto: neu als data-URL im Feld `foto`, alt als { mime, data } im Feld `photo`
  const photo = readPhoto(body);
  if (!photo) return bad(res, 'Bitte ein Foto Ihres Bads (JPEG, PNG oder WebP) hochladen.');
  let photoRatio = '';
  try {
    photo.data = normalizeBase64(photo.data, MAX_PHOTO_BASE64);
    const size = validateImageBytes(Buffer.from(photo.data, 'base64'), photo.mime);
    photoRatio = nearestAspectRatio(size.width, size.height);
  } catch { return bad(res, 'Das Foto ist ungültig oder zu gross. Bitte JPEG, PNG oder WebP wählen.'); }
  if (!env.GEMINI_API_KEY) {
    console.error('[badplaner] Bilddienst nicht konfiguriert');
    return res.status(503).json({ ok: false, code: 'SERVICE_UNAVAILABLE', error: 'Der Badplaner ist im Moment nicht verfügbar. Rufen Sie uns an: ' + business.phone.display });
  }

  // 5. Limits
  const today = new Date(dependencies.clock.now()).toISOString().slice(0, 10);
  const cookie = readCounterCookie(req.headers?.cookie, today);
  if (cookie >= PER_DEVICE_PER_DAY) {
    return res.status(429).json({
      ok: false,
      error: `Tageslimit erreicht (${PER_DEVICE_PER_DAY} Ideenbilder). Rufen Sie uns an oder kommen Sie in die Ausstellung.`,
    });
  }
  const ip = clientIp(req);
  const ipEntry = ipCounter.get(ip);
  const ipCount = ipEntry && ipEntry.date === today ? ipEntry.count : 0;
  if (ipCount >= PER_IP_PER_DAY) {
    return res.status(429).json({ ok: false, error: 'Tageslimit erreicht. Rufen Sie uns an oder kommen Sie in die Ausstellung.' });
  }
  const dailyCap = Number(env.BADPLANER_DAILY_CAP) > 0 ? Number(env.BADPLANER_DAILY_CAP) : 60;
  if (globalCounter.date !== today) {
    globalCounter.date = today;
    globalCounter.count = 0;
  }
  if (globalCounter.count >= dailyCap) {
    return res.status(429).json({ ok: false, error: 'Der Badplaner hat heute sein Tageslimit erreicht. Rufen Sie uns an oder versuchen Sie es morgen wieder.' });
  }
  // Versuche zählen (auch wenn das Modell nachher kein Bild liefert)
  ipCounter.set(ip, { date: today, count: ipCount + 1 });
  globalCounter.count++;
  if (ipCounter.size > 5000) ipCounter.clear(); // Speicher der Instanz schonen

  let delivered = false;
  try {

  // 6. Swatch (Materialprobe der Wandplatte) laden: zuerst unsere Kopie, sonst Lieferant, sonst ohne.
  //    Gleichzeitig die Vorpruefung des Fotos (zeigt es ein Bad, und wo steht was):
  //    beides sind Wartezeiten auf fremde Server, nacheinander kosten sie doppelt.
  //    Dazu die Muster von Waschtischplatte und Unterbau: nur mit dem Namen ("Stone Color
  //    Diamante") kennt das Modell die Farbe nicht und nahm am 19.09. fuer die Platte den
  //    Marmor der Wand. Teilen sich beide dieselbe Datei, geht sie nur einmal mit.
  const vanityImages = [...new Set([top.image, base.image])];
  const [swatch, photoCheck, ...vanitySwatches] = await Promise.all([
    loadSwatch(tile.image, tile.src || '', ctx),
    checkPhoto(photo, room, ctx),
    ...vanityImages.map((image) => loadSwatch(image, (image === top.image ? top.src : base.src) || '', ctx)),
  ]);
  const topSwatch = vanitySwatches[vanityImages.indexOf(top.image)];
  const baseSwatch = vanitySwatches[vanityImages.indexOf(base.image)];
  if (photoCheck.status === 'ok') console.info('[badplaner] Grundriss laut Foto', photoCheck.layout ? JSON.stringify(photoCheck.layout) : 'nicht lesbar');

  // 6b. Nur bei Aufputz: Produktfoto des Sanitärmoduls als weitere Vorlage.
  // Beschreiben allein genügt dem Modell nicht, es baut sonst eine verkleidete
  // Vorwand. Das Bild liegt im Code, darum kann es weder fehlen noch Zeit kosten.
  const moduleImage = cistern === 'aufputz' ? SANITARY_MODULE_PHOTO : null;
  // 6c. Atelier: Treemme Aurelia als Produktfoto, weil die Worte allein am 20.09. nur
  // allgemeine Armaturen ergaben. Nur Armaturen auf weissem Grund, kein Raum.
  const tapsImage = isAtelier && !isGuestWc ? AURELIA_TAPS_PHOTO : null;

  // Bilder an Gemini, in dieser Reihenfolge: 1 Foto, dann Platte, Waschtischplatte,
  // Unterbau (dieselbe Datei nur einmal), Modul, Armaturen. Die Nummern stehen so im Prompt.
  const references = [swatch, topSwatch, baseSwatch === topSwatch ? null : baseSwatch, moduleImage, tapsImage];
  const imageNumber = (image: Photo | null) => (image ? 2 + references.filter(Boolean).indexOf(image) : 0);

  // 7. Armaturen: Essenza Aufputz verchromt, Colore in der gewählten Serie und Oberfläche,
  //    Atelier Unterputz in der gewählten Oberfläche.
  const taps = tapDescription(pkg.id as PackageId, finish, tapSeriesOption, opts.tapSeries);

  // 8. Prompt (englisch; Vorlage aus dem Test, mit eingesetzten Wahlwerten)
  const prompt = buildPrompt({
    packageName: pkg.name,
    room,
    lookPrompt: isAtelier ? look?.prompt : undefined,
    format: format.replace('x', '×'),
    tilePrompt: tile.prompt,
    floorFormat: floorTile ? floorFormat.replace('x', '×') : undefined,
    floorPrompt: floorTile ? floorTile.prompt : undefined,
    accentPlacementPrompt: accent ? placement?.prompt : undefined,
    accentPrompt: accent ? accent.prompt : undefined,
    wallPrompt: wall.prompt,
    showerPrompt: shower?.prompt,
    bathtubPrompt: bathtub?.prompt,
    wantsShower: shower ? shower.id !== 'keine' : false,
    wantsBathtub: bathtub ? bathtub.id !== 'keine' : false,
    sanitaryPrompt: sanitary.prompt,
    basinPrompt: basin.prompt,
    basinTypePrompt: basinType?.prompt,
    // Ein integriertes Becken ist aus dem Plattenmaterial, nicht aus Keramik.
    basinIsCeramic: !!basinType && basinType.id !== 'integriert',
    topPrompt: top.prompt,
    basePrompt: base.prompt,
    mirrorPrompt: mirror.prompt,
    tapPrompt: isGuestWc ? `washbasin tap in ${finish.prompt}; no shower mixer, bath filler or shower controls` : taps.prompt,
    withSwatch: !!swatch,
    topImageNumber: imageNumber(topSwatch),
    baseImageNumber: imageNumber(baseSwatch),
    moduleImageNumber: imageNumber(moduleImage),
    tapsImageNumber: imageNumber(tapsImage),
    windows,
    cistern,
    layout: photoCheck.status === 'ok' ? photoCheck.layout : undefined,
  });

  // 9. Auswahl in Klartext: dieselben Zeilen für Lead- und Kundenmail. Sie
  // werden vor der Prüfung aufgebaut, damit NLD den bereits erfassten Lead
  // auch dann erhält, wenn kein Ideenbild sicher angezeigt werden darf.
  const packageLabel = requiresQuote
    ? `${pkg.name} – Individuelle Offerte`
    : `${pkg.name} (ab CHF ${pkg.priceLabel})`;
  const auswahl: [string, string][] = [];
  const row = (label: string, value: string) => auswahl.push([label, value]);
  row('Raum', isGuestWc ? 'Gäste-WC' : 'Badezimmer');
  row(isGuestWc ? 'Stilrichtung' : 'Paket', packageLabel);
  if (look) row('Look', look.label);
  row('Format', `${format.replace('x', '×')} cm`);
  row(floorTile ? 'Platten Wand' : 'Platten', tileName(tile));
  if (floorTile) row('Platten Boden', `${tileName(floorTile)}, ${floorFormat.replace('x', '×')} cm`);
  if (isAtelier && accentMode) row('Kombination', accentMode.label);
  if (accent && placement) {
    row('Akzentfläche', placement.label);
    row('Akzentmaterial', `${accent.supplier} ${accent.label}`);
  }
  row('Wandplatten', isGuestWc && wall.id === 'halbhoch'
    ? 'Wände bis ca. 120 cm, oberhalb weiss gestrichen'
    : wall.label);
  if (shower) row('Dusche', shower.label);
  if (bathtub) row('Badewanne', bathtub.label);
  row('Unterbau', `${base.label} (${base.supplier})`);
  row('Waschtischplatte', `${top.label} (${top.supplier})`);
  if (basinType) row('Waschbecken', basinType.label);
  row('Armatur', taps.label);
  row('Sanitärkeramik', `${sanitary.label} (${sanitary.supplier})`);
  row('Waschtisch', basin.label);
  row('Spiegel', mirror.label);

  const leadId = newId();
  const photoName = photo.mime === 'image/png' ? 'foto.png' : photo.mime === 'image/webp' ? 'foto.webp' : 'foto.jpg';
  const leadDetails = (checkStatus: string, imageStatus?: string): [string, string][] => [
    ['Name', name],
    ['Telefon / WhatsApp', phone],
    ['E-Mail', email || '–'],
    ['PLZ / Ort', place || '–'],
    ...auswahl,
    ['Fenster laut Kunde', windows === '0' ? 'keine' : windows === '3' ? '3 oder mehr' : windows],
    ['WC / Spülkasten', cistern === 'aufputz'
      ? 'Aufputz, ersetzt durch Sanitärmodul (im Fixpreis enthalten)'
      : 'Unterputz'],
    ['Muster', `Platte ${swatch ? 'geladen' : 'nicht geladen'}, Waschtisch ${topSwatch && baseSwatch ? 'geladen' : 'nicht geladen'}`],
    ...(cistern === 'aufputz' ? [['Sanitärmodul', 'OLI QR INOX Sospeso, Vorlagebild mitgeschickt'] as [string, string]] : []),
    ['Fensterprüfung', checkStatus],
    ...(imageStatus ? [['Ideenbild', imageStatus] as [string, string]] : []),
    ['Newsletter', newsletter ? 'ja' : 'nein'],
    ['Zeitpunkt', swissTime()],
    ['Seite', req.headers?.referer || req.headers?.referrer || '/badplaner'],
    ['Lead-ID', leadId],
  ];

  // Der zweite Versuch wird weiter unten an der gemessenen Dauer des ersten
  // Durchgangs entschieden, nicht an den Höchstwerten.
  // 9b. Zeigt das Foto ueberhaupt ein Bad? Spart bei einem falschen Foto zwei
  // Generierungen und sagt dem Kunden, was wirklich fehlt.
  if (photoCheck.status === 'wrong_room') {
    console.warn('[badplaner] Foto zeigt kein Bad', photoCheck.reason);
    const wrongRoomDelivery = await sendLeadMail({
      subject: preview
        ? `Badplaner-Fehler ohne Kontakt – ${isGuestWc ? 'Gäste-WC' : pkg.name} – Foto nicht erkannt`
        : `Badplaner-Lead: ${name} - ${isGuestWc ? 'Gaeste-WC' : pkg.name} - Foto zeigt kein Bad`,
      replyTo: email || undefined,
      intro: preview
        ? 'Anonymer Badplaner-Versuch ohne Kontaktdaten. Das Foto wurde nicht als Bad oder Gäste-WC erkannt; deshalb wurde kein Ideenbild erzeugt. Foto und Auswahl liegen bei.'
        : 'Auf dem Foto ist kein Bad und kein WC zu erkennen, darum wurde kein Ideenbild erzeugt. Das Foto und die Auswahl liegen bei.',
      details: leadDetails(
        `nicht nötig: Foto zeigt kein Bad (${photoCheck.reason})`,
        preview ? RENDER_FAILURE_LABELS.PHOTO_NOT_A_BATHROOM : 'nicht erzeugt: Foto zeigt kein Bad',
      ),
      attachments: [{ filename: photoName, content: photo.data }],
    }, ctx);
    // Wie bei einem verworfenen Ideenbild: sein Tageslimit bleibt unberuehrt,
    // er darf mit dem richtigen Foto sofort nochmals.
    delivered = true;
    return res.status(422).json({
      ok: false, code: 'PHOTO_NOT_A_BATHROOM',
      delivery: { lead: wrongRoomDelivery.status, leadProvider: wrongRoomDelivery.provider, leadAttachments: wrongRoomDelivery.attachments },
      error: preview || wrongRoomDelivery.status !== 'accepted'
        ? 'Auf Ihrem Foto erkennen wir kein Bad und kein WC. Bitte wählen Sie ein Foto, auf dem der ganze Raum mit WC und Waschbecken zu sehen ist. Sie können ein anderes Foto verwenden oder eine persönliche Beratung anfragen.'
        : 'Auf Ihrem Foto erkennen wir kein Bad und kein WC. Ihre Angaben und Ihr Foto sind bei uns. Wir melden uns persönlich bei Ihnen.',
    });
  }

  console.info('[badplaner] Seitenverhältnis', photoRatio || 'automatisch');
  // Wenn der Bilddienst nichts liefert, war der Kunde trotzdem da: Name, Telefon
  // und Foto sind das Wertvolle. Frueher ging bei einem Fehler alles verloren.
  const leadWithoutImage = async (note: string, discarded?: { mime: string; data: string }) => {
    const failDelivery = await sendLeadMail({
      subject: preview
        ? `Badplaner-Fehler ohne Kontakt – ${isGuestWc ? 'Gäste-WC' : pkg.name} – kein Ideenbild`
        : `Badplaner-Lead: ${name} - ${isGuestWc ? 'Gaeste-WC' : pkg.name} - kein Ideenbild erzeugt`,
      replyTo: email || undefined,
      intro: preview
        ? 'Anonymer Badplaner-Versuch ohne Kontaktdaten. Die Bildgenerierung ist fehlgeschlagen; der Besucher hat kein Ideenbild gesehen. Foto und Auswahl liegen bei.'
        : 'Die Bildgenerierung ist fehlgeschlagen; der Kunde hat kein Ideenbild gesehen. Foto und Auswahl liegen bei.',
      details: leadDetails(note, preview ? RENDER_FAILURE_LABELS.RENDER_FAILED : 'nicht erzeugt: Bilddienst hat nicht geliefert'),
      attachments: [
        { filename: photoName, content: photo.data },
        ...(discarded ? [{ filename: 'verworfen.jpg', content: discarded.data }] : []),
      ],
    }, ctx);
    return {
      ok: false as const, code: 'RENDER_FAILED',
      delivery: { lead: failDelivery.status, leadProvider: failDelivery.provider, leadAttachments: failDelivery.attachments },
      error: preview
        ? 'Ihr Ideenbild konnte leider nicht erstellt werden. Hinterlassen Sie uns Ihre Kontaktdaten – wir besprechen Ihre Badideen gerne persönlich mit Ihnen.'
        : failDelivery.status === 'accepted'
          ? 'Ihr Ideenbild konnte leider nicht erstellt werden. Ihre Angaben und Ihr Foto sind bei uns. Wir melden uns persönlich bei Ihnen.'
          : 'Ihr Ideenbild konnte leider nicht erstellt werden. Die Übermittlung Ihrer Anfrage konnte nicht bestätigt werden. Bitte kontaktieren Sie uns telefonisch.',
    };
  };

  const passStarted = dependencies.clock.now();
  let gen = await generateImage(prompt, photo, references, ctx, photoRatio);
  if (gen.ok === false) return res.status(502).json(await leadWithoutImage(`Bilddienst: ${gen.detail}`));
  const firstGenerationMs = dependencies.clock.now() - passStarted;
  let checkNote = 'ok';
  const wantedFixtures = { room, shower: shower ? shower.id !== 'keine' : false, bathtub: bathtub ? bathtub.id !== 'keine' : false, cistern,
    linearDrain: shower?.id === 'walk-in' };
  const checkWithUnavailableRetry = async (image: { mime: string; data: string }): Promise<CheckResult> => {
    let result = await checkOpenings(photo, image, wantedFixtures, ctx);
    if (result.status === 'unavailable'
      && ctx.budget.remaining() >= CHECK_RETRY_DELAY_MS + CHECK_TIMEOUT_MS + DELIVERY_RESERVE_MS) {
      // Ein 503 kommt schnell, dann lohnt dieselbe Frage nochmals. Nach einem Timeout nicht
      // wieder die volle Zeit (20.09.: 25 s abgelaufen, dann 17 s): ein kurzer zweiter Anlauf.
      const afterTimeout = result.detail === 'Timeout';
      if (!afterTimeout) await dependencies.sleep(CHECK_RETRY_DELAY_MS);
      result = await checkOpenings(photo, image, wantedFixtures, ctx, afterTimeout ? QUICK_CHECK_TIMEOUT_MS : CHECK_TIMEOUT_MS);
    }
    return result;
  };
  let check = await checkWithUnavailableRetry(gen);
  let checkAttempt = 1;
  if (check.status === 'rejected') logRejectedCheck(check, checkAttempt);
  // Ein zweiter Durchgang dauert ungefähr so lange wie der erste. Die alte Schranke
  // rechnete mit den Höchstwerten (95 s) und liess den zweiten Versuch nie zu; mit
  // 110 s Budget lief er nur nach einem schnellen ersten Durchgang. Mit 220 s passt er
  // auch nach dem langsamsten ersten Durchgang; die Schranke bleibt als Sicherung.
  // Auch die Bildgenerierung des zweiten Versuchs rechnet mit der gemessenen
  // Pruefdauer statt mit dem Hoechstwert: am 19.09. bekam sie so nur 25 s und
  // brach ab, obwohl bis zur Schranke noch 65 s frei waren.
  const firstPassMs = dependencies.clock.now() - passStarted;
  const secondPassMs = Math.round(firstPassMs * 1.15) + DELIVERY_RESERVE_MS;
  const secondCheckReserveMs = Math.round((firstPassMs - firstGenerationMs) * 1.15) + DELIVERY_RESERVE_MS;
  if (check.status === 'rejected' && ctx.budget.remaining() >= secondPassMs) {
    // The rejected image never becomes a fallback if the retry/check fails.
    const firstReason = check.reason;
    const retryPrompt = `${prompt}\nIMPORTANT: a previous attempt failed the structural and fixture check: ${check.reason}. Start again from image 1 and correct that exact issue. Everything else from the instructions above still applies without exception: the same camera and framing, everything in the foreground at the edge of the picture, every opening, every recess and step of the walls, the toilet on its wall and its place, the washbasin on its own vanity unit with the mirror above it, and exactly the requested shower and bathtub state.`;
    const second = await generateImage(retryPrompt, photo, references, ctx, photoRatio, secondCheckReserveMs);
    if (second.ok === false) return res.status(502).json(await leadWithoutImage(`1. Versuch verworfen (${check.reason}), 2. Versuch: ${second.detail}`, gen));
    check = await checkWithUnavailableRetry(second);
    gen = second;
    checkAttempt = 2;
    if (check.status === 'rejected') logRejectedCheck(check, checkAttempt);
    if (check.status === 'approved') checkNote = `1. Versuch verworfen (${firstReason}), 2. Versuch ok`;
  }
  if (check.status === 'rejected') {
    const rejectedNote = `abgelehnt: ${check.reason}`;
    const leadDelivery = await sendLeadMail({
      subject: preview
        ? `Badplaner-Fehler ohne Kontakt – ${isGuestWc ? 'Gäste-WC' : pkg.name} – Ideenbild abgelehnt`
        : `Badplaner-Lead: ${name} – ${isGuestWc ? 'Gäste-WC' : pkg.name} – Ideenbild abgelehnt`,
      replyTo: email || undefined,
      intro: preview
        ? 'Anonymer Badplaner-Versuch ohne Kontaktdaten. Das Ideenbild wurde von der Qualitätsprüfung abgelehnt und nicht angezeigt. Originalfoto, Auswahl und verworfenes Bild liegen bei.'
        : 'Das Ideenbild wurde von der Qualitätsprüfung abgelehnt und dem Kunden nicht angezeigt. Originalfoto, Auswahl und verworfenes Bild liegen bei.',
      details: leadDetails(rejectedNote, preview ? RENDER_FAILURE_LABELS.RENDER_REJECTED : 'abgelehnt (Prüfung), nicht angezeigt'),
      // Das verworfene Bild geht mit: ohne es können wir nicht beurteilen, ob die
      // Prüfung recht hatte oder ein brauchbares Bild unnötig verworfen wurde.
      attachments: [
        { filename: photoName, content: photo.data },
        { filename: 'verworfen.jpg', content: gen.data },
      ],
    }, ctx);
    // Ein abgelehntes Ideenbild ist für den Kunden kein Versuch: sein Tageslimit
    // bleibt unberührt, er darf es gleich nochmals probieren. Gegen endloses
    // Wiederholen bleibt das IP-Limit stehen, darum wird es nicht zurückgedreht.
    delivered = true;
    return res.status(502).json({
      ok: false, code: 'RENDER_REJECTED',
      delivery: { lead: leadDelivery.status, leadProvider: leadDelivery.provider, leadAttachments: leadDelivery.attachments },
      // "Später erneut versuchen" war der falsche Rat: mit demselben Foto scheitert
      // es wieder. Ein weiter gefasstes Foto hilft dem Modell, den Grundriss zu halten.
      error: preview || leadDelivery.status !== 'accepted'
        ? 'Ihr Ideenbild hat unsere Qualitätsprüfung nicht bestanden und wird deshalb nicht angezeigt. Sie können ein anderes Foto verwenden oder eine persönliche Beratung anfragen.'
        : 'Ihr Ideenbild hat unsere Qualitätsprüfung nicht bestanden und wird deshalb nicht angezeigt. Ihre Angaben und Ihr Foto sind bei uns. Wir melden uns persönlich bei Ihnen.',
    });
  }
  if (check.status === 'approved' && check.note) {
    checkNote = checkNote + ', Bildausschnitt verändert: ' + check.note;
    console.info('[badplaner] Bildausschnitt verändert, Ideenbild trotzdem geliefert:', check.note);
  }
  // Nur vermerkt, nicht verworfen: ein zweiter Durchgang kostet 30 s und ein zweites Bild.
  for (const hint of check.status === 'approved' ? check.hints ?? [] : []) {
    checkNote = checkNote + ', Hinweis: ' + hint;
    console.info('[badplaner]', hint);
  }
  if (check.status === 'unavailable') checkNote = `nicht möglich (${check.detail})`;
  if (check.status === 'disabled') checkNote = 'deaktiviert';
  console.log('[badplaner] Fensterprüfung:', checkNote);

  // 11. Lead-Mail an NLD (Resend mit Anhängen, sonst Formspree ohne Bilder)
  const imageName = gen.mime === 'image/png' ? 'ideenbild.png' : 'ideenbild.jpg';
  const details = leadDetails(checkNote);
  if (preview) {
    // Foto und Bild gehen jetzt an NLD: nur hier liegt das Foto, die Anfrage bringt
    // spaeter nur noch Kontakt und Bild. Scheitert diese Mail, sieht der Besucher sein
    // Bild trotzdem; die Anfrage-Mail traegt das Bild dann nach.
    const draftDelivery = await sendLeadMail({
      subject: `Badplaner-Entwurf ohne Kontakt – ${isGuestWc ? 'Gäste-WC' : pkg.name} (${leadId})`,
      noCc: true,
      intro: 'Ein Besucher hat im Badplaner ein Ideenbild erstellt und noch keine Kontaktangaben hinterlassen. Kommt die Anfrage, folgt eine Mail "Badplaner-Lead" mit derselben Lead-ID.',
      details,
      attachments: [
        { filename: photoName, content: photo.data },
        { filename: imageName, content: gen.data },
      ],
    }, ctx);
    if (draftDelivery.status !== 'accepted') console.error('[badplaner] Entwurf-Mail nicht bestaetigt', draftDelivery.status);
    const exp = dependencies.clock.now() + TICKET_TTL_MS;
    const paket = { id: pkg.id, individuell, requiresQuote, guestWc: isGuestWc };
    const ticket = await signTicket(leadId, exp, await sha256Hex(Buffer.from(gen.data, 'base64')), auswahl, paket);
    res.setHeader('Set-Cookie', counterCookie(cookie + 1, today));
    delivered = true;
    return res.status(200).json({ ok: true, vorschau: true, leadId, image: { mime: gen.mime, data: gen.data },
      ticket, exp, auswahl, paket, delivery: { draft: draftDelivery.status } });
  }
  const leadDelivery = await sendLeadMail({
    subject: `Badplaner-Lead: ${name} – ${isGuestWc ? 'Gäste-WC' : pkg.name}`,
    replyTo: email,
    intro: 'Neuer Lead aus dem Badplaner. Foto und Ideenbild im Anhang.',
    details,
    attachments: [
      { filename: photoName, content: photo.data },
      { filename: imageName, content: gen.data },
    ],
  }, ctx);
  if (leadDelivery.status !== 'accepted') return res.status(502).json({
    ok: false, code: 'LEAD_DELIVERY_FAILED', delivery: { lead: leadDelivery.status },
    error: 'Ihre Anfrage konnte nicht bestätigt werden. Bitte kontaktieren Sie uns telefonisch; die Zustellung ist möglicherweise unklar.',
  });

  // Customer mail failure preserves the approved image, with an explicit warning.
  const customerDelivery = await sendCustomerMail({
    to: email,
    name,
    pkg,
    individuell,
    auswahl,
    image: { mime: gen.mime, data: gen.data, filename: imageName },
  }, ctx);

  // 13. Newsletter (nur wenn angehakt und RESEND_AUDIENCE_ID gesetzt ist)
  const newsletterDelivery = newsletter ? await subscribeNewsletter(email, name, ctx) : { status: 'skipped' as const };

  // 14. Antwort mit Tageszähler-Cookie
  res.setHeader('Set-Cookie', counterCookie(cookie + 1, today));
  delivered = true;
  return res.status(200).json({ ok: true, leadId, image: { mime: gen.mime, data: gen.data }, delivery: {
    lead: leadDelivery.status, leadProvider: leadDelivery.provider, leadAttachments: leadDelivery.attachments,
    customer: customerDelivery.status, newsletter: newsletterDelivery.status,
  } });
  } finally {
    if (!delivered) {
      const current = ipCounter.get(ip);
      if (current?.date === today) {
        if (current.count <= 1) ipCounter.delete(ip);
        else ipCounter.set(ip, { date: today, count: current.count - 1 });
      }
      if (globalCounter.date === today) globalCounter.count = Math.max(0, globalCounter.count - 1);
    }
  }
}

/** Dieselben Pruefungen fuer das Formular vor dem Bild (alt) und fuer die Anfrage danach. */
function contactProblem(name: string, phone: string, email: string, place: string): string {
  if (!name || !phone) return 'Bitte Name und Telefonnummer angeben.';
  if (!email) return 'Bitte E-Mail-Adresse angeben: wir schicken Ihnen das Ideenbild auch per Mail.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Die E-Mail-Adresse sieht nicht richtig aus.';
  if (!place) return 'Bitte PLZ und Ort angeben.';
  return '';
}

type TicketPackage = { id: string; individuell: boolean; requiresQuote: boolean; guestWc: boolean };

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Ticket der Vorschau: HMAC-SHA256 ueber Lead-ID, Ablauf, Bild-Hash, Auswahlzeilen und Paket.
 * Schluessel aus GEMINI_API_KEY abgeleitet: kein neues Geheimnis in Vercel noetig, und wer
 * den Schluessel nicht hat, kann weder ein anderes Bild noch andere Zeilen unterschieben.
 */
async function signTicket(leadId: string, exp: number, imageHash: string, auswahl: [string, string][], paket: TicketPackage): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(`badplaner-ticket-v1:${env.GEMINI_API_KEY || ''}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const message = JSON.stringify([leadId, exp, imageHash, auswahl, paket.id, paket.individuell, paket.requiresQuote, paket.guestWc]);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return Buffer.from(signature).toString('base64url');
}

/* ---------- kind: anfrage (Kontakt nach der Vorschau) ---------- */

/**
 * Body: 4 Byte Laenge des JSON (big endian), das JSON, danach die Bytes des Ideenbilds
 * genau so, wie sie die Vorschau geliefert hat. Als Base64 im JSON laege ein 2K-Bild
 * ueber der 4.5-MB-Grenze von Vercel. Das Ticket bindet Bild, Auswahl und Lead-ID.
 */
async function handleAnfrage(res: any, raw: Uint8Array, ctx: RequestContext) {
  const buffer = Buffer.from(raw);
  const jsonLength = buffer.length >= 4 ? buffer.readUInt32BE(0) : -1;
  if (jsonLength < 2 || jsonLength > 20000 || buffer.length <= 4 + jsonLength) return bad(res, 'Ungültige Anfrage.');
  let body: any;
  try { body = JSON.parse(buffer.subarray(4, 4 + jsonLength).toString('utf8')); } catch { return bad(res, 'Ungültige Anfrage.'); }
  if (!body || body.kind !== 'anfrage') return bad(res, 'Ungültige Anfrage.');
  if (typeof body.website === 'string' && body.website.trim() !== '') return res.status(200).json({ ok: true, leadId: newId() });
  const image = buffer.subarray(4 + jsonLength);

  const leadId = text(body.leadId, 60);
  const exp = Number(body.exp);
  const paket = body.paket || {};
  const auswahl: [string, string][] = Array.isArray(body.auswahl)
    ? body.auswahl.filter((row: any) => Array.isArray(row) && row.length === 2 && row.every((cell: any) => typeof cell === 'string')).slice(0, 40)
    : [];
  const pkg = bathPackages.find((entry) => entry.id === paket.id);
  const now = dependencies.clock.now();
  if (!/^[a-z0-9-]{4,60}$/i.test(leadId) || !pkg || !Number.isFinite(exp)) return bad(res, 'Ungültige Anfrage.');
  if (exp < now || exp > now + TICKET_TTL_MS) return bad(res, 'Die Vorschau ist abgelaufen. Bitte erstellen Sie das Ideenbild noch einmal.');
  const mime = body.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  try { validateImageBytes(image, mime, GENERATED_IMAGE_LIMITS); } catch { return bad(res, 'Ungültige Anfrage.'); }
  const ticketPackage: TicketPackage = { id: pkg.id, individuell: paket.individuell === true, requiresQuote: paket.requiresQuote === true, guestWc: paket.guestWc === true };
  const expected = await signTicket(leadId, exp, await sha256Hex(image), auswahl, ticketPackage);
  if (typeof body.ticket !== 'string' || body.ticket !== expected) {
    console.warn('[badplaner] Anfrage mit ungueltigem Ticket', leadId);
    return bad(res, 'Diese Vorschau können wir nicht zuordnen. Bitte erstellen Sie das Ideenbild noch einmal.');
  }

  const name = text(body.name, 120);
  const phone = text(body.telefon ?? body.phone, 60);
  const email = text(body.email, 120);
  const place = text(body.place, 120);
  const newsletter = body.newsletter === true;
  const contactError = contactProblem(name, phone, email, place);
  if (contactError) return bad(res, contactError);
  if (body.consent !== true) return bad(res, 'Bitte bestätigen Sie die Datenschutzerklärung.');

  const data = image.toString('base64');
  const imageName = mime === 'image/png' ? 'ideenbild.png' : 'ideenbild.jpg';
  const leadDelivery = await sendLeadMail({
    subject: `Badplaner-Lead: ${name} – ${ticketPackage.guestWc ? 'Gäste-WC' : pkg.name}`,
    replyTo: email,
    intro: `Neuer Lead aus dem Badplaner: Kontakt nach dem Ideenbild. Ideenbild im Anhang; das Foto liegt in der Mail "Badplaner-Entwurf ohne Kontakt" mit derselben Lead-ID (${leadId}).`,
    details: [
      ['Name', name],
      ['Telefon / WhatsApp', phone],
      ['E-Mail', email],
      ['PLZ / Ort', place],
      ...auswahl,
      ['Newsletter', newsletter ? 'ja' : 'nein'],
      ['Zeitpunkt', swissTime()],
      ['Lead-ID', leadId],
    ],
    attachments: [{ filename: imageName, content: data }],
  }, ctx);
  if (leadDelivery.status !== 'accepted') return res.status(502).json({
    ok: false, code: 'LEAD_DELIVERY_FAILED', delivery: { lead: leadDelivery.status },
    error: 'Ihre Anfrage konnte nicht bestätigt werden. Bitte kontaktieren Sie uns telefonisch; die Zustellung ist möglicherweise unklar.',
  });
  const customerDelivery = await sendCustomerMail({
    to: email, name, pkg, individuell: ticketPackage.individuell, auswahl, image: { mime, data, filename: imageName },
  }, ctx);
  const newsletterDelivery = newsletter ? await subscribeNewsletter(email, name, ctx) : { status: 'skipped' as const };
  return res.status(200).json({ ok: true, leadId, delivery: {
    lead: leadDelivery.status, leadProvider: leadDelivery.provider, leadAttachments: leadDelivery.attachments,
    customer: customerDelivery.status, newsletter: newsletterDelivery.status,
  } });
}

/* ---------- kind: beratung ---------- */

async function handleBeratung(req: any, res: any, body: BeratungBody, ctx: RequestContext) {
  const room = text(body.raum, 20);
  if (room !== 'badezimmer' && room !== 'gaeste-wc') return bad(res, 'Bitte Badezimmer oder Gäste-WC wählen.');
  const renderFailure = typeof body.renderFailure === 'string' && Object.prototype.hasOwnProperty.call(RENDER_FAILURE_LABELS, body.renderFailure)
    ? body.renderFailure as RenderFailureCode
    : null;
  if (body.renderFailure !== undefined && !renderFailure) return bad(res, 'Ungültiger Grund für die Beratungsanfrage.');
  const auswahl: [string, string][] = [];
  if (body.auswahl !== undefined) {
    if (!Array.isArray(body.auswahl) || body.auswahl.length > 40) return bad(res, 'Die Auswahl ist ungültig.');
    for (const row of body.auswahl) {
      if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' || typeof row[1] !== 'string') return bad(res, 'Die Auswahl ist ungültig.');
      const label = text(row[0], 80);
      const value = text(row[1], 300);
      if (!label || !value) return bad(res, 'Die Auswahl ist ungültig.');
      auswahl.push([label, value]);
    }
  }
  const priorities = text(body.priorities, 3000);
  const measurements = text(body.measurements, 1000);
  const style = text(body.style, 120);
  const budget = text(body.budget, 120);
  const name = text(body.name, 120);
  const phone = text(body.telefon ?? body.phone, 60);
  const email = text(body.email, 120);
  const imageWanted = body.imageWanted === true;
  const newsletter = body.newsletter === true;
  if (!priorities) return bad(res, 'Bitte beschreiben Sie kurz, was Sie verändern möchten und was Ihnen wichtig ist.');
  if (!name || !phone || !email) return bad(res, 'Bitte Name, Telefonnummer und E-Mail-Adresse angeben.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'Die E-Mail-Adresse sieht nicht richtig aus.');
  if (body.consent !== true) return bad(res, 'Bitte bestätigen Sie die Datenschutzerklärung.');

  const attachments: { filename: string; content: string }[] = [];
  let fileLabel = 'keine Datei';
  if (body.file) {
    const f = body.file;
    if (typeof f.data !== 'string' || f.data.length > MAX_FILE_BASE64) return bad(res, 'Die Datei ist zu gross (übertragen max. 3 MB).');
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.mime || '')) return bad(res, 'Bitte ein Bild (JPEG, PNG, WebP) oder ein PDF hochladen.');
    try {
      f.data = normalizeBase64(f.data, MAX_FILE_BASE64);
      const bytes = Buffer.from(f.data, 'base64');
      if (f.mime === 'application/pdf') {
        if (bytes.length < 8 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Invalid PDF');
      } else validateImageBytes(bytes, f.mime);
    } catch { return bad(res, 'Die Datei ist ungültig oder zu gross.'); }
    if (imageWanted && !f.mime.startsWith('image/')) return bad(res, 'Für ein Ideenbild benötigen wir ein Foto des Raums.');
    const ext = f.mime === 'application/pdf' ? 'pdf' : f.mime === 'image/png' ? 'png' : f.mime === 'image/webp' ? 'webp' : 'jpg';
    fileLabel = `beratung.${ext}`;
    attachments.push({ filename: fileLabel, content: f.data });
  }
  if (imageWanted && attachments.length === 0) return bad(res, 'Für ein Ideenbild benötigen wir ein Foto des Raums.');

  const leadId = newId();
  const details: [string, string][] = [
    ['Name', name],
    ['Telefon / WhatsApp', phone],
    ['E-Mail', email],
    ['Raum', room === 'gaeste-wc' ? 'Gäste-WC' : 'Badezimmer'],
    ...(renderFailure ? [['Grund ohne Ideenbild', RENDER_FAILURE_LABELS[renderFailure]] as [string, string]] : []),
    ...auswahl,
    ['Wünsche und Prioritäten', priorities],
    ['Masse oder Angaben zum Raum', measurements || 'nicht angegeben'],
    ['Stilpräferenz', style || 'offen'],
    ['Budgetrahmen', budget || 'nicht angegeben'],
    ['Foto, Masse oder Plan', fileLabel],
    ['Ideenbild gewünscht', imageWanted ? 'ja, nach persönlicher Prüfung' : 'nein'],
    ['Newsletter', newsletter ? 'ja' : 'nein'],
    ['Zeitpunkt', swissTime()],
    ['Seite', req.headers?.referer || req.headers?.referrer || '/badplaner'],
    ['Lead-ID', leadId],
  ];
  const delivery = await sendLeadMail({
    subject: renderFailure
      ? `Badplaner-Beratung: ${name} – ${room === 'gaeste-wc' ? 'Gäste-WC' : 'Badezimmer'}`
      : `Individuelle Beratung: ${name} – ${room === 'gaeste-wc' ? 'Gäste-WC' : 'Badezimmer'}`,
    replyTo: email,
    intro: renderFailure
      ? `Neue Beratungsanfrage nach einem fehlgeschlagenen Ideenbild. ${RENDER_FAILURE_LABELS[renderFailure]}. Das Kundenfoto und die Auswahl sind beigefügt.`
      : 'Neue Anfrage für eine individuelle Beratung oder Besichtigung. Bitte zuerst anhand der Angaben, der Datei oder telefonisch beurteilen und danach bei Bedarf einen Besichtigungstermin vereinbaren.',
    details,
    attachments,
  }, ctx);
  if (delivery.status !== 'accepted') return res.status(502).json({ ok: false, code: 'LEAD_DELIVERY_FAILED', error: 'Ihre Anfrage konnte nicht bestätigt werden. Bitte kontaktieren Sie uns telefonisch.' });
  if (attachments.length && !delivery.attachments) return res.status(502).json({ ok: false, code: 'ATTACHMENT_NOT_DELIVERED', error: 'Die Angaben wurden weitergeleitet, aber der Anhang konnte nicht zugestellt werden. Bitte senden Sie die Datei per WhatsApp.' });
  const newsletterDelivery = newsletter ? await subscribeNewsletter(email, name, ctx) : { status: 'skipped' as const };
  return res.status(200).json({ ok: true, leadId, delivery: { lead: delivery.status, newsletter: newsletterDelivery.status } });
}

/* ---------- kind: grundriss ---------- */

async function handleGrundriss(req: any, res: any, body: GrundrissBody, ctx: RequestContext) {
  const name = text(body.name, 120);
  const phone = text(body.telefon ?? body.phone, 60);
  const leadId = text(body.leadId, 40);
  const note = text(body.note, 2000);
  const sqm = body.sqm === undefined || body.sqm === null || body.sqm === '' ? '' : String(body.sqm).slice(0, 10);
  if (!name || !phone) return bad(res, 'Bitte Name und Telefonnummer angeben.');
  if (!note && !sqm && !body.file) return bad(res, 'Bitte einen Grundriss, die Grösse oder eine Bemerkung angeben.');

  const attachments: { filename: string; content: string }[] = [];
  if (body.file) {
    const f = body.file;
    if (typeof f.data !== 'string' || f.data.length > MAX_FILE_BASE64) return bad(res, 'Die Datei ist zu gross (übertragen max. 3 MB).');
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.mime || '')) return bad(res, 'Bitte ein Bild (JPEG, PNG, WebP) oder ein PDF hochladen.');
    try {
      f.data = normalizeBase64(f.data, MAX_FILE_BASE64);
      const bytes = Buffer.from(f.data, 'base64');
      if (f.mime === 'application/pdf') {
        if (bytes.length < 8 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Invalid PDF');
      } else validateImageBytes(bytes, f.mime);
    } catch { return bad(res, 'Die Datei ist ungültig oder zu gross.'); }
    const ext = f.mime === 'application/pdf' ? 'pdf' : f.mime === 'image/png' ? 'png' : f.mime === 'image/webp' ? 'webp' : 'jpg';
    attachments.push({ filename: `grundriss.${ext}`, content: f.data });
  }

  const details: [string, string][] = [
    ['Name', name],
    ['Telefon / WhatsApp', phone],
    ['Bad-Grösse', sqm ? `${sqm} m²` : '–'],
    ['Bemerkung', note || '–'],
    ['Grundriss', attachments.length ? attachments[0].filename : 'keiner'],
    ['Zeitpunkt', swissTime()],
    ['Lead-ID', leadId || '–'],
  ];
  const delivery = await sendLeadMail({
    subject: `Badplaner-Grundriss: ${name}`,
    intro: 'Ergänzung zu einem Badplaner-Lead (Grundriss / Grösse / Bemerkung).',
    details,
    attachments,
  }, ctx);
  if (delivery.status !== 'accepted') return res.status(502).json({ ok: false, code: 'LEAD_DELIVERY_FAILED', error: 'Die Ergänzung konnte nicht bestätigt werden. Bitte kontaktieren Sie uns direkt.' });
  if (attachments.length && !delivery.attachments) return res.status(502).json({
    ok: false, code: 'ATTACHMENT_NOT_DELIVERED', delivery: { lead: delivery.status, leadAttachments: false },
    error: 'Die Angaben wurden weitergeleitet, aber der Anhang konnte nicht zugestellt werden. Bitte senden Sie die Datei per WhatsApp oder kontaktieren Sie uns direkt.',
  });
  return res.status(200).json({ ok: true, delivery: { lead: delivery.status, leadAttachments: delivery.attachments } });
}

/* ---------- Auswahl auflösen ---------- */

/** Lieferant, Serie und Farbe, ohne Doppelung wenn die Serie so heisst wie die Farbe. */
function tileName(t: { supplier: string; series: string; color: string }): string {
  return t.series === t.color ? `${t.supplier} ${t.series}` : `${t.supplier} ${t.series} ${t.color}`;
}

/** Foto aus dem neuen Feld `foto` (data-URL) oder aus dem alten Feld `photo`. */
function readPhoto(body: RenderBody): Photo | null {
  if (typeof body.foto === 'string' && body.foto) {
    const m = body.foto.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([\s\S]+)$/i);
    if (!m) return null;
    const mime = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
    return { mime, data: m[2].trim() };
  }
  const legacy = body.photo;
  if (legacy && typeof legacy.data === 'string' && /^image\/(jpeg|png|webp)$/.test(legacy.mime || '')) {
    return { mime: legacy.mime, data: legacy.data };
  }
  return null;
}

/**
 * Armaturen je Paket: Essenza Aufputz verchromt (keine Auswahl), Colore mit gewählter Oberfläche
 * in der gewählten Serie, Atelier Unterputz in der gewählten Oberfläche.
 */
function tapDescription(
  pkg: PackageId,
  finish: { label: string; prompt: string },
  series: { label: string; prompt: string } | undefined,
  seriesText: string,
): { prompt: string; label: string } {
  // Atelier = Treemme Aurelia (Diego, 20.09.). Form aus den Treemme-Zeichnungen, nur in Worten, keine Fotos:
  // RWIT 2CA5 (Platte 200x75, Auslauf 187), RWIT 2CC2 (Rosetten 75), IT RTBR 380 (Kopfbrause 300, Arm 400), RWIT 2705.
  if (pkg === 'atelier') {
    return {
      prompt: `concealed built-in (Unterputz) Treemme Aurelia fittings in ${finish.prompt}, classic forms in a modern cut, no exposed mixer body anywhere: at the washbasin a thin flat horizontal rectangular wall plate with sharp corners (about 20 × 7.5 cm) above the basin, from its left part a long slim spout with flat facets along its length that runs straight out of the wall and bends down in a smooth arc, and on its right part a short cylindrical handle with a fine engraved line and a flat paddle lever hanging straight down; in a shower small round wall rosettes (about 7.5 cm), one with the same short cylinder and hanging paddle lever and one above it with a round diverter knob, a large thin round overhead shower (about 30 cm) whose rim is finely ribbed with vertical grooves, on a flat wide blade-shaped wall arm with fine lengthwise grooves, and a slim straight cylindrical stick hand shower hanging in a small round wall holder with the hose outlet; never a cross handle, never an exposed wall mixer, the overhead shower is round, never square`,
      label: `${finish.label}, ${seriesText}`,
    };
  }
  if (pkg === 'colore') {
    return {
      prompt: series
        ? `${series.prompt.replace('in polished chrome', `in ${finish.prompt}`)}, all fittings for the requested fixtures from the same series and in the same ${finish.prompt} finish`
        : `fittings for the requested fixtures in ${finish.prompt}`,
      label: series ? `${series.label}, ${finish.label}` : `${seriesText}, ${finish.label}`,
    };
  }
  return {
    // Form aus Treemmes Up+-Katalog (Diego, 13.09.): Zylinder mit Stick-Hebel, runde Rosetten, runder Kopfbrause.
    // Aufputz (Diego, 20.09.): die Probe von 09:56 zeigte in der Dusche eine Unterputz-Rosette. Darum steht der
    // sichtbare Koerper ausdruecklich da, und am Waschtisch die Standarmatur statt eines Wandauslaufs.
    prompt: 'exposed surface-mounted (Aufputz) Treemme Up+ fittings in polished chrome for the requested fixtures only, all round, slim and plain: at the washbasin a slim cylindrical single-lever mixer standing on the washbasin or its countertop, with a flat top, a thin stick lever on top and a round tube spout that bends down, never a spout coming out of the wall; in a shower an exposed wall mixer that stands clearly out from the tiles: a slim round horizontal chrome body about 25 cm long, held off the wall by two short connectors with small round cover plates, with the same thin stick lever on top, body and lever fully visible in front of the wall, never a flat concealed plate or a rosette with only a lever; from that mixer a slim round riser pipe runs up the same wall to a thin round overhead shower on a short arm, and a slim round hand shower hangs in a holder on the riser, all on that one wall; never square shapes, never a thermostat tower or a shower panel',
    label: seriesText,
  };
}

/* ---------- Prompt ---------- */

function buildPrompt(v: {
  packageName: string;
  room: 'badezimmer' | 'gaeste-wc';
  lookPrompt?: string;
  format: string;
  tilePrompt: string;
  floorFormat?: string;
  floorPrompt?: string;
  accentPlacementPrompt?: string;
  accentPrompt?: string;
  wallPrompt: string;
  showerPrompt?: string;
  bathtubPrompt?: string;
  wantsShower: boolean;
  wantsBathtub: boolean;
  sanitaryPrompt: string;
  basinPrompt: string;
  basinTypePrompt?: string;
  basinIsCeramic: boolean;
  topPrompt: string;
  basePrompt: string;
  mirrorPrompt: string;
  tapPrompt: string;
  withSwatch: boolean;
  topImageNumber: number;
  baseImageNumber: number;
  moduleImageNumber: number;
  tapsImageNumber?: number;
  windows: string;
  cistern: 'aufputz' | 'unterputz';
  layout?: Layout;
}): string {
  const vanityIntro = v.topImageNumber && v.topImageNumber === v.baseImageNumber
    ? ` Image ${v.topImageNumber} is ONLY a small colour sample for the vanity unit: its front, its body and its countertop all have exactly this colour and finish.`
    : (v.topImageNumber ? ` Image ${v.topImageNumber} is ONLY a small sample of the countertop material, colour and finish.` : '')
      + (v.baseImageNumber ? ` Image ${v.baseImageNumber} is ONLY a small colour sample for the front and body of the vanity unit.` : '');
  const moduleIntro = v.moduleImageNumber
    ? ` Image ${v.moduleImageNumber} is ONLY a product photo of one sanitary module on a plain white background: a slim flat upright panel with a white tempered glass front in two parts, a one-piece brushed stainless steel edge framing it, a small flush button near the top, and near the bottom the toilet outlet and the two threaded rods the toilet hangs on. It shows the part to build in and nothing else: no room, no wall, no layout, no colour scheme.`
    : '';
  const tapsIntro = v.tapsImageNumber
    ? ` Image ${v.tapsImageNumber} is ONLY a product photo of the tap fittings on a plain white background, in chrome: at the top the washbasin wall mixer with its flat rectangular wall plate, below it the shower set (the round mixer and diverter rosettes, the stick hand shower in its holder, the round overhead shower on its flat wall arm). Copy their exact shapes for the taps and nothing else from it: their finish in the result is the one named under CHANGE, and the image contains no room, no wall and no layout.`
    : '';
  // Am 19.09. zeichnete gemini-3-pro-image aus Diegos engem Bad ein Ausstellungsbad:
  // andere Kamera, ein Fenster dazu, Dusche und WC vertauscht. Ein langer Katalog
  // von Regeln liest sich wie eine Raumbeschreibung; darum steht zuerst, was das
  // Ergebnis IST (dasselbe Foto), und der Grundriss des Fotos wird ausdruecklich genannt.
  const intro = `PHOTO EDITING TASK, not a design task. Image 1 is a photograph of the customer's existing bathroom. The result is that same photograph after the renovation: the same picture from the same spot, with the same lens, the same crop and the same edges, in which only the surfaces and products named under CHANGE have been replaced, each one in its own place. Someone who knows this bathroom must recognise it at first glance. Do not design a new bathroom and do not show a showroom.`
    + (v.withSwatch ? ` Image 2 is ONLY a close-up material sample (tile texture and colour); ignore everything else about image 2, it contains no layout information.` : '')
    + vanityIntro
    + moduleIntro
    + tapsIntro;
  const layoutLine = v.layout ? layoutPrompt(v.layout) : '';
  const asSample = v.withSwatch ? ' as in image 2' : '';
  const windowRule =
    v.windows === '0'
      ? 'Image 1 shows NO window and no roof window: the result must not contain any window or glass opening at all, every wall stays a solid wall.'
      : v.windows
        ? `Image 1 shows exactly ${v.windows === '3' ? 'three or more' : v.windows} window(s) including roof windows: the result must show exactly the same window(s) at the same place and size and no additional window, roof window, glass opening or door anywhere; walls that are solid in image 1 stay solid.`
        : 'The number of windows, roof windows and doors must be identical to image 1: never add an opening that is not visible in image 1; walls that are solid in image 1 stay solid.';
  // Diegos Foto vom 19.09.: rechts steht die alte Duschkabine mit satiniertem Glas. In drei von
  // vier Versuchen zeichnete das Modell dort ein Fenster in die rechte Wand.
  const glassRule = ' The glass of an old shower enclosure, a shower door or any frosted or misted pane in image 1 is not a window: behind it stands a solid wall of the room, and the result shows tiled wall there, never a window, a sill or outside light.';

  // Wand- und Bodenmaterial. Bei abweichendem Boden muss klar sein, dass sich
  // "the same tiles" in der Wandhöhen-Regel auf die Wandplatte bezieht.
  const surfaces = v.floorPrompt
    ? `the walls tiled with ${v.format} cm ${v.tilePrompt} tiles${asSample}, and the floor tiled with different ${v.floorFormat} cm ${v.floorPrompt} tiles; ${v.wallPrompt} ("the same tiles" always means the wall tiles, never the floor tiles)`
    : `floor and walls tiled with the same ${v.format} cm ${v.tilePrompt} tiles${asSample}; ${v.wallPrompt}`;
  const look = v.lookPrompt ? ` overall material mood — ${v.lookPrompt};` : '';
  const accent =
    v.accentPrompt && v.accentPlacementPrompt
      ? ` Exactly ONE accent area in a second material: ${v.accentPlacementPrompt}, covered with ${v.accentPrompt}. Every other tiled surface, including the floor and all other walls, keeps the main material; no second accent area anywhere.`
      : '';
  // Die gewaehlte Sanitaerkeramik gilt fuer WC und Waschbecken. Ohne das hier
  // blieb das Becken weiss, waehrend das WC farbig war: zwei Farben in einem Bad.
  const basinColour = v.basinIsCeramic ? ` in the same ${v.sanitaryPrompt} as the toilet, exactly the same colour and finish,` : '';
  const asBase = v.baseImageNumber ? `, exactly the colour and finish of image ${v.baseImageNumber}` : '';
  const asTop = v.topImageNumber ? `, exactly the colour and finish of image ${v.topImageNumber}` : '';
  const vanity = `if a washbasin is visible in image 1, ${v.basinPrompt} at its existing place on a wall-hung vanity: front and body in ${v.basePrompt}${asBase}, countertop in ${v.topPrompt}${asTop}${v.basinTypePrompt ? `, ${v.basinTypePrompt}${basinColour}` : basinColour}, with ${v.mirrorPrompt} above it; the countertop is its own material, never cut from the wall or floor tiles and never copying their pattern or veining`;
  const fixtures = v.room === 'gaeste-wc'
    ? 'This is a guest WC: the result must contain NO shower, shower tray, shower enclosure, shower controls, bathtub or bath filler. Do not convert any visible area into a shower or bathtub.'
    : [
        v.wantsShower ? `${v.showerPrompt} inside the original wet-area footprint` : 'NO shower, shower tray, shower enclosure or shower controls',
        v.wantsBathtub ? `${v.bathtubPrompt} inside the original wet-area footprint` : 'NO bathtub and no bath filler',
      ].join('; ');
  const toilet = v.cistern === 'aufputz'
    ? `the existing surface-mounted cistern, the visible boxed cistern above or behind the toilet, is completely removed and must not survive in any form: no white cistern box, no boxed-in panel, no tiled shelf, no tiled or panelled cladding where it stood; in its exact place, flat against the existing wall, there is exactly the sanitary module of image ${v.moduleImageNumber}, copied part for part: one flat white glass front in two parts, framed by a narrow brushed stainless steel edge along the sides only, and a small flush button on the glass front near the top, never on the top surface; it is about 11 cm deep, about 50 cm wide and about 115 cm high, so clearly more than twice as tall as it is wide, reaching down to the floor, a factory-made glass and steel part, never tiled, never clad and never boxed in; the toilet is wall-hung, rimless, in ${v.sanitaryPrompt}, hanging on the front of that module at exactly the same position as the existing toilet and floating clear of the floor; its seat and lid are in the very same ${v.sanitaryPrompt}, never wood, never a contrasting colour; the wall behind is neither moved nor opened, no new partition wall is built and no low wall, ledge or shelf appears beside or above the module`
    : `the cistern stays hidden exactly where it already is, and the wall around the toilet keeps exactly the shape it has in image 1. If the flush plate in image 1 sits in a flat, full-height wall, that wall stays one flat, full-height wall, only newly tiled: nothing is built in front of it, no low wall, no boxed pre-wall, no ledge and no shelf. Only if image 1 clearly shows the toilet hanging on a half-height wall, a low built wall or boxed pre-wall that carries the cistern, that low wall is part of the room and stays: same place, same length, same height, same depth, only newly tiled, and the toilet stays mounted on its front at exactly the same spot, at the same distance from the door and from the corner. Do not flatten it, do not extend it to the ceiling and do not push the toilet back against the wall behind it. In both cases no new free-standing module is added. The toilet is wall-hung, rimless, in ${v.sanitaryPrompt}, with seat and lid in the very same ${v.sanitaryPrompt}, never wood, never a contrasting colour, at exactly its existing position`;

  return [
    intro,
    layoutLine,
    `This is an edit of image 1, not a new picture. Keep image 1 and change only what the CHANGE list names. Everything else stays exactly as it is: the camera position, angle, lens and framing, the same crop and the same aspect ratio, the walls and where they stand, with every niche, ledge, projection and step they have in image 1 and no others, the ceiling including any sloping ceiling and the room height, the room proportions, every window, roof window and door at its exact size and position, and the radiators. Never zoom out, never widen the view, never show floor, wall or ceiling beyond the edges of image 1, never create extra floor area. Whatever stands in the immediate foreground at the edge of image 1 belongs to the picture and stays: an open door leaf, a door frame, the edge of a wall, a piece of furniture cut off by the border. It keeps its place and takes up the same part of the picture as before, and is never removed to show more of the room. Every window keeps the same share of the picture it has in image 1; do not move closer to it and do not make it larger. ${windowRule}${glassRule}`,
    `KEEP THE POSITIONS. A half-height wall, a low built wall or a boxed pre-wall that a fixture stands against is part of the room, not furniture: it keeps its place, its length, its height and its depth, and the fixture stays mounted on it. Every fixture keeps the wall or low wall it stands against in image 1 and its place along it, measured against the corners, the door and the window next to it. The toilet keeps its wall and its place because its drain cannot be moved: under a sloping ceiling it stays under that sloping ceiling and is never moved to a straight or rear wall to gain headroom. The washbasin keeps its wall and its place. A bathtub that becomes a shower uses only the bathtub's own footprint, on the same wall. NO NEW WALLS: never add a wall, a partition, a half-height wall, a boxed pre-wall, a ledge, a shelf or a niche that image 1 does not show, not behind the toilet, not behind the washbasin and not in the shower. Where image 1 shows one flat wall, the result shows that same flat wall with new tiles: it never steps forward and never gets a flat top at mid-height. NOTHING IS FILLED IN EITHER: every recess, alcove, niche, wall offset, corner step and wall projection that image 1 shows stays exactly where it is, with the same width, depth and height, above all in the shower area. A shower or bathtub that stands in a recess or alcove stays inside it, and the new tiles follow the wall into the recess and around its corners. Never fill a recess, never close an alcove, never tile a niche over flush and never straighten a stepped wall into one flat wall. Only surfaces, sanitary fixtures, taps, furniture and lights change.`,
    `CHANGE this, and only this, in ${v.room === 'gaeste-wc' ? 'this guest WC' : 'this bathroom'} (style "${v.packageName}"):${look} ${surfaces}; ${fixtures}; if a toilet is visible in image 1, ${toilet}; ${vanity}; ${v.tapPrompt}.${accent}`,
    `TAKE AWAY. If image 1 shows a bidet, it is gone: this bathroom has none, and the wall and floor where it stood are finished like the rest, with nothing standing in its place. The old shower curtain and its rail are gone. Clutter, towels, bottles and rugs are gone, and so is loose furniture that just stands around; the washbasin's own vanity unit is not loose furniture and is always there, as described above. Every shower fitting — mixer, riser, overhead shower with its arm, hand shower with its holder — sits inside the shower area, all together on one and the same wall of the shower (in a floor-level shower the short end wall, with the drain at its foot), never split over two walls and never on a wall next to the toilet or the washbasin. Natural daylight, no people, no text.`,
    `BEFORE YOU DRAW, compare with image 1: the same viewpoint and framing, the same walls and ceiling, ${v.windows === '0' ? 'no window at all' : 'the same windows'}, the same door, every fixture where image 1 has it, every recess, alcove and step of the walls that image 1 has, and no low wall, ledge, shelf or niche that image 1 does not have. A small, tight room stays small and tight: never show more of the room than image 1 shows.`,
  ].filter(Boolean).join('\n');
}

/** Der Grundriss aus der Vorpruefung, als Satz fuer das Bildmodell: was wo steht, von der Kamera aus. */
function layoutPrompt(l: Layout): string {
  const wallName: Record<Wall, string> = {
    left: 'on the left wall', right: 'on the right wall', back: 'on the back wall facing the camera', front: 'on the wall nearest the camera', none: '',
  };
  const places = FIXTURES.filter((f) => l.walls[f] !== 'none').map((f) => `the ${f} ${wallName[l.walls[f]]}`);
  if (!places.length) return '';
  const seen = l.order.length > 1 ? `; from left to right: ${l.order.join(', ')}` : '';
  const near = l.nearest !== 'none' ? `; closest to the camera: the ${l.nearest}` : '';
  return `WHAT IMAGE 1 SHOWS, seen from the camera: ${places.join(', ')}${seen}${near}. Whatever stays keeps exactly that wall, that order and that distance; what the CHANGE list removes or replaces leaves its place to its replacement, and nothing else moves.`;
}

/* ---------- Swatch laden ---------- */

async function loadSwatch(image: string, src: string, ctx: RequestContext): Promise<Photo | null> {
  // Never derive a server-side URL from request Host / x-forwarded-host.
  const candidates = image.startsWith('/badplaner/swatches/') ? [new URL(image, business.siteUrl).href] : [];
  if (src.startsWith('https://')) candidates.push(src); // source comes only from the server-owned catalog
  const started = dependencies.clock.now();
  for (const url of candidates) {
    let status: number | 'keine Antwort' = 'keine Antwort';
    let contentType = '–';
    let byteLength = 0;
    try {
      const remaining = 8000 - (dependencies.clock.now() - started);
      if (remaining <= 0) break;
      const r = await request(ctx, url, { headers: { 'User-Agent': 'NewLivingDesign-Badplaner/1.0' } }, remaining, true);
      status = r.status;
      contentType = (r.headers.get('content-type') || '').split(';')[0].trim() || '–';
      byteLength = r.bytes.length;
      if (!r.ok || !contentType.startsWith('image/')) {
        console.warn('[badplaner] Swatch nicht geladen', url, `status=${status}`, `type=${contentType}`, `bytes=${byteLength}`);
        continue;
      }
      const bytes = r.bytes;
      const metadata = validateImageBytes(bytes, contentType, { maxBytes: MAX_SWATCH_BYTES, maxPixels: 50000000, maxSide: 12000 });
      const fileName = new URL(url).pathname.split('/').pop() || 'Muster';
      console.info('[badplaner] Swatch geladen', fileName, `${Math.ceil(bytes.length / 1024)} kB`);
      return { mime: metadata.mime, data: Buffer.from(bytes).toString('base64') };
    } catch (err: any) {
      const errorName = typeof err?.name === 'string' ? err.name : 'Error';
      const errorMessage = typeof err?.message === 'string' ? err.message.replace(/\s+/g, ' ').slice(0, 180) : 'unbekannter Fehler';
      console.warn('[badplaner] Swatch nicht geladen', url, `status=${status}`, `type=${contentType}`, `bytes=${byteLength}`, `${errorName}: ${errorMessage}`);
    }
  }
  return null;
}

/* ---------- Gemini ---------- */

type GenResult = { ok: true; mime: string; data: string } | { ok: false; error: string; detail: string };

async function generateImage(prompt: string, photo: Photo, references: (Photo | null)[], ctx: RequestContext, aspectRatio = '', reserveMs = CHECK_TIMEOUT_MS + DELIVERY_RESERVE_MS): Promise<GenResult> {
  // Das Ideenbild ist das Produkt: es soll das Bad des Kunden zeigen, nicht
  // irgendein schoenes Bad. Darum das genaueste Modell, nicht das billigste.
  // 2K kostet bei diesem Modell gleich viel wie 1K, also 2K.
  const model = env.BADPLANER_MODEL || 'gemini-3-pro-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const parts: any[] = [{ text: prompt }, { inlineData: { mimeType: photo.mime, data: photo.data } }];
  for (const image of references) if (image) parts.push({ inlineData: { mimeType: image.mime, data: image.data } });

  try {
    const r = await request(ctx, url, {
      method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY || '', 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: aspectRatio ? { imageSize: '2K', aspectRatio } : { imageSize: '2K' } },
      }),
    }, Math.min(GEMINI_TIMEOUT_MS, Math.max(0, ctx.budget.remaining() - reserveMs)));
    const json = r.json;
    if (!r.ok) {
      const apiMessage = typeof json?.error?.message === 'string' ? json.error.message.slice(0, 160) : '';
      console.error('[badplaner] Gemini-Fehler', r.status, apiMessage);
      const detail = `HTTP ${r.status}${apiMessage ? ': ' + apiMessage : ''}`;
      if (r.status === 429) return { ok: false, error: 'Der Bilddienst ist gerade ausgelastet. Bitte in einer Minute noch einmal versuchen.', detail };
      return { ok: false, error: 'Das Ideenbild konnte nicht erstellt werden. Bitte später noch einmal versuchen oder rufen Sie uns an.', detail };
    }
    const candidate = json?.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find((p: any) => p.inlineData?.data);
    if (!imagePart) {
      const reason = candidate?.finishReason || json?.promptFeedback?.blockReason || 'kein Bild';
      console.error('[badplaner] Gemini ohne Bild:', reason);
      return { ok: false, error: 'Aus diesem Foto konnte kein Ideenbild erstellt werden. Bitte ein anderes Foto versuchen: von der Tür aus, das ganze Bad im Bild, Licht an.', detail: `ohne Bild: ${String(reason).slice(0, 120)}` };
    }
    const mime = imagePart.inlineData.mimeType;
    if (mime !== 'image/png' && mime !== 'image/jpeg') throw new Error('Unsupported generated image');
    const data = normalizeBase64(imagePart.inlineData.data, MAX_RESPONSE_BASE64);
    validateImageBytes(Buffer.from(data, 'base64'), mime, GENERATED_IMAGE_LIMITS);
    return { ok: true, mime, data };
  } catch (err: any) {
    const timeout = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
    const detail = timeout ? 'Timeout' : String(err?.message || err).slice(0, 160);
    console.error('[badplaner] Gemini nicht erreichbar', detail);
    return {
      ok: false,
      error: timeout
        ? 'Das hat zu lange gedauert. Bitte noch einmal versuchen.'
        : 'Der Bilddienst ist im Moment nicht erreichbar. Bitte später noch einmal versuchen.',
      detail,
    };
  }
}

/* ---------- Prüfung: dazuerfundene Fenster/Türen ---------- */

// Inventar-Antworten der Modelle lesen; alles andere als die erwarteten Woerter ist unlesbar.
const inventory = (value: any): Inventory | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).some((key) => !FIXTURES.includes(key as any))) return null;
  if (FIXTURES.some((key) => !WALLS.includes(value[key]))) return null;
  return value as Inventory;
};
const order = (value: any): Fixture[] | null => {
  if (!Array.isArray(value) || value.length > FIXTURES.length) return null;
  if (value.some((item) => !FIXTURES.includes(item))) return null;
  if (new Set(value).size !== value.length) return null;
  return value as Fixture[];
};
const nearest = (value: any): Fixture | 'none' | null =>
  value === 'none' || FIXTURES.includes(value) ? value : null;

/**
 * Fragt ein Gemini-Textmodell, ob das Ideenbild eine Öffnung (Fenster, Dachfenster,
 * Tür, Glasfläche) enthält, die im Foto nicht da ist. Nicht verfügbare oder
 * unlesbare Prüfungen werden vom Aufrufer separat behandelt.
 * Prüft zusätzlich, dass Kamera, Bildausschnitt und sichtbare Raumgrenzen erhalten bleiben.
 */
async function checkOpenings(
  photo: Photo,
  gen: { mime: string; data: string },
  wanted: { room: 'badezimmer' | 'gaeste-wc'; shower: boolean; bathtub: boolean; cistern: 'aufputz' | 'unterputz'; linearDrain?: boolean },
  ctx: RequestContext,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<CheckResult> {
  const model = env.BADPLANER_CHECK_MODEL === undefined ? 'gemini-3.6-flash' : env.BADPLANER_CHECK_MODEL;
  if (!model?.trim()) return { status: 'disabled' };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const question =
    'Image 1 is a room before renovation. Image 2 is the edited result. Report only what you can see, do not judge whether it is good. ' +
    'For image 1 and for image 2, name the wall each sanitary fixture stands against, seen from the camera: "left", "right", "back", "front", or "none" when that fixture is not visible at all. ' +
    'A fixture that is only partly in frame still counts. When naming walls, a pre-wall or a sanitary module directly behind the toilet belongs to the wall it stands in front of. ' +
    'Then list the fixtures of each image in the order you see them from left to right in the picture, using the same words, each fixture at most once and only the ones you can see. ' +
    'Then name, for each image, the one fixture that stands closest to the camera, or "none" when you cannot tell. ' +
    'Then say, for each image, whether the toilet hangs on or stands against a half-height wall, a low built wall or a boxed pre-wall in front of the room wall, rather than directly against a full-height wall. A wall whose tiles simply end at mid-height with paint above is still a full-height wall. ' +
    // Nur das Verschwinden zaehlt (Ardesia, 17.09.: Tuerfluegel ganz weg). Am 19.09. wurde ein
    // sonst treues Bild verworfen, weil die Tuer links nur noch ein schmaler Streifen war.
    // Diegos Test vom 19.09.: flache, raumhoch geplattete Wand, im Ideenbild ein Muretto mit Ablage
    // hinter Waschtisch, WC und Dusche. Neue Mauerteile gibt es im Umbau nicht.
    'Set new_wall_element true if image 2 has a built wall element anywhere in the room that image 1 does not have: a half-height wall, a low built wall, a boxed pre-wall, a ledge or shelf built onto a wall, a wall section that steps forward with a flat top, a niche or a partition, behind the toilet, behind the washbasin, in the shower or elsewhere. A glass shower panel, a vanity unit, a mirror or mirror cabinet, a radiator, a flat glass sanitary module behind the toilet and the line where tiles end on a flat wall are not wall elements. ' +
    // Colore 20.09., 13:01: zweiter Versuch mit erhaltenem Ruecksprung neben der Dusche als "Nische dazu" verworfen.
    // Der Ruecksprung soll bleiben (#52): was im Foto schon da ist, ist nicht neu, auch wenn es nachher besser sichtbar ist.
    'Compare the same place in both images: the recess or alcove a shower stands in, the end face of a wall or pre-wall beside the shower and every wall step that image 1 already has are not new, even when they are easier to see in image 2 once the old tray, curtain and fittings are gone. The shower floor itself, level or raised, is not a wall element. ' +
    // Diegos Test vom 20.09., 09:56: der Ruecksprung in der Wand der Dusche war im Ideenbild zugemauert.
    'Set wall_element_lost true if image 1 has a recess, alcove, niche, wall offset, corner step or wall projection anywhere in the room, in the shower area or elsewhere, that image 2 no longer has because it was filled in, closed or straightened into one flat wall. An old bathtub with its panel, an old shower tray or enclosure, a surface-mounted cistern with its casing, a bidet and loose furniture are not wall elements: removing them is no loss. ' +
    'Set point_drain true only if image 2 has a floor-level tiled shower whose drain is a round or square point drain or grate in the shower floor, rather than a long narrow channel drain along one wall; false when there is no such shower or no drain is visible. ' +
    // Rinne an der Laengsseite sah die Pruefung am 20.09. nur 1 von 5 Mal: sie beschreibt jetzt die Waende, der Code entscheidet.
    'For that floor-level shower in image 2, look at its floor: set drain_wall to the wall, seen from the camera, at whose foot its channel drain lies ("left", "right", "back", "front", or "none" when there is no channel drain or you cannot see it), set fittings_wall to the wall that carries its mixer and hand shower (same words), and set shower_wider_than_deep true if its floor measures more from left to right than from the back wall towards the camera. ' +
    'Set drain_on_long_side true if its channel drain runs parallel to the longer dimension of the shower floor, along a long side, rather than across its narrow width at a short end; a drain along the back wall of a shower that is wider than deep runs along a long side. Set shower_fittings_split true only if its fittings (mixer, overhead shower arm, hand shower holder) are mounted on two or more different walls rather than all on one wall; false when there is no such shower or you cannot see it. ' +
    'Then say whether something large stands in the immediate foreground of image 1 at the edge of the picture, cut off by the border — an open door leaf, a door frame, the near edge of a wall, a piece of furniture — taking up roughly a fifth of the picture or more; and whether that same object is still visible at the edge of image 2 at any size, even as a narrow strip (foreground_object_after is false only when it is gone completely). ' +
    'Set window_much_bigger true only if a window that is visible in both images takes up a clearly larger part of image 2 than of image 1, about half again as large or more. ' +
    'Set extra_openings true only if image 2 has a window, roof window, door or outside opening that image 1 does not have, or lost one that image 1 has. ' +
    'Set view_changed true if camera position, angle, lens or framing changed, or if image 2 shows floor, wall or ceiling area that lies outside image 1. ' +
    'Answer with JSON only, no markdown and exactly these keys: ' +
    '{"before":{"toilet":"left","washbasin":"left","shower":"none","bathtub":"none","bidet":"none"},' +
    '"after":{"toilet":"left","washbasin":"left","shower":"none","bathtub":"none","bidet":"none"},' +
    '"order_before":["washbasin","toilet"],"order_after":["washbasin","toilet"],' +
    '"nearest_before":"toilet","nearest_after":"toilet",' +
    '"toilet_on_low_wall_before":false,"toilet_on_low_wall_after":false,"new_wall_element":false,"wall_element_lost":false,' +
    '"foreground_object_before":false,"foreground_object_after":false,"window_much_bigger":false,"point_drain":false,"drain_on_long_side":false,"shower_fittings_split":false,"drain_wall":"none","fittings_wall":"none","shower_wider_than_deep":false,' +
    '"extra_openings":false,"view_changed":false,"reason":"short English note, max 25 words"}';
  try {
    const r = await request(ctx, url, {
      method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY || '', 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: question },
              { inlineData: { mimeType: photo.mime, data: photo.data } },
              { inlineData: { mimeType: gen.mime, data: gen.data } },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', ...checkThinking(model) },
      }),
    }, Math.min(timeoutMs, Math.max(0, ctx.budget.remaining() - DELIVERY_RESERVE_MS)));
    const json = r.json;
    if (!r.ok) {
      console.error('[badplaner] Fensterprüfung fehlgeschlagen', r.status);
      return { status: 'unavailable', detail: `HTTP ${r.status}` };
    }
    const textOut: string = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    if (json?.candidates?.[0]?.finishReason !== 'STOP') return { status: 'unavailable', detail: `Abbruch: ${json?.candidates?.[0]?.finishReason || 'unbekannt'}` };
    const parsed = JSON.parse(textOut);
    const keys = ['before', 'after', 'order_before', 'order_after', 'nearest_before', 'nearest_after',
      'toilet_on_low_wall_before', 'toilet_on_low_wall_after', 'new_wall_element', 'wall_element_lost', 'foreground_object_before', 'foreground_object_after',
      'window_much_bigger', 'point_drain', 'drain_on_long_side', 'shower_fittings_split', 'drain_wall', 'fittings_wall', 'shower_wider_than_deep',
      'extra_openings', 'view_changed', 'reason'];
    // Die zwei Vermerke zur Rinne und zu den Armaturen sind neu; fehlen sie, gilt "nein".
    const optionalFlag = (key: string) => parsed?.[key] === undefined || typeof parsed[key] === 'boolean';
    const optionalWall = (key: string) => parsed?.[key] === undefined || WALLS.includes(parsed[key]);
    const before = inventory(parsed?.before);
    const after = inventory(parsed?.after);
    const orderBefore = order(parsed?.order_before);
    const orderAfter = order(parsed?.order_after);
    const nearestBefore = nearest(parsed?.nearest_before);
    const nearestAfter = nearest(parsed?.nearest_after);
    if (!parsed || Array.isArray(parsed) || !before || !after || !orderBefore || !orderAfter || !nearestBefore || !nearestAfter
      || typeof parsed.toilet_on_low_wall_before !== 'boolean' || typeof parsed.toilet_on_low_wall_after !== 'boolean'
      || typeof parsed.new_wall_element !== 'boolean' || typeof parsed.wall_element_lost !== 'boolean' || typeof parsed.point_drain !== 'boolean'
      || typeof parsed.foreground_object_before !== 'boolean' || typeof parsed.foreground_object_after !== 'boolean'
      || typeof parsed.window_much_bigger !== 'boolean' || !optionalFlag('drain_on_long_side') || !optionalFlag('shower_fittings_split')
      || !optionalFlag('shower_wider_than_deep') || !optionalWall('drain_wall') || !optionalWall('fittings_wall')
      || typeof parsed.extra_openings !== 'boolean' || typeof parsed.view_changed !== 'boolean'
      || typeof parsed.reason !== 'string' || !parsed.reason.trim() || parsed.reason.length > 200
      || Object.keys(parsed).some((key) => !keys.includes(key))) return { status: 'unavailable', detail: 'Antwort unlesbar' };
    const wallAnswers = Object.fromEntries(['toilet_on_low_wall_before', 'toilet_on_low_wall_after', 'new_wall_element', 'wall_element_lost',
      'foreground_object_before', 'foreground_object_after', 'window_much_bigger'].map((key) => [key, parsed[key] as boolean]));
    const flags: CheckFlags = { extra_openings: parsed.extra_openings, view_changed: parsed.view_changed, before, after, orderBefore, orderAfter, nearestBefore, nearestAfter, wallAnswers };
    const lowWallLost = parsed.toilet_on_low_wall_before && !parsed.toilet_on_low_wall_after
      ? 'the low wall the toilet stood against is gone, so the toilet no longer sits where it did'
      : null;
    // Ein Muretto, das im Foto nicht da ist, gibt es im Umbau nicht (Diego, 19.09.). Beim Aufputz-
    // Spuelkasten zaehlt das Glasmodul nicht: die Pruefung liest es manchmal als Vorwand.
    const wallAdded = parsed.new_wall_element || (wanted.cistern === 'unterputz' && !parsed.toilet_on_low_wall_before && parsed.toilet_on_low_wall_after)
      ? 'a low wall, ledge, shelf or niche that is not in the photo was added; where the photo shows a flat wall, the result must show the same flat wall'
      : null;
    const wallLost = parsed.wall_element_lost
      ? 'a recess, alcove, niche or step of the wall that is in the photo was filled in or straightened; every recess and wall step of the photo must stay'
      : null;
    // Steht im Foto vorne am Bildrand die offene Tuer und fehlt sie im Ideenbild,
    // hat das Modell den Blickwinkel gedreht: der Kunde erkennt sein Bad nicht wieder.
    const foregroundLost = parsed.foreground_object_before && !parsed.foreground_object_after
      ? 'what stood in the foreground of the photo, at the edge of the picture, is gone, so the view is no longer the same'
      : null;
    const zoomedIn = parsed.window_much_bigger
      ? 'the window takes up much more of the result than of the photo, so the camera moved closer'
      : null;
    const fault = compareInventory(before, after, wanted)
      || compareOrder(orderBefore, orderAfter)
      || compareDepth(before, after, nearestBefore, nearestAfter)
      || lowWallLost
      || wallAdded
      || wallLost
      || foregroundLost
      || zoomedIn;
    if (flags.extra_openings) return { status: 'rejected', reason: `an opening was added or lost (${parsed.reason.slice(0, 120)})`, flags };
    if (fault) return { status: 'rejected', reason: fault, flags };
    // Ein anderer Bildausschnitt allein ist kein Grund, dem Kunden nichts zu zeigen:
    // Fenster, WC, Wände und Ausstattung stimmen dann ja. Er wird nur vermerkt.
    // Rinne und Armaturen der Walk-in-Dusche werden nur vermerkt (siehe handleRender).
    // Die Rinne gehoert an den Fuss der Armaturenwand; bei einer Dusche breiter als tief nie an die Rueckwand.
    const drainWall: Wall | undefined = parsed.drain_wall;
    const fittingsWall: Wall | undefined = parsed.fittings_wall;
    const drainOnLongSide = parsed.drain_on_long_side === true
      || (!!drainWall && drainWall !== 'none' && !!fittingsWall && fittingsWall !== 'none' && drainWall !== fittingsWall)
      || (parsed.shower_wider_than_deep === true && drainWall === 'back');
    if (wanted.linearDrain) console.info('[badplaner] Walk-in:', `Rinne ${drainWall ?? '-'}, Armaturen ${fittingsWall ?? '-'}, breiter als tief ${parsed.shower_wider_than_deep ?? '-'}`);
    const hints = wanted.linearDrain ? [
      parsed.point_drain && 'Punktablauf statt Duschrinne gezeichnet',
      drainOnLongSide && 'Duschrinne an der Längsseite statt an der Schmalseite',
      parsed.shower_fittings_split === true && 'Duscharmaturen an zwei Wänden statt alle an der Schmalseite',
    ].filter((hint): hint is string => !!hint) : [];
    return flags.view_changed ? { status: 'approved', note: parsed.reason.slice(0, 200), hints } : { status: 'approved', hints };
  } catch (err: any) {
    const detail = err && (err.name === 'AbortError' || err.name === 'TimeoutError') ? 'Timeout' : String(err?.message || err).slice(0, 120);
    console.error('[badplaner] Fensterprüfung nicht möglich', detail);
    return { status: 'unavailable', detail };
  }
}

/**
 * Vorpruefung des Kundenfotos, vor der teuren Bildgenerierung: zeigt es
 * ueberhaupt ein Bad oder ein WC? Ein Balkon, ein Wohnzimmer oder ein
 * Screenshot zwingt das Bildmodell, den ganzen Raum zu erfinden. Die
 * Oeffnungspruefung verwirft das Ergebnis danach ohnehin, nur eben nach zwei
 * Generierungen und ohne dem Kunden zu sagen, woran es wirklich lag.
 * Im Zweifel laesst diese Pruefung durch: ein ausgeraeumtes Bad soll nicht
 * abgewiesen werden.
 */
/** Was die Vorpruefung im Kundenfoto sieht: dieselben Woerter wie die Pruefung nachher. */
interface Layout { walls: Inventory; order: Fixture[]; nearest: Fixture | 'none' }
type PhotoCheck = { status: 'ok'; layout?: Layout } | { status: 'wrong_room'; reason: string } | { status: 'unavailable' };

async function checkPhoto(photo: Photo, room: 'badezimmer' | 'gaeste-wc', ctx: RequestContext): Promise<PhotoCheck> {
  const model = env.BADPLANER_CHECK_MODEL === undefined ? 'gemini-3.6-flash' : env.BADPLANER_CHECK_MODEL;
  if (!model?.trim()) return { status: 'unavailable' };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const question =
    `A customer uploaded this photo as the ${room === 'gaeste-wc' ? 'guest WC' : 'bathroom'} they want renovated. ` +
    'Set is_bathroom true if it shows the inside of a bathroom or a WC, or a room being stripped or built as one: a toilet, a washbasin, a shower, a bathtub, a bidet, a tiled wet area or exposed sanitary pipes is enough. ' +
    'Set is_bathroom true as well whenever you are not sure. ' +
    'Set is_bathroom false only when the photo clearly shows something else, for example a living room, a bedroom, a kitchen, a balcony, a garden, an office, a car, a person, a document, a screenshot or a photo of a screen. ' +
    'Then, if it is a bathroom, name the wall each sanitary fixture stands against, seen from the camera: "left", "right", "back", "front", or "none" when it is not visible; a fixture that is only partly in frame still counts. ' +
    'List the visible fixtures in the order you see them from left to right, each at most once, and name the one closest to the camera, or "none" when you cannot tell. ' +
    'Answer with JSON only, no markdown and exactly these keys: {"is_bathroom":true,"reason":"short English reason, max 25 words",' +
    '"walls":{"toilet":"left","washbasin":"left","shower":"none","bathtub":"none","bidet":"none"},"order":["washbasin","toilet"],"nearest":"toilet"}';
  try {
    const r = await request(ctx, url, {
      method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY || '', 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: question }, { inlineData: { mimeType: photo.mime, data: photo.data } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', ...checkThinking(model) },
      }),
    }, Math.min(PHOTO_CHECK_TIMEOUT_MS, Math.max(0, ctx.budget.remaining() - DELIVERY_RESERVE_MS)));
    if (!r.ok) {
      console.error('[badplaner] Fotopruefung fehlgeschlagen', r.status);
      return { status: 'unavailable' };
    }
    const json = r.json;
    if (json?.candidates?.[0]?.finishReason !== 'STOP') return { status: 'unavailable' };
    const textOut: string = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    const parsed = JSON.parse(textOut);
    if (!parsed || Array.isArray(parsed) || typeof parsed.is_bathroom !== 'boolean' || typeof parsed.reason !== 'string'
      || !parsed.reason.trim() || parsed.reason.length > 200
      || Object.keys(parsed).some((key) => !['is_bathroom', 'reason', 'walls', 'order', 'nearest'].includes(key))) return { status: 'unavailable' };
    if (!parsed.is_bathroom) return { status: 'wrong_room', reason: parsed.reason.slice(0, 200) };
    // Der Grundriss ist eine Zugabe: fehlt er oder ist er unlesbar, wird ohne ihn gerendert.
    const walls = inventory(parsed.walls);
    const seen = order(parsed.order);
    const near = nearest(parsed.nearest);
    return walls && seen && near ? { status: 'ok', layout: { walls, order: seen, nearest: near } } : { status: 'ok' };
  } catch {
    console.error('[badplaner] Fotopruefung nicht moeglich');
    return { status: 'unavailable' };
  }
}

/**
 * Gleiche Wand genuegt nicht: an derselben Wand koennen WC und Dusche die
 * Plaetze tauschen. Diego hat das am 17.09. gesehen, die Wandpruefung nicht.
 * Darum zusaetzlich die Reihenfolge von links nach rechts, verglichen nur
 * ueber die Stuecke, die auf beiden Bildern vorkommen.
 */
function compareOrder(before: Fixture[], after: Fixture[]): string | null {
  const shared = before.filter((item) => after.includes(item));
  const afterShared = after.filter((item) => shared.includes(item));
  if (shared.length < 2) return null;
  if (shared.join('>') === afterShared.join('>')) return null;
  return `the fixtures changed places: in the photo ${shared.join(', ')}, in the result ${afterShared.join(', ')}`;
}

/**
 * Wand und Reihenfolge reichen nicht: das WC kann an derselben Wand und in
 * derselben Reihenfolge nach hinten rutschen. Diego hat das am 17.09. zweimal
 * am selben Foto gesehen. Darum auch, was der Kamera am naechsten steht.
 * Ein weggeraeumtes Stueck loest die Regel nicht aus.
 */
function compareDepth(
  before: Inventory,
  after: Inventory,
  nearestBefore: Fixture | 'none',
  nearestAfter: Fixture | 'none',
): string | null {
  if (nearestBefore === 'none' || nearestAfter === 'none') return null;
  if (after[nearestBefore] === 'none') return null;
  if (nearestBefore === nearestAfter) return null;
  return `in the photo the ${nearestBefore} is closest to the camera, in the result the ${nearestAfter}`;
}

/**
 * Vergleicht das Inventar. Jede Regel steht fuer einen Fehler, den wir an
 * echten Ideenbildern gesehen haben, und fuer nichts sonst.
 */
function compareInventory(
  before: Inventory,
  after: Inventory,
  wanted: { room: 'badezimmer' | 'gaeste-wc'; shower: boolean; bathtub: boolean; cistern: 'aufputz' | 'unterputz' },
): string | null {
  // Kein Paket enthaelt ein Bidet. Steht es noch da, hat das Modell nicht umgebaut.
  if (after.bidet !== 'none') return `the bidet is still there, on the ${after.bidet} wall`;
  if (wanted.shower && after.shower === 'none') return 'the requested shower is missing';
  if (!wanted.shower && after.shower !== 'none') return `there is a shower on the ${after.shower} wall although none was ordered`;
  if (wanted.bathtub && after.bathtub === 'none') return 'the requested bathtub is missing';
  if (!wanted.bathtub && after.bathtub !== 'none') return `there is a bathtub on the ${after.bathtub} wall although none was ordered`;
  if (before.toilet !== 'none' && after.toilet === 'none') return 'the toilet is missing';
  if (before.toilet !== 'none' && after.toilet !== before.toilet) {
    return `the toilet moved from the ${before.toilet} wall to the ${after.toilet} wall`;
  }
  if (before.washbasin !== 'none' && after.washbasin !== 'none' && after.washbasin !== before.washbasin) {
    return `the washbasin moved from the ${before.washbasin} wall to the ${after.washbasin} wall`;
  }
  // Wanne wird Dusche: die Dusche gehoert an die Wand, an der die Wanne stand.
  if (wanted.shower && before.shower === 'none' && before.bathtub !== 'none'
    && after.shower !== 'none' && after.shower !== before.bathtub) {
    return `the new shower stands on the ${after.shower} wall, the bathtub it replaces stood on the ${before.bathtub} wall`;
  }
  return null;
}

function logRejectedCheck(check: Extract<CheckResult, { status: 'rejected' }>, attempt: number) {
  console.warn('[badplaner] Fensterprüfung abgelehnt', {
    attempt,
    reason: check.reason,
    flags: check.flags,
  });
}

/* ---------- Lead-Mail an NLD ---------- */

interface LeadMail {
  subject: string;
  intro: string;
  details: [string, string][];
  attachments: { filename: string; content: string }[];
  replyTo?: string;
  /** Nur an BADPLANER_TO, ohne Kopie (Entwurf ohne Kontakt: nur an Diego). */
  noCc?: boolean;
}

/**
 * Schickt den Lead per Resend (mit Anhängen). Ohne RESEND_API_KEY oder bei
 * einer eindeutigen Ablehnung geht er ohne Bilder an Formspree. Es gibt noch
 * keine persistente Lead-Ablage; ein unklarer Versand wird nicht automatisch wiederholt.
 */
async function sendLeadMail(mail: LeadMail, ctx: RequestContext): Promise<MailResult> {
  const key = env.RESEND_API_KEY;
  if (key) {
    try {
      const r = await request(ctx, 'https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: mailFrom(),
          to: [env.BADPLANER_TO || business.email],
          cc: mail.noCc ? undefined : [env.BADPLANER_CC || business.emailSecondary],
          reply_to: mail.replyTo,
          subject: mail.subject,
          html: leadHtml(mail),
          text: leadText(mail),
          attachments: mail.attachments,
        }),
      });
      if (r.ok && typeof r.json?.id === 'string' && r.json.id) return { status: 'accepted', provider: 'resend', attachments: true };
      if (r.ok) return { status: 'unknown', provider: 'resend' };
      console.error('[badplaner] Resend-Fehler', r.status);
    } catch {
      // A timeout/network error can occur after acceptance; do not duplicate it blindly.
      console.error('[badplaner] Resend-Zustellung unklar');
      return { status: 'unknown', provider: 'resend' };
    }
  } else {
    console.warn('[badplaner] RESEND_API_KEY fehlt, Lead geht an Formspree (ohne Bilder)');
  }

  // Fallback: Formspree ohne Anhänge. Das Formular xdklvgpb verlangt firstName,
  // lastName und message (sonst 422 "Validation errors"), also füllen wir sie.
  try {
    const fullName = (mail.details.find(([k]) => k === 'Name') || ['', ''])[1].trim();
    const [firstName, ...rest] = fullName.split(/\s+/);
    const fields: Record<string, string> = {
      _subject: mail.subject,
      firstName: firstName || 'Badplaner',
      lastName: rest.join(' ') || '–',
      message: leadText(mail),
      quelle: 'Badplaner',
      hinweis: 'Bilder konnten nicht angehängt werden',
    };
    for (const [label, value] of mail.details) fields[label] = value;
    if (mail.replyTo) {
      fields._replyto = mail.replyTo;
      fields.email = mail.replyTo;
    }
    const r = await request(ctx, business.formspreeEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(fields),
    });
    if (r.ok && r.json?.ok === true) return { status: 'accepted', provider: 'formspree', attachments: false };
    if (r.ok) return { status: 'unknown', provider: 'formspree' };
    console.error('[badplaner] Formspree-Fehler', r.status);
    return { status: 'failed', provider: 'formspree' };
  } catch {
    console.error('[badplaner] Formspree-Zustellung unklar');
    return { status: 'unknown', provider: 'formspree' };
  }
}

function leadHtml(mail: LeadMail): string {
  const rows = mail.details
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v).replace(/\n/g, '<br>')}</td></tr>`)
    .join('');
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111"><p>${esc(mail.intro)}</p><table cellspacing="0" cellpadding="0">${rows}</table></div>`;
}

function leadText(mail: LeadMail): string {
  return [mail.intro, '', ...mail.details.map(([k, v]) => `${k}: ${v}`)].join('\n');
}

/* ---------- Kundenmail ---------- */

interface CustomerMailInput {
  name: string;
  pkg: BathPackage;
  individuell: boolean;
  auswahl: [string, string][];
  imageCid: string;
}

/**
 * Text und Gestaltung der Bestätigungsmail an den Kunden (Deutsch, Schweiz: "ss",
 * Preise mit Apostroph). Absichtlich als eigene Funktion, damit der Text ohne
 * Eingriff in die Logik geändert werden kann.
 *
 * TODO: Die Kurztexte "enthalten / nicht enthalten" stehen noch nicht als eigene
 * Felder in src/config/business.ts; sie werden hier – wie auf der Seite – aus
 * `includes`, `extraPerSqm` und `packageNote` gebildet.
 */
function customerMail(v: CustomerMailInput): { subject: string; html: string; text: string } {
  const subject = 'Ihre Bad-Idee von New Living Design';
  const anrede = v.name ? `Guten Tag ${v.name}` : 'Guten Tag';
  const adresse = `${business.address.street}, ${business.address.zip} ${business.address.city}`;
  const zeiten = business.openingHours.map((h) => `${h.days}: ${h.opens} – ${h.closes} Uhr`).join(' · ');
  const whatsappUrl = `https://wa.me/${business.whatsapp.e164.replace('+', '')}`;
  const preisZeile = v.individuell
    ? `${individualPackage.name}: ${individualPackage.claim} Als Grundlage für das Ideenbild haben Sie das Paket ${v.pkg.name} gewählt (Richtpreis ab CHF ${v.pkg.priceLabel}).`
    : `Paket ${v.pkg.name}: Richtpreis ab CHF ${v.pkg.priceLabel}, ${v.pkg.duration} Bauzeit.`;
  const enthalten = 'Enthalten: Material, Montage und 8.1 % MwSt.';
  const nichtEnthalten = `Nicht enthalten: Plattenfläche über ca. 21 m² (CHF ${chf(v.pkg.extraPerSqm)}.– pro zusätzlichem m²), Bauarbeiten ausserhalb des Bads und Sonderwünsche, die wir nach der Besichtigung separat offerieren.`;
  const referenz = 'Referenzfläche: Bad ca. 6 m², ca. 21 m² Platten.';
  const ideenbildSatz =
    'Das ist ein Ideenbild, kein Plan: Es zeigt Stimmung, Farben und Materialien, aber keine Masse, keine Leitungen und keine verbindliche Ausführung. Was in Ihrem Bad wirklich möglich ist, klären wir bei der Besichtigung vor Ort.';
  const loeschung = `Ihr Foto und das Ideenbild liegen nur in dieser E-Mail und in unserem Postfach. Möchten Sie, dass wir beides löschen? Eine kurze Nachricht an ${business.email} genügt. Ohne Auftrag löschen wir Foto und Ideenbild spätestens 30 Tage nach der Anfrage.`;

  const rows = v.auswahl
    .map(
      ([k, val]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#666;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eee">${esc(k)}</td><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(val)}</td></tr>`,
    )
    .join('');
  const leistungen = v.pkg.includes.map((i) => `<li style="margin:2px 0">${esc(i)}</li>`).join('');

  const html = `<div style="margin:0;padding:24px 12px;background:#f6f5f3">
<div style="max-width:640px;margin:0 auto;background:#fff;padding:28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a">
  <p style="margin:0 0 14px">${esc(anrede)}</p>
  <p style="margin:0 0 18px">vielen Dank für Ihre Anfrage im Badplaner. So könnte Ihr Bad mit den von Ihnen gewählten Materialien aussehen:</p>
  <img src="cid:${esc(v.imageCid)}" alt="Ihr Ideenbild" width="592" style="width:100%;max-width:592px;height:auto;display:block;border:0;border-radius:4px;margin:0 0 8px">
  <p style="margin:0 0 22px;font-size:13px;color:#666">Das Ideenbild liegt dieser E-Mail auch als Datei bei.</p>
  <p style="margin:0 0 22px;padding:12px 14px;background:#f6f5f3;border-left:3px solid #b99b6b">${esc(ideenbildSatz)}</p>

  <h2 style="font-size:17px;margin:26px 0 10px">Ihre Auswahl</h2>
  <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>

  <h2 style="font-size:17px;margin:26px 0 10px">${esc(v.individuell ? individualPackage.name : `Paket ${v.pkg.name}`)}</h2>
  <p style="margin:0 0 10px"><strong>${esc(preisZeile)}</strong></p>
  <p style="margin:0 0 6px">${esc(enthalten)}</p>
  <ul style="margin:0 0 10px;padding-left:20px;font-size:14px;color:#333">${leistungen}</ul>
  <p style="margin:0 0 6px">${esc(nichtEnthalten)}</p>
  <p style="margin:0 0 10px">${esc(referenz)}</p>
  <p style="margin:0 0 22px;font-size:12px;color:#777">${esc(packageNote)}</p>

  <h2 style="font-size:17px;margin:26px 0 10px">Schauen Sie vorbei</h2>
  <p style="margin:0 0 10px">Materialien muss man anfassen. In unserer Ausstellung in Zofingen sehen Sie die Platten, Möbelfarben und Armaturen im Original – und wir sagen Ihnen, was in Ihrem Bad machbar ist.</p>
  <p style="margin:0 0 10px">${esc(adresse)}<br>${esc(zeiten)}<br>${esc(business.openingHoursNote)}</p>
  <p style="margin:0 0 22px">
    <a href="tel:${esc(business.phone.e164)}" style="display:inline-block;padding:11px 18px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:3px;margin:0 8px 8px 0">Anrufen ${esc(business.phone.display)}</a>
    <a href="${esc(whatsappUrl)}" style="display:inline-block;padding:11px 18px;background:#25d366;color:#fff;text-decoration:none;border-radius:3px;margin:0 8px 8px 0">WhatsApp ${esc(business.whatsapp.display)}</a>
  </p>
  <p style="margin:0 0 22px">Wir melden uns in den nächsten Tagen bei Ihnen. Sie erreichen uns auch direkt unter ${esc(business.phone.display)} oder per WhatsApp unter ${esc(business.whatsapp.display)}.</p>

  <p style="margin:0 0 6px;font-size:12px;color:#777">${esc(loeschung)}</p>
  <p style="margin:0;font-size:12px;color:#777">${esc(business.legalName)} · ${esc(adresse)} · <a href="${esc(business.siteUrl)}/datenschutz#badplaner" style="color:#777">Datenschutz</a></p>
</div>
</div>`;

  const text = [
    anrede + ',',
    '',
    'vielen Dank für Ihre Anfrage im Badplaner. Ihr Ideenbild liegt dieser E-Mail als Datei bei.',
    '',
    ideenbildSatz,
    '',
    'IHRE AUSWAHL',
    ...v.auswahl.map(([k, val]) => `${k}: ${val}`),
    '',
    (v.individuell ? individualPackage.name : `PAKET ${v.pkg.name.toUpperCase()}`).toUpperCase(),
    preisZeile,
    enthalten,
    ...v.pkg.includes.map((i) => `- ${i}`),
    nichtEnthalten,
    referenz,
    packageNote,
    '',
    'SCHAUEN SIE VORBEI',
    adresse,
    zeiten,
    business.openingHoursNote,
    `Telefon: ${business.phone.display} · WhatsApp: ${business.whatsapp.display} (${whatsappUrl})`,
    '',
    loeschung,
    `${business.legalName} · ${adresse} · ${business.siteUrl}/datenschutz#badplaner`,
  ].join('\n');

  return { subject, html, text };
}

/**
 * Schickt die Kundenmail über Resend. Ohne RESEND_API_KEY wird sie übersprungen,
 * und der Status wird separat vom freigegebenen Bild an den Client zurückgegeben.
 */
async function sendCustomerMail(v: {
  to: string;
  name: string;
  pkg: BathPackage;
  individuell: boolean;
  auswahl: [string, string][];
  image: { mime: string; data: string; filename: string };
}, ctx: RequestContext): Promise<MailResult> {
  const key = env.RESEND_API_KEY;
  if (!key) {
    console.warn('[badplaner] RESEND_API_KEY fehlt, Kundenmail wird übersprungen');
    return { status: 'skipped' };
  }
  const imageCid = 'ideenbild';
  const mail = customerMail({ name: v.name, pkg: v.pkg, individuell: v.individuell, auswahl: v.auswahl, imageCid });
  try {
    const r = await request(ctx, 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: mailFrom(),
        to: [v.to],
        reply_to: env.BADPLANER_TO || business.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: [
          // einmal eingebettet (grosses Bild im Text) und einmal als Datei zum Behalten
          { filename: v.image.filename, content: v.image.data, content_type: v.image.mime, content_id: imageCid },
          { filename: v.image.filename, content: v.image.data, content_type: v.image.mime },
        ],
      }),
    }, 6000);
    if (!r.ok) {
      console.error('[badplaner] Kundenmail nicht versendet', r.status);
      return { status: 'failed', provider: 'resend' };
    }
    if (typeof r.json?.id !== 'string' || !r.json.id) return { status: 'unknown', provider: 'resend' };
    return { status: 'accepted', provider: 'resend' };
  } catch {
    console.error('[badplaner] Kundenmail-Zustellung unklar');
    return { status: 'unknown', provider: 'resend' };
  }
}

/* ---------- Newsletter (Resend Audience) ---------- */

/**
 * Legt den Kontakt in der Resend-Audience an. Ohne RESEND_AUDIENCE_ID passiert
 * nichts; Fehler werden als eigener Status gemeldet und blockieren das Bild nicht.
 */
async function subscribeNewsletter(email: string, name: string, ctx: RequestContext): Promise<MailResult> {
  const key = env.RESEND_API_KEY;
  const audience = env.RESEND_AUDIENCE_ID;
  if (!key || !audience) {
    console.log('[badplaner] Newsletter angehakt, aber RESEND_AUDIENCE_ID fehlt: nur im Lead-Mail vermerkt');
    return { status: 'skipped' };
  }
  try {
    const parts = name.split(/\s+/).filter(Boolean);
    const r = await request(ctx, `https://api.resend.com/audiences/${encodeURIComponent(audience)}/contacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        first_name: parts[0] || '',
        last_name: parts.slice(1).join(' '),
        unsubscribed: false,
      }),
    }, 2000);
    if (!r.ok) {
      console.log('[badplaner] Newsletter-Eintrag nicht möglich', r.status);
      return { status: 'failed', provider: 'resend' };
    }
    return { status: typeof r.json?.id === 'string' && r.json.id ? 'accepted' : 'unknown', provider: 'resend' };
  } catch {
    return { status: 'unknown', provider: 'resend' };
  }
}

/* ---------- Hilfen ---------- */

function mailFrom(): string {
  return env.BADPLANER_FROM || 'Badplaner <badplaner@newlivingdesign.ch>';
}

function bad(res: any, error: string) {
  return res.status(400).json({ ok: false, error });
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Zahl mit Schweizer Tausendertrennzeichen: 36800 -> 36'800 */
function chf(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function newId(): string {
  return dependencies.newId();
}

function swissTime(): string {
  try {
    return new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Zurich' }).format(new Date(dependencies.clock.now()));
  } catch {
    return new Date(dependencies.clock.now()).toISOString();
  }
}

function clientIp(req: any): string {
  const fwd = (req.headers?.['x-forwarded-for'] || '').toString().split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unbekannt';
}

/** Liest den Tageszähler aus dem Cookie "nldbp=count:YYYY-MM-DD" (0, wenn der Tag nicht stimmt). */
function readCounterCookie(header: unknown, today: string): number {
  if (typeof header !== 'string') return 0;
  const m = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  if (!m) return 0;
  let value: string;
  try { value = decodeURIComponent(m[1]); } catch { return 0; }
  const [count, date] = value.split(':');
  if (date !== today) return 0;
  const n = parseInt(count, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function counterCookie(count: number, today: string): string {
  return `${COOKIE_NAME}=${count}:${today}; Path=/api/badplaner; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`;
}

return handler;
}

export default createHandler();
