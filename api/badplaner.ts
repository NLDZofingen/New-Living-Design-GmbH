/**
 * Badplaner-API (Vercel Serverless Function, Node-Runtime).
 *
 * POST /api/badplaner mit JSON-Body:
 *   kind: 'render', stage: 'vorschau'
 *                      Foto + Ausstattung -> Ideenbild (Gemini), VOR den Kontaktangaben:
 *                      nur Einwilligung, kein Name. Mail "Badplaner-Entwurf" mit Foto und
 *                      Bild an NLD; Antwort mit Bild und Ticket (HMAC ueber Lead-ID,
 *                      Auswahl und SHA-256 des Bildes). So laeuft die Seite heute.
 *   kind: 'render'     dasselbe mit Kontakt im selben Schritt: Lead-Mail an NLD,
 *                      Kundenmail mit dem Ideenbild, auf Wunsch Newsletter-Eintrag.
 *                      Die Seite nutzt diesen Weg nicht mehr; die Tests laufen darueber.
 *   kind: 'anfrage'    Kontakt nach der Vorschau, als Binaerkoerper (siehe handleAnfrage):
 *                      Lead- und Kundenmail mit demselben, vom Ticket bestaetigten Bild.
 *   kind: 'beratung'   persoenliche Beratung ohne Ideenbild, auf Wunsch mit Foto oder Plan.
 *   kind: 'grundriss'  Grundriss, m² oder Bemerkung zu einem bestehenden Lead.
 *
 * Ablauf bei kind: 'render'
 *   1. Pflichtfelder, alle Ausstattungs-IDs und Bildheader streng pruefen
 *      (server/badplaner/validation.ts). Alte Feldnamen bleiben gueltig.
 *   2. Grenzen: 5 Ideenbilder pro Geraet (Cookie) und 10 pro IP und Tag, Tagesdeckel. Auf Vorschau-Deployments
 *      (VERCEL_ENV=preview) gilt nur der Tagesdeckel, damit sich die Proben durchspielen lassen.
 *   3. Gleichzeitig: Muster laden (Platte, Boden, Akzent, Waschtisch) und das Foto
 *      pruefen (ein Bad? was steht wo?). Kein Bad: kein Bild, Lead mit Foto an NLD.
 *   4. Prompt bauen, zwei Ideenbilder gleichzeitig bei Gemini erzeugen und pruefen lassen (checkOpenings);
 *      gezeigt wird das bessere: ohne groben Fehler, mit den wenigsten Hinweisen.
 *      Grobe Fehler (mehr Fenster als angegeben, Oeffnung dazu oder weg, ausser einer fehlenden Tuer,
 *      andere Decke, WC oder Waschtisch an anderer Wand oder Stelle oder weg, Dusche oder Wanne nicht wie
 *      bestellt, Bidet noch da) in beiden: zweiter Durchgang, wenn die Zeit reicht; ein grob falsches
 *      Bild sieht der Kunde nie, NLD bekommt es mit dem Lead. Schwere Hinweise, die der Kunde sofort
 *      sieht (alter Spiegel, altes WC, Wannenart, Kopfbrause ohne Dusche, falscher Boden in der Dusche,
 *      eine Stufe im Walk-in oder unter der Duschwanne mehr als ihr Rand von 2 bis 3 cm, Armaturen auf zwei
 *      Waenden oder nicht an der Stirnwand der Vorpruefung), loesen ebenfalls einen zweiten Durchgang aus;
 *      gewaehlt wird dann das beste aller Bilder. Leichte Hinweise (Punktablauf, Muretto, Nische, Zahl und
 *      Art der Becken, Spiegelart) stehen nur in der Lead-Mail; eine fehlende Tuer zaehlt nicht.
 *      Ist die Pruefung nicht erreichbar, geht das Bild mit Vermerk hinaus.
 *   4b. Produktdurchgang: das gewaehlte Bild geht mit den Produktbildern (WC, Platte oder Modul,
 *      Armaturen, Dusche, Wanne, Spiegel) nochmals an Gemini, das nur die Produkte neu zeichnet. Besteht
 *      das neue Bild die Pruefung ohne mehr schwere Hinweise, sieht es der Kunde, sonst das erste; NLD
 *      bekommt beide.
 *   4c. Hat das Bild danach noch einen schweren Hinweis, sieht der Kunde es nicht (04.10.): er bekommt die
 *      Antwort eines verworfenen Bildes mit dem Weg zur Beratung, NLD Foto, Bild und Grund in der Mail.
 *   5. Lead-Mail an NLD (Resend mit Anhaengen; bei eindeutigem Fehler Formspree ohne
 *      Bilder). Ohne bestaetigte Annahme kein Erfolg; unklare Zustellung wird nicht
 *      blind wiederholt.
 *   6. Kundenmail und Newsletter mit eigenem Zustellstatus.
 *   Alle Netzwerkaufrufe einschliesslich Body-Lesen laufen unter einer Deadline von
 *   220 s (TOTAL_TIMEOUT_MS, knapp unter maxDuration 230 in vercel.json).
 *
 * Umgebungsvariablen (Vercel > Settings > Environment Variables):
 *   GEMINI_API_KEY       Pflicht. API-Schluessel von Google AI Studio (Bildmodell).
 *   RESEND_API_KEY       E-Mail-Versand mit Anhaengen ueber Resend. Fehlt er oder
 *                        wird der Versand eindeutig abgelehnt, geht der Lead ohne Bilder
 *                        an Formspree. Fehlende Kundenmail wird im Ergebnis ausgewiesen.
 *   RESEND_AUDIENCE_ID   Audience bei Resend fuer den Newsletter. Ohne diese Variable
 *                        wird die Einwilligung nur im Lead-Mail vermerkt.
 *   BADPLANER_TO         Empfaenger (Default diego.verdile@newlivingdesign.ch)
 *   BADPLANER_CC         Kopie (Default emanuel.verdile@newlivingdesign.ch)
 *   BADPLANER_FROM       Absender fuer Lead- und Kundenmail (Default
 *                        "Badplaner <badplaner@newlivingdesign.ch>",
 *                        Domain muss bei Resend verifiziert sein)
 *   BADPLANER_DAILY_CAP  Maximale Anfragen mit Ideenbild pro Tag insgesamt (Default 60); jede erzeugt so viele Bilder,
 *                        wie BADPLANER_CANDIDATES sagt, mit zweitem Durchgang doppelt so viele, dazu eines im
 *                        Produktdurchgang
 *   BADPLANER_MODEL      Gemini-Bildmodell (Default gemini-3-pro-image)
 *   BADPLANER_CHECK_MODEL Gemini-Textmodell fuer die Pruefung der Ideenbilder (Default
 *                        gemini-3.6-flash); leer lassen = Pruefungen bewusst deaktiviert, auch die Vorpruefung
 *   BADPLANER_PHOTO_CHECK_MODEL Gemini-Textmodell nur fuer die Vorpruefung des Fotos (Default
 *                        gemini-3.1-pro-preview)
 *   BADPLANER_CANDIDATES Ideenbilder pro Durchgang, 1 bis 4 (Default 2)
 *   BADPLANER_PRODUCT_PASS 0 = ohne Produktdurchgang (Default: mit, ein Bild mehr pro Anfrage)
 *
 * Fotos und Ideenbilder werden NICHT gespeichert (kein Blob, kein KV): sie gehen
 * nur an Google zur Bilderzeugung und per E-Mail an uns und an den Kunden. Es gibt
 * darum auch keine dauerhafte Lead-Ablage und keine Idempotenz; die Annahme durch
 * den Mail-Anbieter ist kein Nachweis der Zustellung. Siehe /datenschutz#badplaner.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- keine @vercel/node-Typen im Projekt, req/res sind deshalb any */
import { type PackageId } from '../src/data/badplaner.js';
import { bathPackages, business, individualPackage, packageNote, type BathPackage } from '../src/config/business.js';
import { Budget, TimeoutError, type Clock } from '../server/badplaner/budget.js';
import { normalizeSelection, ValidationError } from '../server/badplaner/validation.js';
import { normalizeBase64, validateImageBytes, MAX_PHOTO_BASE64, MAX_PLAN_BASE64 } from '../src/pages/badplaner/imageValidation.js';
import { SANITARY_MODULE_PHOTO } from '../server/badplaner/sanitaermodul.js';
import { CIELO_WC_PHOTO, FLUSH_PLATE_PHOTO, WC_PHOTO } from '../server/badplaner/wc.js';
import { LED_MIRROR_PHOTO, MIRROR_CABINET_PHOTO } from '../server/badplaner/spiegel.js';
import { AURELIA_BASIN_PHOTO, AURELIA_BATH_FLOOR_PHOTO, AURELIA_BATH_WALL_PHOTO, AURELIA_SHOWER_PHOTO } from '../server/badplaner/aurelia.js';
import { UP_AUFPUTZ_BATH_PHOTO, UP_AUFPUTZ_SHOWER_PHOTO, UP_BASIN_PHOTO, UP_BATH_PHOTO, UP_SHOWER_PHOTO } from '../server/badplaner/up.js';
import { RAN_BASIN_PHOTO, RAN_BATH_PHOTO, RAN_SHOWER_PHOTO } from '../server/badplaner/ran.js';

// Node-Globals ohne @types/node (api/tsconfig.json ist auf Edge ausgelegt)
declare const process: any;
declare const Buffer: any;

// 230 s: zwei volle Durchgaenge (Bild 65 s + Pruefung 20 s) plus Vorpruefung und Mails.
// Vercel erlaubt bis 300 s; vercel.json nennt denselben Wert.
export const config = { maxDuration: 230 };

/* ---------- Grenzen ---------- */

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
// haelt das Bild auf; laeuft sie ab, wird ohne Grundriss gerendert. Seit dem 27.09. mit mehr Nachdenken (Problem 1 der
// siebten Probe: an welcher Wand die Armaturen hingehoeren, liest sie aus der Lage der Wanne), darum 25 statt 12 s.
// Seit gemini-3.1-pro-preview (27.09.): P2 14 bis 21 s, P9 17 bis 19 s, P7 3 s oder 26 bis 27 s; mit 25 s lief P7 im Pruefstand
// dreimal ab. 40 s lassen Luft und reichen im Budget von 220 s noch fuer zwei Durchgaenge.
const PHOTO_CHECK_TIMEOUT_MS = 40000;
const CHECK_RETRY_DELAY_MS = 750;
// Die Pruefmodelle lesen nur ab und fuellen JSON aus. gemini-3.6-flash denkt ab Werk "medium";
// "low" kennen alle Gemini-3-Modelle (ai.google.dev/gemini-api/docs/generate-content/thinking),
// aeltere Modelle bekommen den Parameter nicht.
const checkThinking = (model: string, level: 'low' | 'high' = 'low') => (/^gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: level } } : {});
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
  fotoInfo?: unknown;           // Kamera oder Galerie, Groesse vor dem Verkleinern; nur fuer die Mail an NLD
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
/** Eine Wand, wie sie in der Mail an NLD steht. */
const wallDe = (wall?: string) => ({ left: 'links', right: 'rechts', back: 'hinten', front: 'vorne' } as Record<string, string>)[wall ?? ''] ?? '–';
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
type CheckResult = { status: 'approved'; note?: string; hints?: string[]; serious?: string[]; shower?: string } | { status: 'rejected'; reason: string; flags: CheckFlags } | { status: 'unavailable'; detail: string } | { status: 'disabled' };

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
    if (body.kind === 'grundriss') return await handleGrundriss(res, body as GrundrissBody, ctx);
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

  // Fenster und Kontakt (Pflichtfelder)
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

  // Foto: neu als data-URL im Feld `foto`, alt als { mime, data } im Feld `photo`
  const photo = readPhoto(body);
  if (!photo) return bad(res, 'Bitte ein Foto Ihres Bads (JPEG, PNG oder WebP) hochladen.');
  let photoRatio = '';
  let photoSent = '';
  try {
    photo.data = normalizeBase64(photo.data, MAX_PHOTO_BASE64);
    const size = validateImageBytes(Buffer.from(photo.data, 'base64'), photo.mime);
    photoRatio = nearestAspectRatio(size.width, size.height);
    photoSent = `${size.width}×${size.height}`;
  } catch { return bad(res, 'Das Foto ist ungültig oder zu gross. Bitte JPEG, PNG oder WebP wählen.'); }
  if (!env.GEMINI_API_KEY) {
    console.error('[badplaner] Bilddienst nicht konfiguriert');
    return res.status(503).json({ ok: false, code: 'SERVICE_UNAVAILABLE', error: 'Der Badplaner ist im Moment nicht verfügbar. Rufen Sie uns an: ' + business.phone.display });
  }

  // Limits. Auf den Vorschau-Deployments von Vercel gelten die Limits pro Geraet und pro IP nicht (Carla, 27.09.: nach
  // fuenf Proben war der Tag zu Ende); der Tagesdeckel bleibt. VERCEL_ENV setzt Vercel selbst, in Produktion "production".
  const testDeployment = env.VERCEL_ENV === 'preview';
  const today = new Date(dependencies.clock.now()).toISOString().slice(0, 10);
  const cookie = readCounterCookie(req.headers?.cookie, today);
  if (!testDeployment && cookie >= PER_DEVICE_PER_DAY) {
    return res.status(429).json({
      ok: false,
      error: `Tageslimit erreicht (${PER_DEVICE_PER_DAY} Ideenbilder). Rufen Sie uns an oder kommen Sie in die Ausstellung.`,
    });
  }
  const ip = clientIp(req);
  const ipEntry = ipCounter.get(ip);
  const ipCount = ipEntry && ipEntry.date === today ? ipEntry.count : 0;
  if (!testDeployment && ipCount >= PER_IP_PER_DAY) {
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

  // Muster laden (Platte, eigene Bodenplatte, Akzent, Waschtischplatte, Unterbau): zuerst unsere
  // Kopie, sonst der Lieferant, sonst ohne. Gleichzeitig die Vorpruefung des Fotos (ein Bad? was
  // steht wo?): beides sind Wartezeiten auf fremde Server, nacheinander kosten sie doppelt.
  // Nur mit dem Namen ("Stone Color Diamante") kannte das Modell die Farbe nicht und nahm am
  // 19.09. fuer die Platte den Marmor der Wand. Teilen sich Platte und Unterbau dieselbe Datei,
  // geht sie nur einmal mit.
  const vanityImages = [...new Set([top.image, base.image])];
  const [swatch, photoCheck, floorSwatch, accentSwatch, ...vanitySwatches] = await Promise.all([
    loadSwatch(tile.image, tile.src || '', ctx),
    checkPhoto(photo, room, ctx),
    floorTile ? loadSwatch(floorTile.image, floorTile.src || '', ctx) : null,
    accent ? loadSwatch(accent.image, accent.src || '', ctx) : null,
    ...vanityImages.map((image) => loadSwatch(image, (image === top.image ? top.src : base.src) || '', ctx)),
  ]);
  const topSwatch = vanitySwatches[vanityImages.indexOf(top.image)];
  const baseSwatch = vanitySwatches[vanityImages.indexOf(base.image)];
  if (photoCheck.status === 'ok') console.info('[badplaner] Grundriss laut Foto', photoCheck.layout ? JSON.stringify(photoCheck.layout) : 'nicht lesbar', 'Decke', photoCheck.ceiling ?? 'unbekannt', 'Stirnwand', photoCheck.showerWall ?? 'unbekannt');

  // Nur bei Aufputz: Produktfoto des Sanitärmoduls als weitere Vorlage.
  // Beschreiben allein genügt dem Modell nicht, es baut sonst eine verkleidete
  // Vorwand. Das Bild liegt im Code, darum kann es weder fehlen noch Zeit kosten.
  const moduleImage = cistern === 'aufputz' ? SANITARY_MODULE_PHOTO : null;
  // Das neue WC als Bild (Diego, 26.09.): mit Worten allein blieb in P4 und P8 ein WC wie das alte. In der fuenften
  // Probe war es 7 von 8 Mal das neue. Das Atelier hat die Keramik von Cielo, das WC Mare (Diego, 27.09.). Die Platte
  // OLI Blink geht im ersten Durchgang nur als Text mit: ihr Bild ergab in P2, P4, P7 und P8 trotzdem eine Platte wie
  // von Geberit, und die Platte mit zwei runden Knoepfen stand im Verdacht, den Waschtisch in P7 auf eine Platte zu
  // setzen. Ihr Bild kommt im Produktdurchgang.
  const wcImage = isAtelier ? CIELO_WC_PHOTO : WC_PHOTO;
  const wcShape = isAtelier ? 'its smooth body that narrows towards its rounded underside, with a thin flat seat and lid' : 'its flat, squared back, rounded only at the front';
  // Die Armaturen als Produktfoto, weil die Worte allein nur allgemeine Armaturen ergaben (Aurelia am 20.09.,
  // Up+ in P3 und P4 vom 25.09.). Nur Armaturen, kein Raum. Ohne Dusche nur die Waschtischarmatur, im Bild wie
  // im Text: mit dem Duschset zeichnete das Modell am 25.09. (Jonathan, Atelier ohne Dusche) ueber der
  // freistehenden Wanne Kopf- und Handbrause und zweimal statt der Wanne eine Dusche.
  const upSeries = pkg.id === 'essenza' || tapSeriesOption?.id === 'treemme-up';
  // Ran (Colore): Renderings von Diego, 26.09.; in T7 und T8 vom 25.09. kam ohne Bild der Mischer aus dem Foto.
  const ranSeries = tapSeriesOption?.id === 'treemme-ran';
  const noShower = !shower || shower.id === 'keine';
  // Der Satz zum Dusch- und Wannenbereich nur, wo es sie gibt (Gegenpruefung vom 26.09.: P4 und P7 bekamen ihn ohne Dusche).
  let wallPrompt = wall.prompt;
  if (noShower) wallPrompt = wallPrompt.replace(/; inside the shower[^;]*/, '');
  if (!bathtub || bathtub.id === 'keine') wallPrompt = wallPrompt.replace(/; every wall surface in the bathtub wet area[^;]*/, '');
  // Waschtisch und Dusche je als eigenes Bild (Diego, 26.09.): im gemeinsamen Bild folgte das Modell in P2, P5 und P9 dem
  // Waschtisch, nicht der Dusche, und in P1 setzte es die Hebel der Dusche an den Waschtisch.
  const tapsImage = isAtelier ? AURELIA_BASIN_PHOTO : ranSeries ? RAN_BASIN_PHOTO : upSeries ? UP_BASIN_PHOTO : null;
  const showerImage = noShower ? null : isAtelier ? AURELIA_SHOWER_PHOTO : ranSeries ? RAN_SHOWER_PHOTO
    : !upSeries ? null : pkg.id === 'essenza' ? UP_AUFPUTZ_SHOWER_PHOTO : UP_SHOWER_PHOTO;
  // Die Wannenarmatur als eigenes Bild, fuer Aurelia, Ran und Up+ (Bilder von Diego, 25. und 26.09.).
  const upColore = upSeries && pkg.id === 'colore';
  const bathImage = !bathtub || bathtub.id === 'keine' ? null
    : isAtelier ? (bathtub.id === 'freistehend' ? AURELIA_BATH_FLOOR_PHOTO : AURELIA_BATH_WALL_PHOTO)
    : ranSeries ? RAN_BATH_PHOTO : upColore ? UP_BATH_PHOTO : pkg.id === 'essenza' ? UP_AUFPUTZ_BATH_PHOTO : null;
  // Der neue Spiegel als Bild (Froidevaux): mit Worten allein kopierte das Modell in 10 von 12 Proben den alten (Jonathan, 25.09.).
  const mirrorImage = mirror.id === 'spiegelschrank' ? MIRROR_CABINET_PHOTO : mirror.id === 'spiegel' ? LED_MIRROR_PHOTO : null;

  // Bilder an Gemini, in dieser Reihenfolge: 1 Foto, dann Platte, Bodenplatte, Akzent,
  // Waschtischplatte, Unterbau (dieselbe Datei nur einmal), Spiegel, Modul, WC, Waschtisch, Dusche, Wannenarmatur. Die Nummern stehen so im Prompt.
  const references = [swatch, floorSwatch, accentSwatch, topSwatch, baseSwatch === topSwatch ? null : baseSwatch, mirrorImage, moduleImage, wcImage, tapsImage, showerImage, bathImage];
  const imageNumber = (image: Photo | null) => (image ? 2 + references.filter(Boolean).indexOf(image) : 0);

  // Armaturen: Essenza Aufputz verchromt, Colore in der gewählten Serie und Oberfläche,
  // Atelier Unterputz in der gewählten Oberfläche.
  const taps = tapDescription(pkg.id as PackageId, finish, tapSeriesOption, opts.tapSeries);
  // Die Wanne bekommt ihre eigene Armatur (Diego, 25.09.): die Einbauwanne an der Wand, mit Handbrause und ohne
  // Kopfbrause, die freistehende eine Standarmatur am Boden.
  const bathFiller = !bathtub || bathtub.id === 'keine' ? ''
    : bathtub.id === 'freistehend'
      ? `; beside the freestanding bathtub a floor-standing bath mixer of the same series and finish: ${isAtelier
        // P7 vom 26.09.: mit "flat paddle lever" und "faceted spout" kam die Standarmatur von Up+ (Stifthebel, Rundrohr).
        ? 'a slim round column on a round floor base at one end of the tub, with on its top a flat rectangular paddle lever lying level (not a thin pin), below it a flat spout, wider than it is thick, that runs straight out level and then curves down over the rim (not a round tube), below the spout a smooth round diverter knob sticking out sideways, and beside the column a slim stick hand shower standing upright in a holder fixed to the column just below the spout, its top rising above the column and its hose looping down to the floor base'
        : 'a slim column rising from the floor at one end of the tub, with a spout that bends over the rim and a hand shower in a holder on the column'}, and no fitting on the walls around the bathtub${noShower ? '' : ', apart from the shower fittings inside the shower area'}`
      : `; at the bathtub, on the wall at its tap end, a bath mixer of the same series and finish${isAtelier
        ? ': a long flat horizontal wall plate in the same finish just above the rim, carrying from left to right the hand shower outlet with a slim stick hand shower in its holder and a hose, a short cylindrical handle with a flat paddle lever hanging down, a faceted spout that bends down over the rim and a second handle with a paddle lever'
        : ranSeries
          ? ': four small square wall plates with rounded corners in one row just above the rim, from left to right the hose outlet with a slim round stick hand shower in its holder and a hose, the mixer with a flat bent blade lever, a thin flat blade spout over the rim and a second control with the same lever'
          : upColore
            ? ': four small round wall rosettes in one row just above the rim, from left to right the hose outlet with a slim stick hand shower in its holder and a hose, the mixer with a thin pin lever, a round tube spout that bends down over the rim and a second control with the same pin lever'
            : pkg.id === 'essenza'
              ? ': an exposed horizontal round bar mixer on two short wall connections just above the rim, with a round tube spout that bends down over the rim, a small diverter knob on top and a thin pin lever, and a slim stick hand shower on its hose in a small separate wall holder above it'
              : ': a wall spout above the rim and the mixer on a flat wall plate, concealed in the wall, and a hand shower on a hose in a small wall holder'}`;
  const basinTaps = taps.prompt.replace(/; in a shower [^;]*/, '');
  const tapPrompt = !noShower ? taps.prompt + bathFiller
    : bathFiller ? `${basinTaps}${bathFiller}; no overhead shower, no shower rail and no shower mixer anywhere`
    : `${basinTaps}; no shower mixer, bath filler or shower controls`;

  // Die Stirnwand der Dusche liest die Vorpruefung am schmalen Ende von Wanne oder Dusche im Foto.
  const showerWall = photoCheck.status === 'ok' && shower && shower.id !== 'keine' ? photoCheck.showerWall : undefined;
  const showerLongWall = showerWall && photoCheck.status === 'ok' ? photoCheck.showerLongWall : undefined;
  const photoWalls = photoCheck.status === 'ok' ? photoCheck.layout?.walls : undefined;
  // Der Produktdurchgang (weiter unten) zeichnet nur die Produkte neu, jedes mit seinem Bild und seinem Satz; Bild 1 ist
  // dort das gepruefte Ideenbild. Ein Produkt ohne Bild bleibt, wie der erste Durchgang es gezeichnet hat. Saetze, die im
  // ersten Durchgang auf andere Produkte verweisen ("of the same series"), fallen hier weg (Gegenpruefung vom 27.09.).
  const showerTaps = taps.prompt.match(/; in a shower ([^;]*)/)?.[1];
  // Zeigt das Foto laut Vorpruefung kein WC oder keinen Waschtisch, nennt sie auch der Produktdurchgang nicht: die Pruefung
  // verwirft nur, was fehlt oder wandert, nicht, was dazukommt (Gegenpruefung des Codes vom 27.09.).
  const noToilet = photoWalls?.toilet === 'none';
  const noBasin = photoWalls?.washbasin === 'none';
  const products = ([
    [noToilet ? null : wcImage, (n: number) => `Image ${n}, the toilet: it becomes exactly the toilet of image ${n}, with ${wcShape}, wall-hung and rimless, in ${sanitary.prompt}, with seat and lid in the same ${sanitary.prompt}, not wood${isAtelier ? '' : `; image ${n} shows the bowl without its seat, which is thin and flat`}.`],
    [!noToilet && cistern === 'unterputz' ? FLUSH_PLATE_PHOTO : null, (n: number) => `Image ${n}, the flush plate of the toilet: it becomes exactly the OLI Blink plate of image ${n}, in ${finish.prompt}: ${BLINK_PLATE}.`],
    [noToilet ? null : moduleImage, (n: number) => `Image ${n}, the sanitary module behind the toilet: it becomes exactly the OLI QR module of image ${n}: ${QR_MODULE.replace('that wall', 'the wall').replace('in front of it', 'in front of the wall')}; no flush plate. Where image 1 shows it flatter, sunk in or boxed in, it stands out to this depth, and the toilet hangs on its front.`],
    [noBasin ? null : tapsImage, (n: number) => `Image ${n}, the tap at each washbasin: it becomes exactly the fitting of image ${n}: ${basinTaps.replace(/, all fittings for the requested fixtures from the same series and in the same [^,;]+ finish$/, '')}.`],
    // Die Wand des Duschsets sagt die Vorpruefung, wie im ersten Durchgang; sonst die Wand der Handbrause im Bild. P2 der
    // sechsten Probe: Armaturen an zwei Waenden. Die Wannenarmatur hat ihre eigene Handbrause und bleibt.
    [showerTaps ? showerImage : null, (n: number) => `Image ${n}, the shower fittings: they become exactly the fittings of image ${n}, in ${finish.prompt}: ${showerTaps}. They all sit together on ${showerWall
      ? `the ${showerWall} wall seen from the camera, the short end wall of the shower${shower?.id === 'walk-in' ? ', at whose foot the channel drain lies' : ''}, ${showerWall === 'back' ? 'facing the camera' : 'seen from the side and foreshortened; the back wall of the shower carries none'}`
      : 'the wall where image 1 has the hand shower'}; any other shower mixer, plate or hand shower inside the shower area is removed, and the wall surface simply continues over its place.${bathFiller ? ' The bath mixer at the bathtub is separate and stays.' : ''}`],
    [bathImage, (n: number) => `Image ${n}, the bath mixer: it becomes exactly the fitting of image ${n}, in ${finish.prompt}: ${bathFiller.replace(/^; /, '').replace(' of the same series and finish', '')}.`],
    [noBasin ? null : mirrorImage, (n: number) => `Image ${n}, the mirror above the washbasin: it becomes exactly the mirror of image ${n}: a ${mirror.prompt}; nothing of the old mirror, its frame or a lamp stays, and there is no lamp or light bar above it.`],
  ] as [Photo | null, (n: number) => string][]).filter((item): item is [Photo, (n: number) => string] => !!item[0]);
  const productReferences = products.map(([image]) => image);
  // Farbige Keramik (siebte Probe): die Produktbilder sind weiss, und Becken und Duschwanne haben kein eigenes Bild.
  const ceramics = [basinType && basinType.id !== 'integriert' && 'washbasin bowl', shower?.id === 'duschwanne' && 'shower tray'].filter(Boolean);
  const colourLine = sanitary.id !== 'weiss' && ceramics.length
    ? `The ${ceramics.join(' and the ')} ${ceramics.length > 1 ? 'keep their' : 'keeps its'} shape and place and ${ceramics.length > 1 ? 'take' : 'takes'} the same ${sanitary.prompt} as the toilet; the product photos are white, only their shapes count.`
    : '';
  const productPrompt = buildProductPrompt(room, products.map(([, text], index) => text(index + 2)), colourLine);

  // Prompt (englisch; Vorlage aus dem Test, mit eingesetzten Wahlwerten)
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
    wallPrompt,
    // Stirnwand hinten laut Foto (P2 und P5 vom 25.09.): der Satz zur breiten Dusche verlangte die Rinne dann quer zur
    // Rueckwand, die Stirnwand an ihrem Fuss. Er faellt dort weg; links, rechts und ohne Stirnwand passt er und bleibt.
    showerPrompt: showerWall === 'back' ? shower?.prompt.replace(/When the shower is wider than it is deep[^;]*; never/, 'Never') : shower?.prompt,
    bathtubPrompt: bathtub?.prompt,
    wantsShower: shower ? shower.id !== 'keine' : false,
    trayShower: shower?.id === 'duschwanne',
    wantsBathtub: bathtub ? bathtub.id !== 'keine' : false,
    sanitaryPrompt: sanitary.prompt,
    basinPrompt: basin.prompt,
    basinTypePrompt: basinType?.prompt,
    // Ein integriertes Becken ist aus dem Plattenmaterial, nicht aus Keramik.
    basinIsCeramic: !!basinType && basinType.id !== 'integriert',
    topPrompt: top.prompt,
    basePrompt: base.prompt,
    mirrorPrompt: mirror.prompt,
    // Gaeste-WC: dieselbe Serie ohne den Teil zur Dusche. Bis zum 25.09. stand hier nur "washbasin tap" (P4: kein Up+).
    tapPrompt,
    tileIsMosaicSample: /MOSAICO/i.test(tile.src || ''),
    floorIsMosaicSample: /MOSAICO/i.test(floorTile?.src || ''),
    tileImageNumber: imageNumber(swatch),
    floorImageNumber: imageNumber(floorSwatch),
    accentImageNumber: imageNumber(accentSwatch),
    topImageNumber: imageNumber(topSwatch),
    baseImageNumber: imageNumber(baseSwatch),
    moduleImageNumber: imageNumber(moduleImage),
    wcImageNumber: imageNumber(wcImage),
    wcShape,
    plateFinish: finish.prompt,
    tapsImageNumber: imageNumber(tapsImage),
    showerImageNumber: imageNumber(showerImage),
    bathImageNumber: imageNumber(bathImage),
    mirrorImageNumber: imageNumber(mirrorImage),
    windows,
    cistern,
    layout: photoCheck.status === 'ok' ? photoCheck.layout : undefined,
    ceiling: photoCheck.status === 'ok' ? photoCheck.ceiling : undefined,
    showerWall,
    showerLongWall,
  });

  // Auswahl in Klartext: dieselben Zeilen für Lead- und Kundenmail. Sie
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
  // Was die Pruefung an der Dusche des gezeigten Bildes sah; steht erst nach der Pruefung fest.
  let showerSeen = '';
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
    ['Muster', `Platte ${swatch ? 'geladen' : 'nicht geladen'}, Waschtisch ${topSwatch && baseSwatch ? 'geladen' : 'nicht geladen'}`
      + (floorTile ? `, Boden ${floorSwatch ? 'geladen' : 'nicht geladen'}` : '')
      + (accent ? `, Akzent ${accentSwatch ? 'geladen' : 'nicht geladen'}` : '')],
    ...(cistern === 'aufputz' ? [['Sanitärmodul', 'OLI QR INOX Sospeso, Vorlagebild mitgeschickt'] as [string, string]]
      : [['Betätigungsplatte', `OLI Blink, ${finish.label}`] as [string, string]]),
    ['Foto', photoOrigin(body.fotoInfo, photoSent)],
    ...(photoCheck.status === 'ok' && photoCheck.summary ? [['Vorprüfung', photoCheck.summary] as [string, string]] : []),
    ...(showerSeen ? [['Dusche im Bild', showerSeen] as [string, string]] : []),
    ['Fensterprüfung', checkStatus],
    ...(imageStatus ? [['Ideenbild', imageStatus] as [string, string]] : []),
    ['Newsletter', newsletter ? 'ja' : 'nein'],
    ['Zeitpunkt', swissTime()],
    ['Seite', req.headers?.referer || req.headers?.referrer || '/badplaner'],
    ['Lead-ID', leadId],
  ];

  // Der zweite Versuch wird weiter unten an der gemessenen Dauer des ersten
  // Durchgangs entschieden, nicht an den Höchstwerten.
  // Zeigt das Foto ueberhaupt ein Bad? Spart bei einem falschen Foto zwei
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
  // Jonathan am 25.09.: Gaeste-WC gewaehlt, im Foto aber ein Bad mit Wanne oder Dusche. Das Modell behielt
  // sie oder raeumte sie weg, und die Pruefung verwarf alle vier Bilder. Das sagt der Badplaner jetzt vorher.
  const bath = photoWalls ? [photoWalls.bathtub !== 'none' && 'eine Badewanne', photoWalls.shower !== 'none' && 'eine Dusche'].filter(Boolean).join(' und ') : '';
  if (isGuestWc && bath) {
    console.warn('[badplaner] Gaeste-WC gewaehlt, Foto zeigt', bath);
    const bathDelivery = await sendLeadMail({
      subject: preview ? 'Badplaner-Fehler ohne Kontakt – Gäste-WC – Foto zeigt ein Bad' : `Badplaner-Lead: ${name} - Gaeste-WC - Foto zeigt ein Bad`,
      replyTo: email || undefined,
      intro: `Gäste-WC gewählt, auf dem Foto ist aber ${bath} zu sehen. Es wurde kein Ideenbild erzeugt; der Besucher wurde gebeten, «Badezimmer» zu wählen. Foto und Auswahl liegen bei.`,
      details: leadDetails(`nicht nötig: Gäste-WC gewählt, Foto zeigt ${bath}`, 'nicht erzeugt: Foto zeigt ein Bad, kein Gäste-WC'),
      attachments: [{ filename: photoName, content: photo.data }],
    }, ctx);
    delivered = true;
    return res.status(422).json({
      ok: false, code: 'GUEST_WC_WITH_BATH',
      delivery: { lead: bathDelivery.status, leadProvider: bathDelivery.provider, leadAttachments: bathDelivery.attachments },
      error: `Auf Ihrem Foto sehen wir ${bath}. Das Gäste-WC planen wir ohne Dusche und Badewanne. Bitte wählen Sie in Schritt 1 «Badezimmer» und laden Sie das Foto danach nochmals hoch.`,
    });
  }
  // Diego, 27.09.: Badewanne und Dusche zusammen nur, wenn das Foto schon beide zeigt. Sonst muesste das Modell eine
  // davon dazuerfinden, und wohin, weiss niemand. Wie beim Gaeste-WC sagt es der Badplaner vor dem Bild.
  const wantsBathAndShower = !!shower && shower.id !== 'keine' && !!bathtub && bathtub.id !== 'keine';
  if (wantsBathAndShower && photoWalls && (photoWalls.bathtub === 'none' || photoWalls.shower === 'none')) {
    const seen = bath ? `nur ${bath}` : 'weder eine Badewanne noch eine Dusche';
    console.warn('[badplaner] Badewanne und Dusche gewaehlt, Foto zeigt', seen);
    const bothDelivery = await sendLeadMail({
      subject: preview
        ? `Badplaner-Fehler ohne Kontakt – ${pkg.name} – Wanne und Dusche, Foto zeigt nicht beide`
        : `Badplaner-Lead: ${name} - ${pkg.name} - Wanne und Dusche, Foto zeigt nicht beide`,
      replyTo: email || undefined,
      intro: `Badewanne und Dusche gewählt, auf dem Foto ist aber ${seen} zu sehen. Es wurde kein Ideenbild erzeugt; der Besucher wurde gebeten, nur eines von beiden zu wählen. Foto und Auswahl liegen bei.`,
      details: leadDetails(`nicht nötig: Badewanne und Dusche gewählt, Foto zeigt ${seen}`, 'nicht erzeugt: Badewanne und Dusche gewählt, Foto zeigt nicht beide'),
      attachments: [{ filename: photoName, content: photo.data }],
    }, ctx);
    delivered = true;
    return res.status(422).json({
      ok: false, code: 'BATH_AND_SHOWER_NOT_IN_PHOTO',
      delivery: { lead: bothDelivery.status, leadProvider: bothDelivery.provider, leadAttachments: bothDelivery.attachments },
      error: `Auf Ihrem Foto sehen wir ${seen}. Badewanne und Dusche zusammen planen wir nur, wenn auf dem Foto beide schon zu sehen sind. Bitte wählen Sie in Schritt 2 unter «Dusche / Badewanne» nur die Dusche oder nur die Badewanne und erstellen Sie das Ideenbild danach nochmals.`,
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

  let checkNote = 'ok';
  const wantedFixtures = { room, shower: shower ? shower.id !== 'keine' : false, showerType: shower?.id, bathtub: bathtub ? bathtub.id !== 'keine' : false, cistern, windows, showerWall, showerLongWall,
    bathtubType: bathtub?.id, basin: basin.id, basinType: basinType?.id, mirror: mirror.id };
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
  // Diego, 27.09.: "concentriamoci sul risultato, i costi non sono un problema". Pro Durchgang entstehen zwei Bilder
  // gleichzeitig, gezeigt wird das bessere: ohne groben Fehler vor ungeprueft vor verworfen, dann das mit den wenigsten
  // Hinweisen. Die Wartezeit bleibt etwa die eines Bildes; in der fuenften Probe brauchten 7 von 8 Bildern einen
  // zweiten Durchgang von rund 35 s, und zweimal kam gar kein Bild.
  // ponytail: zwei Bilder pro Durchgang; BADPLANER_CANDIDATES erlaubt 1 bis 4, wenn das Rate-Limit von Gemini mitmacht.
  // Ohne Pruefung gibt es nichts zu waehlen: dann ein Bild.
  const candidates = checkModel() ? Math.min(4, Math.max(1, Math.trunc(Number(env.BADPLANER_CANDIDATES)) || 2)) : 1;
  // Ein schwerer Hinweis wiegt viel, ein leichter wenig, ein anderer Bildausschnitt am wenigsten.
  const score = (result: CheckResult) => result.status === 'rejected' ? 1000 : result.status === 'unavailable' ? 100
    : result.status === 'approved' ? 10 * (result.serious?.length ?? 0) + 2 * (result.hints?.length ?? 0) + (result.note ? 1 : 0) : 0;
  type Attempt = { number: number; gen: { mime: string; data: string }; check: CheckResult };
  const passStarted = dependencies.clock.now();
  let firstGenerationMs = 0;
  const pass = async (passPrompt: string, firstNumber: number, reserveMs?: number) => {
    const results: (Attempt | { number: number; detail: string })[] = [];
    // Ein Bild ohne groben Fehler und ohne Hinweis wird gleich gezeigt, ohne auf das andere zu warten (Gegenpruefung
    // vom 27.09.: sonst wartete der Kunde auf das langsamere Bild, bis zu dessen Zeitgrenze von 65 s).
    let perfect = () => {};
    const early = new Promise<void>((resolve) => { perfect = resolve; });
    const runs = Array.from({ length: candidates }, async (_, index) => {
      const generated = await generateImage(passPrompt, photo, references, ctx, photoRatio, reserveMs);
      if (firstNumber === 1) firstGenerationMs = Math.max(firstGenerationMs, dependencies.clock.now() - passStarted);
      const result: Attempt | { number: number; detail: string } = generated.ok === false ? { number: firstNumber + index, detail: generated.detail }
        : { number: firstNumber + index, gen: generated, check: await checkWithUnavailableRetry(generated) };
      results.push(result);
      if ('check' in result && score(result.check) === 0) perfect();
    });
    await Promise.race([Promise.all(runs), early]);
    const done = [...results].sort((a, b) => a.number - b.number);
    const attempts = done.filter((result): result is Attempt => 'check' in result);
    const failures = done.flatMap((result) => ('detail' in result ? [`Bild ${result.number}: Bilddienst: ${result.detail}`] : []));
    return { attempts, failures };
  };
  const best = (attempts: Attempt[]) => attempts.reduce((chosen, attempt) => (score(attempt.check) < score(chosen.check) ? attempt : chosen));
  // Diego, 25.09.: die Mail nannte nur den Grund des letzten Versuchs, ob es einen zweiten gab, war nicht
  // zu sehen. Jetzt steht jeder abgelehnte Versuch mit seinem Grund in der Mail, oder warum keiner mehr lief.
  const tries: string[] = [];
  const discarded: string[] = [];
  const note = (attempts: Attempt[], failures: string[]) => {
    for (const attempt of attempts) {
      if (attempt.check.status !== 'rejected') continue;
      logRejectedCheck(attempt.check, attempt.number);
      tries.push(`Bild ${attempt.number}: ${attempt.check.reason}`);
      discarded.push(`Bild ${attempt.number} verworfen (${attempt.check.reason})`);
    }
    tries.push(...failures);
    discarded.push(...failures);
  };
  const first = await pass(prompt, 1);
  if (!first.attempts.length) {
    return res.status(502).json(await leadWithoutImage(`Bilddienst: ${first.failures.map((failure) => failure.replace(/^Bild \d+: Bilddienst: /, '')).join(' | ')}`));
  }
  note(first.attempts, first.failures);
  let chosen = best(first.attempts);
  let secondAttempts: Attempt[] = [];
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
  // Ein zweiter Durchgang, wenn alle Bilder einen groben Fehler haben oder das beste einen schweren Hinweis (Diego, 27.09.).
  // Gewaehlt wird danach das beste aller Bilder; hat es nach dem Produktdurchgang noch einen schweren Hinweis, sieht
  // der Kunde es nicht (unten, seit dem 04.10.).
  const seriousFaults = chosen.check.status === 'approved' ? chosen.check.serious ?? [] : [];
  if ((chosen.check.status === 'rejected' || seriousFaults.length) && ctx.budget.remaining() >= secondPassMs) {
    // Der ganze Prompt geht nochmals mit; dazu nur die Gruende, nicht eine zweite Liste aller Regeln.
    const retryPrompt = chosen.check.status === 'rejected'
      ? `${prompt}\nA previous attempt failed the check because ${[...new Set(first.attempts.map((attempt) => (attempt.check as { reason: string }).reason))].join('; another one because ')}. Start again from image 1 and correct exactly that; everything above still applies.`
      : `${prompt}\nA previous attempt was wrong because ${seriousFaults.join('; and because ')}. Start again from image 1 and correct exactly that; everything above still applies.`;
    const second = await pass(retryPrompt, candidates + 1, secondCheckReserveMs);
    if (!second.attempts.length && chosen.check.status === 'rejected') {
      return res.status(502).json(await leadWithoutImage([...discarded, ...second.failures].join(', ').replace(/(Bild \d+): Bilddienst: /g, '$1: '), chosen.gen));
    }
    note(second.attempts, second.failures);
    secondAttempts = second.attempts;
    // Nach groben Fehlern zaehlt der zweite Durchgang (bei lauter verworfenen Bildern bekommt NLD das neueste); nach einem
    // schweren Hinweis das beste aller Bilder (Gegenpruefung des Codes vom 27.09.).
    chosen = chosen.check.status === 'rejected' ? best(second.attempts) : best([...first.attempts, ...second.attempts]);
  } else if (chosen.check.status === 'rejected') tries.push('kein zweiter Durchgang (zu wenig Zeit)');
  let gen: { mime: string; data: string } = chosen.gen;
  let check: CheckResult = chosen.check;
  // Auch die Bilder, die geprueft, aber nicht gezeigt wurden, stehen in der Mail, mit ihren Hinweisen: so sehen wir, wie
  // oft welcher Hinweis vorkommt (Diego, 25.09., Punkt c), und welches Bild der Kunde bekam.
  const notShown = [...first.attempts, ...secondAttempts].filter((attempt) => attempt !== chosen && attempt.check.status !== 'rejected')
    .map((attempt) => `Bild ${attempt.number} nicht gezeigt${attempt.check.status === 'unavailable' ? ' (ungeprüft)'
      : attempt.check.status === 'approved' && attempt.check.hints?.length ? ` (Hinweise: ${attempt.check.hints.join('; ')})` : ''}`);
  const byNumber = (a: string, b: string) => parseInt(a.replace(/^Bild /, ''), 10) - parseInt(b.replace(/^Bild /, ''), 10);
  const others = [...discarded, ...notShown].sort(byNumber);
  // Ein Bild, das der Kunde nicht sehen soll: NLD bekommt Foto, Bild und Grund, der Besucher die Antwort eines verworfenen
  // Bildes mit dem Weg zur Beratung (RENDER_REJECTED). Eine Vorschau ist anonym: NLD kann dort kein Bild nachschicken,
  // Kontaktdaten kommen erst mit einer Beratungsanfrage.
  const withhold = async (note: string, image: { mime: string; data: string }, held: boolean, extra: { filename: string; content: string }[] = []) => {
    const outcome = held ? 'Ideenbild zurückgehalten (schwerer Hinweis)' : 'Ideenbild abgelehnt';
    const leadDelivery = await sendLeadMail({
      subject: preview
        ? `Badplaner-Fehler ohne Kontakt – ${isGuestWc ? 'Gäste-WC' : pkg.name} – ${outcome}`
        : `Badplaner-Lead: ${name} – ${isGuestWc ? 'Gäste-WC' : pkg.name} – ${outcome}`,
      replyTo: email || undefined,
      intro: held
        ? `${preview ? 'Anonymer Badplaner-Versuch ohne Kontaktdaten. ' : ''}Das Ideenbild hat einen schweren Hinweis der Prüfung (siehe Fensterprüfung) und wurde ${preview ? 'nicht angezeigt; ohne Kontaktdaten können wir es nicht nachschicken' : 'dem Kunden weder angezeigt noch geschickt'}. Originalfoto, Auswahl und Bild liegen bei.`
        : preview
          ? 'Anonymer Badplaner-Versuch ohne Kontaktdaten. Das Ideenbild wurde von der Qualitätsprüfung abgelehnt und nicht angezeigt. Originalfoto, Auswahl und verworfenes Bild liegen bei.'
          : 'Das Ideenbild wurde von der Qualitätsprüfung abgelehnt und dem Kunden nicht angezeigt. Originalfoto, Auswahl und verworfenes Bild liegen bei.',
      details: leadDetails(note, held ? 'zurückgehalten (schwerer Hinweis), nicht angezeigt'
        : preview ? RENDER_FAILURE_LABELS.RENDER_REJECTED : 'abgelehnt (Prüfung), nicht angezeigt'),
      // Das Bild geht mit: ohne es können wir nicht beurteilen, ob die
      // Prüfung recht hatte oder ein brauchbares Bild unnötig zurückblieb.
      attachments: [
        { filename: photoName, content: photo.data },
        { filename: held ? `zurueckgehalten.${image.mime === 'image/png' ? 'png' : 'jpg'}` : 'verworfen.jpg', content: image.data },
        ...extra,
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
  };
  // Mit await: sonst laeuft das finally unten vor der Mail, und das IP-Limit wuerde zurueckgedreht.
  if (check.status === 'rejected') return await withhold(`abgelehnt – ${tries.join(' | ')}`, gen, false);
  // Produktdurchgang (Diego, 27.09.: "sistemare una volta per sempre, anche con immagini, il costo non conta"): das
  // gepruefte Bild bleibt, und ein zweiter, kurzer Auftrag ersetzt nur die Produkte nach ihren Vorlagen. Im ersten
  // Durchgang, mit Raum, Platten und allen Produkten zugleich, blieben sie in sechs Proben oft falsch: die Platte wie von
  // Geberit, die Duscharmaturen, der alte Spiegel, Aurelia wie Up+. Auch dieses Bild vergleicht die Pruefung mit dem Foto;
  // faellt es durch oder hat es einen schweren Hinweis mehr, bleibt das erste. BADPLANER_PRODUCT_PASS=0 schaltet ihn ab.
  let productNote = '';
  let productOther: { name: string; image: { mime: string; data: string } } | undefined;
  if (env.BADPLANER_PRODUCT_PASS !== '0' && productReferences.length) {
    if (ctx.budget.remaining() >= Math.round(firstPassMs * 1.15) + DELIVERY_RESERVE_MS) {
      const edited = await generateImage(productPrompt, gen, productReferences, ctx, photoRatio, secondCheckReserveMs);
      if (edited.ok === false) productNote = `Produktdurchgang: Bilddienst: ${edited.detail}`;
      else {
        const editedCheck = await checkWithUnavailableRetry(edited);
        const seriousBefore = check.status === 'approved' ? check.serious?.length ?? 0 : Number.POSITIVE_INFINITY;
        if (editedCheck.status === 'disabled' || (editedCheck.status === 'approved' && (editedCheck.serious?.length ?? 0) <= seriousBefore)) {
          productOther = { name: 'vor-produktdurchgang', image: gen };
          gen = edited;
          check = editedCheck;
          productNote = 'Produktdurchgang ok';
        } else {
          productOther = { name: 'produktdurchgang-nicht-gezeigt', image: edited };
          productNote = editedCheck.status === 'rejected' ? `Produktdurchgang verworfen (${editedCheck.reason})`
            : editedCheck.status === 'unavailable' ? `Produktdurchgang ungeprüft (${editedCheck.detail}), nicht gezeigt`
              : `Produktdurchgang nicht gezeigt (${(editedCheck.status === 'approved' ? editedCheck.serious ?? [] : []).join('; ')})`;
        }
      }
    } else productNote = 'kein Produktdurchgang (zu wenig Zeit)';
    console.info('[badplaner]', productNote);
  }
  // Carla, 27.09.: ein gewaehltes Bild mit schwerem Hinweis hiess in der Mail "ok", obwohl der Hinweis dahinter seinen
  // Fehler nannte (P2, P5: Armaturen an der Rueckwand). Das Etikett urteilt nur nach der Pruefung des Bildes, das der Kunde
  // bekaeme, also nach dem Produktdurchgang (Revision vom 04.10.): war das Bild davor ungeprueft und besteht der
  // Produktdurchgang, heisst es nicht mehr "ungeprüft". Ist das gezeigte Bild selbst ungeprueft, sagt es der Zweig unten.
  const chosenLabel = check.status === 'approved' && check.serious?.length ? 'mit schwerem Hinweis' : 'ok';
  if (check.status === 'approved' && (others.length || chosenLabel !== 'ok')) {
    checkNote = [...others, `Bild ${chosen.number} ${chosenLabel}`].join(', ');
  }
  if (check.status === 'approved' && productNote) checkNote = `${checkNote}, ${productNote}`;
  if (check.status === 'approved' && check.note) {
    checkNote = checkNote + ', Bildausschnitt verändert: ' + check.note;
    console.info('[badplaner] Bildausschnitt verändert, Ideenbild trotzdem geliefert:', check.note);
  }
  // Nur vermerkt, nicht verworfen: ein zweiter Durchgang kostet 30 s und ein zweites Bild.
  for (const hint of check.status === 'approved' ? check.hints ?? [] : []) {
    checkNote = checkNote + ', Hinweis: ' + hint;
    console.info('[badplaner]', hint);
  }
  if (check.status === 'unavailable') {
    checkNote = [`nicht möglich (${check.detail})`, ...(others.length ? [`Bild ${chosen.number} gezeigt`] : []), ...[...tries.filter((entry) => !entry.startsWith('kein ')), ...notShown].sort(byNumber), ...(productNote ? [productNote] : [])].join(' | ');
  }
  if (check.status === 'disabled') checkNote = ['deaktiviert', productNote].filter(Boolean).join(', ');
  if (check.status === 'approved' && check.shower) showerSeen = check.shower;
  console.log('[badplaner] Fensterprüfung:', checkNote);

  // Lead-Mail an NLD (Resend mit Anhängen, sonst Formspree ohne Bilder)
  const imageName = gen.mime === 'image/png' ? 'ideenbild.png' : 'ideenbild.jpg';
  // Das zweite Bild des Produktdurchgangs geht mit, gezeigt oder nicht: so sieht NLD, was er geaendert hat.
  const baseAttachment = productOther ? [{ filename: `${productOther.name}.${productOther.image.mime === 'image/png' ? 'png' : 'jpg'}`, content: productOther.image.data }] : [];
  const details = leadDetails(checkNote);
  // Carla und Diego, 04.10.: in P2 und P5 ging ein Bild mit schwerem Hinweis an den Kunden, weil alle Durchgaenge einen
  // hatten ("Dusche im Bild" mit den Armaturen hinten, die Vorpruefung mit der Stirnwand rechts: dieser Widerspruch ist
  // einer der schweren Hinweise). Es zaehlt die Pruefung des Bildes nach dem Produktdurchgang. Ein ungeprueftes Bild geht
  // wie bisher mit Vermerk hinaus.
  if (check.status === 'approved' && check.serious?.length) {
    console.warn('[badplaner] Ideenbild zurückgehalten, schwerer Hinweis:', check.serious.join('; '));
    return await withhold(checkNote, gen, true, baseAttachment);
  }
  if (preview) {
    // Foto und Bild gehen jetzt an NLD: nur hier liegt das Foto, die Anfrage bringt
    // spaeter nur noch Kontakt und Bild. Scheitert diese Mail, sieht der Besucher sein
    // Bild trotzdem; die Anfrage-Mail traegt das Bild dann nach.
    const draftDelivery = await sendLeadMail({
      subject: `Badplaner-Entwurf ohne Kontakt – ${isGuestWc ? 'Gäste-WC' : pkg.name} (${leadId})`,
      intro: 'Ein Besucher hat im Badplaner ein Ideenbild erstellt und noch keine Kontaktangaben hinterlassen. Kommt die Anfrage, folgt eine Mail "Badplaner-Lead" mit derselben Lead-ID.',
      details,
      attachments: [
        { filename: photoName, content: photo.data },
        { filename: imageName, content: gen.data },
        ...baseAttachment,
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
      ...baseAttachment,
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

  // Newsletter (nur wenn angehakt und RESEND_AUDIENCE_ID gesetzt ist)
  const newsletterDelivery = newsletter ? await subscribeNewsletter(email, name, ctx) : { status: 'skipped' as const };

  // Antwort mit Tageszähler-Cookie
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
    const file = readAttachment(body.file, 'beratung');
    if (typeof file === 'string') return bad(res, file);
    if (imageWanted && !body.file.mime.startsWith('image/')) return bad(res, 'Für ein Ideenbild benötigen wir ein Foto des Raums.');
    fileLabel = file.filename;
    attachments.push(file);
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

async function handleGrundriss(res: any, body: GrundrissBody, ctx: RequestContext) {
  const name = text(body.name, 120);
  const phone = text(body.telefon ?? body.phone, 60);
  const leadId = text(body.leadId, 40);
  const note = text(body.note, 2000);
  const sqm = body.sqm === undefined || body.sqm === null || body.sqm === '' ? '' : String(body.sqm).slice(0, 10);
  if (!name || !phone) return bad(res, 'Bitte Name und Telefonnummer angeben.');
  if (!note && !sqm && !body.file) return bad(res, 'Bitte einen Grundriss, die Grösse oder eine Bemerkung angeben.');

  const attachments: { filename: string; content: string }[] = [];
  if (body.file) {
    const file = readAttachment(body.file, 'grundriss');
    if (typeof file === 'string') return bad(res, file);
    attachments.push(file);
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

/** Foto oder PDF zu Beratung und Grundriss: Groesse, Typ und Signatur. Fehler als Text fuer den Kunden. */
function readAttachment(f: { mime: string; data: string }, baseName: string): { filename: string; content: string } | string {
  if (typeof f.data !== 'string' || f.data.length > MAX_PLAN_BASE64) return 'Die Datei ist zu gross (übertragen max. 3 MB).';
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.mime || '')) return 'Bitte ein Bild (JPEG, PNG, WebP) oder ein PDF hochladen.';
  let content: string;
  try {
    content = normalizeBase64(f.data, MAX_PLAN_BASE64);
    const bytes = Buffer.from(content, 'base64');
    if (f.mime === 'application/pdf') {
      if (bytes.length < 8 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Invalid PDF');
    } else validateImageBytes(bytes, f.mime);
  } catch { return 'Die Datei ist ungültig oder zu gross.'; }
  const ext = f.mime === 'application/pdf' ? 'pdf' : f.mime === 'image/png' ? 'png' : f.mime === 'image/webp' ? 'webp' : 'jpg';
  return { filename: `${baseName}.${ext}`, content };
}

/** Foto aus dem neuen Feld `foto` (data-URL) oder aus dem alten Feld `photo`. */
/** Woher das Foto kam und wie gross es vorher war (Diego, 26.09.: scheitern Fotos aus der Galerie oefter?). Nur fuer NLD. */
function photoOrigin(info: unknown, sent: string): string {
  const i = (info && typeof info === 'object' ? info : {}) as Record<string, unknown>;
  // Ohne String(): ein Objekt als quelle wuerde nach dem bezahlten Bild werfen, und die Tageslimits zaehlten nicht.
  const source = new Map([['kamera', 'Kamera'], ['galerie', 'Galerie'], ['datei', 'Datei']]).get(i.quelle as string) ?? 'Quelle unbekannt';
  const size = (value: unknown) => (Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 50_000_000 ? value as number : 0);
  const [width, height, bytes] = [size(i.breite), size(i.hoehe), size(i.bytes)];
  const original = width && height ? `Original ${width}×${height}${bytes ? ` (${(bytes / 1e6).toFixed(1)} MB)` : ''}, ` : '';
  return `${source}, ${original}gesendet ${sent}`;
}

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
  // Atelier = Treemme Aurelia (Diego, 20.09.; Artikel vom 25.09., Masse aus den 3D-Modellen): Waschtisch RWIT 2CC5 CC 01
  // (Auslauf und Hebel auf zwei Rosetten 75 nebeneinander, 110 auseinander, Auslauf 215 ab Wand; bis zum 26.09. stand hier
  // "uebereinander": das 3D-Modell hat die Hochachse in x, gerendert war es um 90 Grad gedreht. Das Rendering von Treemme
  // und das Foto auf rubinetterie3m.it zeigen beide nebeneinander, Diego 26.09.), Dusche RWIT 2CD9 CC 01 (in einer Reihe:
  // Brauseanschluss mit Halter und Stabhandbrause, daneben zwei Rosetten 75 mit Hebel; mit "drei Rosetten" zeichnete das Modell
  // am 26.09. drei Hebel und den Anschluss dazu, Katalog S. 16), Kopfbrause IT RTBR 376 CC (500 x 200).
  if (pkg === 'atelier') {
    return {
      prompt: `concealed built-in (Unterputz) Treemme Aurelia wall fittings in ${finish.prompt}: at each washbasin exactly two separate small round wall rosettes (about 7.5 cm) side by side above the basin, no wall plate and nothing between them: from the left one a long slim spout, a flat bar with flat sides and never a round tube, runs about 20 cm out from the wall and bends gently down at its end, and the right one carries the only lever: a short cylinder with a flat paddle lever hanging down (not a thin pin); in a shower in one row at the same height: the hose outlet in one small round wall piece that also holds a slim stick hand shower upright on its hose, and beside it exactly two small round wall rosettes of the same size, the mixer and the diverter, each a short cylinder with the same flat paddle lever hanging down (not a thin pin) and never one large plate with both, and above them on the same wall, just below the ceiling, a thin flat rectangular overhead shower plate (about 50 × 20 cm) that sticks straight out from the wall, fixed to it by its short end, with its nozzles facing down`,
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
    // Treemme Up+ (Artikel vom 25.09., Bilder in server/badplaner/up.ts): Waschtisch IT 6B18, der hohe Einhebelmischer
    // mit Stifthebel seitlich oben und langem Rohrauslauf; Dusche IT 6B60, Aufputzmischer mit Steigrohr und runder Kopfbrause.
    // Aufputz (Diego, 20.09.): die Probe von 09:56 zeigte in der Dusche eine Unterputz-Rosette. Darum steht der
    // sichtbare Koerper ausdruecklich da, und am Waschtisch die Standarmatur statt eines Wandauslaufs.
    prompt: 'exposed surface-mounted (Aufputz) Treemme Up+ fittings in polished chrome for the requested fixtures only, all round, slim and plain: at the washbasin a slim cylindrical single-lever mixer with a flat top standing on the countertop or the washbasin, as tall as the basin needs, with a thin pin lever sticking out on its side near the top and just below it a long round tube spout that slopes down away from the body and bends down at its end; in a shower an exposed shower column: a slim round horizontal chrome mixer bar about 25 cm long with a round knob at each end, standing clearly out from the tiles on two short wall connectors, not a flat concealed plate, and from its middle a slim round riser pipe runs straight up the same wall and at the top bends forward into a short arm that holds a large thin round overhead shower, with a slim stick hand shower in a slider on the riser and its hose hanging down to the mixer bar',
    label: seriesText,
  };
}

/* ---------- Prompt ---------- */

/**
 * Die Anweisung an das Bildmodell. Bis zum 23.09. war sie auf rund 2000 Woerter mit
 * rund 80 Verboten gewachsen: jede Regel drei- bis viermal, und jedes Verbot nennt das
 * Ding, das nicht kommen soll ("never a niche"). Google raet fuer Bildbearbeitung zu
 * kurzen Saetzen, die sagen, was sein soll. Darum steht hier jede Regel genau einmal,
 * meist als das, was bleibt; die Regeln selbst sind die bisherigen (siehe Tests).
 */
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
  trayShower?: boolean;
  wantsBathtub: boolean;
  sanitaryPrompt: string;
  basinPrompt: string;
  basinTypePrompt?: string;
  basinIsCeramic: boolean;
  topPrompt: string;
  basePrompt: string;
  mirrorPrompt: string;
  tapPrompt: string;
  tileImageNumber: number;
  floorImageNumber: number;
  accentImageNumber: number;
  topImageNumber: number;
  baseImageNumber: number;
  moduleImageNumber: number;
  wcImageNumber?: number;
  wcShape?: string;
  plateFinish?: string;
  tapsImageNumber?: number;
  showerImageNumber?: number;
  bathImageNumber?: number;
  mirrorImageNumber?: number;
  windows: string;
  cistern: 'aufputz' | 'unterputz';
  layout?: Layout;
  ceiling?: Ceiling;
  showerWall?: EndWall;
  showerLongWall?: EndWall;
  tileIsMosaicSample?: boolean;
  floorIsMosaicSample?: boolean;
}): string {
  const roomName = v.room === 'gaeste-wc' ? 'guest WC' : 'bathroom';
  // Jede Vorlage bekommt einen Satz: was sie ist und was davon zaehlt.
  const samples: string[] = [];
  const sample = (n: number | undefined, text: string) => { if (n) samples.push(`Image ${n} is only ${text}.`); };
  // Viele Muster der Grossformate zeigen beim Lieferanten ein Mosaik derselben Platte (P1 vom 25.09.).
  const mosaic = ' shown as a small mosaic: take only its colour, stone pattern and finish; the tiles themselves are large slabs with fine joints, never a mosaic';
  sample(v.tileImageNumber, v.tileIsMosaicSample ? `a sample of the wall tile material${mosaic}` : 'a close-up sample of the wall tile: take its colour, texture and finish');
  sample(v.floorImageNumber, v.floorIsMosaicSample ? `a sample of the floor tile material${mosaic}` : 'a close-up sample of the floor tile');
  sample(v.accentImageNumber, 'a close-up sample of the accent material');
  if (v.topImageNumber && v.topImageNumber === v.baseImageNumber) {
    sample(v.topImageNumber, 'a colour sample for the whole vanity unit: its front, its body and its countertop');
  } else {
    sample(v.topImageNumber, 'a sample of the countertop material');
    sample(v.baseImageNumber, 'a colour sample for the front and body of the vanity unit');
  }
  sample(v.moduleImageNumber, 'a product photo of the sanitary module');
  sample(v.wcImageNumber, 'a product photo of the new toilet bowl: copy its shape, not its colour');
  sample(v.tapsImageNumber, 'a product photo of the washbasin tap: copy its shape, not its finish');
  sample(v.showerImageNumber, 'a product photo of the shower fittings: copy their shapes, not their finish');
  // Die Aurelia-Wannenplatte hat den Auslauf in der Mitte und zwei Hebel, wie der falsche Waschtisch in P1 vom 26.09.
  sample(v.bathImageNumber, 'a product photo of the bath mixer on a plain background: copy its shape, not its colour, only at the bathtub; its finish is the one named under CHANGE');
  sample(v.mirrorImageNumber, 'a product photo of the new mirror: copy its shape and its light');
  const references = samples.length ? ` ${samples.join(' ')} These images show materials and products, never a room or a layout.` : '';
  const asIn = (n: number) => (n ? ` as in image ${n}` : '');
  // Siebte Probe (P1, P5): die Armaturen kamen an die Rueckwand, die der Kamera gegenueber liegt, wie im Produktbild von
  // vorne. An einer Seitenwand sieht man sie von der Seite; das steht jetzt dabei.
  const endView = v.showerWall === 'back' ? ', facing the camera'
    : v.showerWall ? `, seen from the side and foreshortened, with the overhead shower sticking out from it towards the ${v.showerWall === 'left' ? 'right' : 'left'}` : '';
  // Problem 1 der siebten Probe (P2, P5): an einer Seitenwand setzten beide Bildmodelle die Armaturen trotzdem an die
  // Rueckwand. Darum so beschrieben, wie man es von der Tuer aus sieht (Diego, 27.09.), und neben dem Waschtisch, wenn er dort steht.
  const sideEnd = v.showerWall === 'left' || v.showerWall === 'right';
  const besideBasin = sideEnd && v.layout?.walls.washbasin === v.showerWall ? ', next to the washbasin cabinet' : '';
  const colourOf = (n: number) => (n ? ` in the colour and finish of image ${n}` : '');

  // Fenster und Decke im Wortlaut der Website: mit der kurzen Fassung kam in P4 und P5 vom 25.09.
  // bei "keine Fenster" je ein Fenster dazu, die Website blieb bei denselben Fotos richtig.
  const windowRule =
    v.windows === '0'
      ? 'Image 1 shows NO window and no roof window: the result must not contain any window or glass opening at all, every wall stays a solid wall.'
      : v.windows
        ? `Image 1 shows exactly ${v.windows === '3' ? 'three or more' : v.windows} window(s) including roof windows: the result must show exactly the same window(s) at the same place and size and no additional window, roof window, glass opening or door anywhere; walls that are solid in image 1 stay solid.`
        : 'The number of windows, roof windows and doors must be identical to image 1: never add an opening that is not visible in image 1; walls that are solid in image 1 stay solid.';
  // Diegos Foto vom 19.09.: rechts steht die alte Duschkabine mit satiniertem Glas. In drei von
  // vier Versuchen zeichnete das Modell dort ein Fenster in die rechte Wand.
  const glassRule = ' The glass of an old shower enclosure, a shower door or any frosted or misted pane in image 1 is not a window: behind it stands a solid wall of the room, and the result shows tiled wall there, never a window, a sill or outside light.';
  // Die Decke sagt die Vorpruefung; "also a sloping one" allein hat in P4 eine Dachschraege gebracht.
  const ceilingRule = v.ceiling === 'flat'
    ? 'The ceiling is flat and horizontal exactly as in image 1: no slope, no attic, no beams and no roof window.'
    : v.ceiling === 'sloped'
      ? 'The ceiling slopes exactly as in image 1, at the same angle and height.'
      : 'The ceiling keeps exactly the shape and height it has in image 1: never add a slope, an attic or a roof window.';

  const surfaces = v.floorPrompt
    ? `the walls in ${v.format} cm ${v.tilePrompt} tiles${asIn(v.tileImageNumber)} and the floor in different ${v.floorFormat} cm ${v.floorPrompt} tiles${asIn(v.floorImageNumber)}; ${v.wallPrompt}`
    : `floor and walls in the same ${v.format} cm ${v.tilePrompt} tiles${asIn(v.tileImageNumber)}; ${v.wallPrompt}`;
  const look = v.lookPrompt ? ` overall material mood: ${v.lookPrompt};` : '';
  const accent = v.accentPrompt && v.accentPlacementPrompt
    ? ` Exactly one accent area in a second material: ${v.accentPlacementPrompt}, covered with ${v.accentPrompt}${asIn(v.accentImageNumber)}; every other surface keeps the main material.`
    : '';
  const fixtures = v.room === 'gaeste-wc'
    ? 'this is a guest WC: it has no shower, shower tray, shower controls, bathtub or bath filler'
    : [
        v.wantsShower ? `in the original wet area a ${v.showerPrompt}` : 'no shower and no shower controls',
        v.wantsBathtub ? `a ${v.bathtubPrompt}` : 'no bathtub and no bath filler', // die Wannen nennen ihren Platz selbst
      ].join('; ');
  // Ein Holzsitz auf weisser Keramik war einer der Befunde vom 16.09.
  const seat = `${v.wcImageNumber ? `the new toilet of image ${v.wcImageNumber} with ${v.wcShape}, never shaped like the old one, ` : ''}wall-hung and rimless in ${v.sanitaryPrompt}, with seat and lid in the same ${v.sanitaryPrompt}, not wood`;
  // Die Wahl des Kunden entscheidet (Diego, 26.09.): Aufputz heisst Modul. Bis dahin galt das Foto ("nur eine Platte,
  // dann kein Modul"); das Modell las die Bedingung falsch und stellte in P3 trotzdem ein Modul.
  const toilet = v.cistern === 'aufputz'
    ? `the old surface-mounted cistern with its casing, or the old flush plate, is removed completely; behind the toilet, in front of the wall or low wall it hangs on, stands the sanitary module of image ${v.moduleImageNumber}: ${QR_MODULE}; no flush plate, never sunk into the wall, not tiled or boxed in; the toilet is ${seat}, and hangs on the module at exactly the old toilet position; the wall behind stays where it is`
    // Diegos Befund vom 17.09.: das WC haengt an einem Muretto, das den Spuelkasten traegt;
    // das Modell hatte es eingeebnet. Am 19.09. baute es umgekehrt eines vor eine flache Wand.
    : `the cistern stays hidden in the wall where it is, and no sanitary module is added. A toilet on a flat full-height wall stays on that flat wall, which is only newly tiled. A toilet that hangs on a low wall or boxed pre-wall in image 1 stays on its front, and that low wall stays with the same place, length, height and depth, only newly tiled; the toilet is not pushed back to the wall behind. The toilet is ${seat}, at its existing position, and its old flush plate is replaced, at the same place on the wall, by a new ${BLINK_PLATE.replace('a flat rectangular plate', `flat rectangular flush plate in ${v.plateFinish}`)}`;
  // Die gewaehlte Sanitaerkeramik gilt fuer WC und Waschbecken. Ohne das hier
  // blieb das Becken weiss, waehrend das WC farbig war: zwei Farben in einem Bad.
  const basinColour = v.basinIsCeramic ? `, the basin in the same ${v.sanitaryPrompt} as the toilet` : '';
  const vanity = `if a washbasin is visible in image 1, ${v.basinPrompt} at its existing place on a wall-hung vanity: front and body in ${v.basePrompt}${colourOf(v.baseImageNumber)}, countertop in ${v.topPrompt}${colourOf(v.topImageNumber)}${v.basinTypePrompt ? `, ${v.basinTypePrompt}` : ''}${basinColour}, and above the vanity a ${v.mirrorPrompt}${asIn(v.mirrorImageNumber ?? 0)}; this mirror replaces the old mirror or mirror cabinet and its lamp completely: nothing of their shape, frame or light is kept, and no lamp or light bar above the mirror; the countertop is its own material, not cut from the wall or floor tiles`;

  return [
    // Am 19.09. zeichnete das Modell aus Diegos engem Bad ein Ausstellungsbad: darum steht zuerst, was das
    // Ergebnis IST (dasselbe Foto), dann der Grundriss des Fotos. Einleitung, Bewahren und Positionen stehen im
    // Wortlaut der Website: mit der gekuerzten Fassung zeichnete das Modell am 25.09. P2 und P5 aus einer anderen
    // Kamera ohne die Tuer vorne, stellte in P3 das WC an die andere Wand und in P1 den Waschtisch.
    `PHOTO EDITING TASK, not a design task. Image 1 is a photograph of the customer's existing ${roomName}. The result is that same photograph after the renovation: the same picture from the same spot, with the same lens, the same crop and the same edges, in which only the surfaces and products named under CHANGE have been replaced, each one in its own place. Someone who knows this ${roomName} must recognise it at first glance. Do not design a new ${roomName} and do not show a showroom.${references}`,
    v.layout ? layoutPrompt(v.layout) : '',
    `This is an edit of image 1, not a new picture. Keep image 1 and change only what the CHANGE list names. Everything else stays exactly as it is: the camera position, angle, lens and framing, the same crop and the same aspect ratio, the walls and where they stand, with every niche, ledge, projection and step they have in image 1 and no others, the ceiling and the room height, the room proportions, every window, roof window and door at its exact size and position, and a radiator only where image 1 has one. ${ceilingRule} Never zoom out, never widen the view, never show floor, wall or ceiling beyond the edges of image 1, never create extra floor area. Whatever is built in the immediate foreground at the edge of image 1 belongs to the picture and stays: an open door leaf, a door frame, the edge of a wall. It keeps its place and takes up the same part of the picture as before, and is never removed to show more of the room. A loose piece of furniture at the edge is removed like all loose furniture: the floor and the walls behind it continue, and the camera stays exactly where it is. Every window keeps the same share of the picture it has in image 1; do not move closer to it and do not make it larger. ${windowRule}${glassRule}`,
    `KEEP THE POSITIONS. A half-height wall, a low built wall or a boxed pre-wall that a fixture stands against is part of the room, not furniture: it keeps its place, its length, its height and its depth, and the fixture stays mounted on it. Every fixture keeps the wall or low wall it stands against in image 1 and its place along it, measured against the corners, the door and the window next to it. The toilet keeps its wall and its place because its drain cannot be moved${v.ceiling === 'sloped' ? ': under the sloping ceiling it stays under that sloping ceiling and is never moved to a straight or rear wall to gain headroom' : ''}. The washbasin keeps its wall and its place. ${v.layout?.walls.bathtub === 'none' ? 'An old shower tray, its kerb or platform is removed down to the floor.' : "A bathtub that becomes a shower uses only the bathtub's own footprint, on the same wall and in the same direction as the bathtub; the bathtub and any raised base under it are removed down to the floor. So is an old shower tray, its kerb or platform."}${v.showerWall && sideEnd ? ` The short end wall of the shower is the ${v.showerWall} wall seen from the camera. Seen from the door, the mixer, the overhead shower and the hand shower are on this ${v.showerWall} wall${besideBasin}${endView}${v.trayShower ? '' : ', and the channel drain lies along its foot'}. The ${v.showerLongWall ?? 'back'} wall of the shower stays empty: only tiles, no mixer, no hand shower and no shower head.` : v.showerWall ? ` The short end wall of the shower is the ${v.showerWall} wall seen from the camera: the mixer, the overhead shower and the hand shower sit on it${endView}${v.trayShower ? '' : ', and the channel drain lies along its foot'}; ${v.showerLongWall ? `its long side runs along the ${v.showerLongWall} wall, which carries` : v.showerWall === 'back' ? 'the side walls of the shower carry' : 'the back wall of the shower carries'} no fitting, only tiles.` : ''} NO NEW WALLS: never add a wall, a partition, a half-height wall, a boxed pre-wall, a ledge, a shelf or a niche that image 1 does not show, not behind the toilet, not behind the washbasin and not in the shower. Where image 1 shows one flat wall, the result shows that same flat wall with new tiles: it never steps forward and never gets a flat top at mid-height. NOTHING IS FILLED IN EITHER: every recess, alcove, niche, wall offset, corner step and wall projection that image 1 shows stays exactly where it is, with the same width, depth and height, above all in the shower area. A shower or bathtub that stands in a recess or alcove stays inside it, and the new tiles follow the wall into the recess and around its corners. Never fill a recess, never close an alcove, never tile a niche over flush and never straighten a stepped wall into one flat wall. Only surfaces, sanitary fixtures, taps, furniture and lights change.`,
    `CHANGE this, and only this, in this ${roomName} (style "${v.packageName}"):${look} ${surfaces}; ${fixtures}; if a toilet is visible in image 1, ${toilet}; ${vanity}; ${v.tapPrompt}.${accent}`,
    // P7 vom 26.09.: der alte Spiegel blieb, darum steht er auch hier.
    `REMOVE: the bidet, if image 1 has one: its place is finished like the rest of the room, with nothing standing there;${v.mirrorImageNumber ? ' the old mirror or mirror cabinet with its lamp;' : ''} the old shower curtain and its rail; the old shower fittings and their slide rail; towels, bottles, rugs and loose furniture, also a cabinet or shelf cut off at the edge of the picture. The vanity unit is not loose furniture and stays, even when cut off at the edge of the picture.${v.wantsShower ? ' All shower fittings sit together on one wall inside the shower area, never next to the toilet or the washbasin.' : ''}`,
    // Tageslicht in einem Raum ohne Fenster verlangt nach einem Fenster (P4 und P5 vom 25.09.).
    `Photorealistic, ${v.windows === '0' ? 'bright, even light' : 'natural daylight'}, no people, no text.`,
    // P1 vom 26.09.: ein Heizkoerper, den das Foto nicht hat.
    `BEFORE YOU DRAW, compare with image 1: the same viewpoint and framing, the same walls and ceiling, ${v.windows === '0' ? 'no window at all' : 'the same windows'}, the same door and, at the edge of the picture, the same door leaf or frame in the foreground if image 1 has one, every fixture where image 1 has it, every recess, alcove and step of the walls that image 1 has, and no low wall, ledge, shelf, niche or radiator that image 1 does not have. A small, tight room stays small and tight: never show more of the room than image 1 shows.`,
  ].filter(Boolean).join('\n');
}

// Die Platte OLI Blink und das Modul OLI QR, wie in ihren Bildern, fuer beide Durchgaenge. Gegenpruefung vom 27.09.:
// "nie ein grosser und ein kleiner Knopf" beschrieb gerade die Platte von Geberit aus Diegos Ausschnitt; "panel" las das
// Modell als duenne Scheibe (P3 der sechsten Probe: 2 cm), und der Knopf des OLI QR ist eine liegende Pille mit + und -.
const BLINK_PLATE = 'a flat rectangular plate, wider than high, with two equal round solid metal knobs about 3 cm across that stand slightly out of it side by side at mid-height, the gap between them a little wider than one knob, a small plus just below the left one and a small minus just below the right one, and nothing else on the plate';
const QR_MODULE = 'a factory-made box about 50 cm wide, 115 cm high and 11 cm deep, standing on the floor with its back against that wall, so that its opaque white glass front in two parts stands 11 cm in front of it and its brushed steel side, 11 cm wide, is clearly visible; near the top of the upper glass a small horizontal pill-shaped steel push button with a plus and a minus';

/**
 * Der Auftrag des Produktdurchgangs (Diego, 27.09.): Bild 1 ist das gepruefte Ideenbild, dahinter je ein Produktbild mit
 * seinem Satz. Kurz, denn Raum, Platten und Positionen hat der erste Durchgang schon; hier zaehlen nur die Produkte.
 */
function buildProductPrompt(room: 'badezimmer' | 'gaeste-wc', items: string[], colour = ''): string {
  const roomName = room === 'gaeste-wc' ? 'guest WC' : 'bathroom';
  // Gegenpruefung vom 27.09.: "bleibt, wo es ist" hiess auch "das alte bleibt" (Spiegel P7, WC P3) und liess das Modul
  // so flach wie im ersten Bild. Jetzt ersetzt jedes Produkt, was an seinem Platz steht, in Form, Tiefe und Hoehe seines Bildes.
  return [
    `PRODUCT EDIT of image 1, not a new picture. Image 1 is a finished photo of a renovated ${roomName}. The result is image 1 again, with the same camera, crop, aspect ratio and edges, the same walls, tiles and joints, floor, ceiling, windows, doors, glass, furniture, light and shadows. Only the products listed below are redrawn, each one exactly like the product in its image: the same shape and the same number and kind of parts, but in the colour and finish named here, not in those of its image. Each product keeps its wall and its place along that wall in image 1 and replaces whatever stands there, also an old or wrong model; its shape, parts, size, depth and height are those of its image and of its text, even where image 1 shows them differently. A product that image 1 does not show at all is not added. Images 2 to ${items.length + 1} show only products: take nothing from their background, no wall, tile or floor.`,
    ...items,
    colour,
    'Everything else stays exactly as it is in image 1. Photorealistic, no people, no text.',
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
  // Das Ideenbild ist das Produkt: es soll das Bad des Kunden zeigen, nicht irgendein schoenes Bad. Darum das genaueste
  // Modell; 2K kostet bei ihm gleich viel wie 1K. Flash (b3dc622) lag im Pruefstand vorne, nach dem Urteil der Pruefung;
  // in der Probe auf der Vorschau vom 27.09. fand Diego mit Flash 1 von 5 Bildern zeigbar und die Armaturen in 0 von 3
  // richtig (mit Pro, 8118807, 2 von 3). Darum wieder Pro; Flash bleibt ueber BADPLANER_MODEL waehlbar.
  const model = env.BADPLANER_MODEL || 'gemini-3-pro-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  // Ohne Nummer vor jedem Bild, wie auf der Website (27.09.): mit ihr (b32f7a2) brauchten in der fuenften Probe 7 von 8
  // Bildern einen zweiten Versuch, vorher 3 von 8. Ob sie die Ursache war, ist offen; belegt war ihr Nutzen nie.
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

/** Pruefmodell fuer Foto und Ideenbild; BADPLANER_CHECK_MODEL leer = Pruefungen bewusst aus. */
const checkModel = (): string => (env.BADPLANER_CHECK_MODEL ?? 'gemini-3.6-flash').trim();
// Problem 1 der siebten Probe (27.09.): die quere Wanne in P2 las gemini-3.6-flash in 10 von 10 Laeufen als laengs an der
// linken Wand, gemini-3.1-pro-preview in 5 von 5 richtig. Nur fuer die Vorpruefung, einmal pro Anfrage; jedes Bild prueft
// weiter das Pruefmodell. Ohne Pruefmodell ist auch die Vorpruefung aus.
const photoCheckModel = (): string => (checkModel() ? (env.BADPLANER_PHOTO_CHECK_MODEL ?? 'gemini-3.1-pro-preview').trim() : '');

/**
 * Eine Frage mit Bildern an das Pruefmodell, Antwort als JSON. Liefert die gelesene
 * Antwort oder den Grund, warum keine kam; der Grund steht so in der Lead-Mail.
 */
async function askCheckModel(model: string, question: string, images: Photo[], timeoutMs: number, ctx: RequestContext, thinking: 'low' | 'high' = 'low'): Promise<{ answer: any } | { detail: string }> {
  try {
    const r = await request(ctx, `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY || '', 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: question }, ...images.map((image) => ({ inlineData: { mimeType: image.mime, data: image.data } }))] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', ...checkThinking(model, thinking) },
      }),
    }, Math.min(timeoutMs, Math.max(0, ctx.budget.remaining() - DELIVERY_RESERVE_MS)));
    if (!r.ok) return { detail: `HTTP ${r.status}` };
    const candidate = r.json?.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') return { detail: `Abbruch: ${candidate?.finishReason || 'unbekannt'}` };
    return { answer: JSON.parse(candidate.content?.parts?.map((p: any) => p.text || '').join('') || '') };
  } catch (err: any) {
    return { detail: err && (err.name === 'AbortError' || err.name === 'TimeoutError') ? 'Timeout' : String(err?.message || err).slice(0, 120) };
  }
}

/**
 * Fragt ein Gemini-Textmodell, ob das Ideenbild eine Öffnung (Fenster, Dachfenster,
 * Tür, Glasfläche) enthält, die im Foto nicht da ist. Nicht verfügbare oder
 * unlesbare Prüfungen werden vom Aufrufer separat behandelt.
 * Prüft zusätzlich, dass Kamera, Bildausschnitt und sichtbare Raumgrenzen erhalten bleiben.
 */
async function checkOpenings(
  photo: Photo,
  gen: { mime: string; data: string },
  wanted: { room: 'badezimmer' | 'gaeste-wc'; shower: boolean; bathtub: boolean; cistern: 'aufputz' | 'unterputz'; windows: string; showerWall?: EndWall; showerLongWall?: EndWall; showerType?: string;
    bathtubType?: string; basin?: string; basinType?: string; mirror?: string },
  ctx: RequestContext,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<CheckResult> {
  const model = checkModel();
  if (!model) return { status: 'disabled' };
  const tray = wanted.shower && wanted.showerType === 'duschwanne';
  const walkIn = wanted.shower && !tray;
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
    'Set point_drain true only if the shower in image 2 has a round or square point drain or grate in its floor, rather than a long narrow channel drain along one wall; false when there is no shower or no drain is visible. ' +
    // P2, P3 und P5 vom 25.09.: erhoehte Duschwanne, obwohl bodeneben verlangt war. Eine flache Wanne im Boden ist keine Stufe (26.09.).
    // Diego, 04.10.: die Gefaelledusche (Walk-in) liegt ganz eben; bei der Duschwanne ist ein Rand von 2 bis 3 cm normal.
    (tray
      ? 'Set shower_step true only if the shower tray in image 2 stands on a step, kerb, plinth or platform, or rises clearly higher above the bathroom floor than the thin edge of a normal shower tray; that edge, about 2 to 3 cm, may show as a narrow side face and is not raised, and neither is a tray level with the floor tiles; false when there is no shower. '
      : 'Set shower_step true if the floor of the shower in image 2 stands higher than the bathroom floor around it: a raised shower tray with a visible side face or step, a kerb or a platform; a shower tray level with the floor tiles is not raised, even though its outline shows; false when it is flush with the floor or there is no shower. ') +
    // P1 vom 26.09.: Walk-in gewaehlt, eine Wanne gezeichnet; P3: Wanne gewaehlt, ein gefliester Boden.
    // Am Aussehen, nicht an Fugen: grosse Platten (Atelier 120 x 278) haben im Walk-in kaum Fugen.
    'Set shower_floor_after to what the floor inside the shower of image 2 is: "tray" for a shower tray, raised or level with the floor: a separate smooth plate that looks different from the floor around it and has an outline of its own; "tiles" when the tiles or slabs of the room floor, or other tiles, run on across the shower floor; "none" when there is no shower or you cannot see its floor. ' +
    // Rinne an der Laengsseite sah die Pruefung am 20.09. nur 1 von 5 Mal: sie beschreibt jetzt die Waende, der Code entscheidet.
    // Laenger oder breiter liest das Pruefmodell im Bild unzuverlaessig (P2 und P5 vom 25.09.): es sagt nur die Waende.
    'For the shower in image 2, look at its floor: set drain_wall to the wall, seen from the camera, at whose foot its channel drain lies ("left", "right", "back", "front", or "none" when there is no channel drain or you cannot see it; a small round drain is not a channel drain). ' +
    // Siebte Probe: in P8 zwei Saetze Armaturen an zwei Waenden, und die Frage "an zwei Waenden?" blieb false. Eine Liste
    // der Waende sagt beides: ob sie verteilt sind und an welcher Wand sie stehen.
    'Then set shower_fittings_walls to the list of walls, seen from the camera, on which any shower fitting of image 2 is mounted: a mixer lever or knob, a rosette or small wall plate, a hand shower, its holder or hose outlet, or the wall arm of the overhead shower; each wall at most once, for example ["left"] or ["back","left"]; [] when there is no shower or you cannot see its fittings. ' +
    'Then say whether something large stands in the immediate foreground of image 1 at the edge of the picture, cut off by the border — an open door leaf, a door frame or the near edge of a wall; loose furniture does not count, it is meant to be removed — taking up roughly a fifth of the picture or more; and whether that same object is still visible at the edge of image 2 at any size, even as a narrow strip (foreground_object_after is false only when it is gone completely). ' +
    'Set window_much_bigger true only if a window that is visible in both images takes up a clearly larger part of image 2 than of image 1, about half again as large or more. ' +
    // Diego, 04.10.: "la porta non è importante anche se scompare; importanti sono le finestre".
    'Set extra_openings true only if image 2 has a window, roof window, door or outside opening that image 1 does not have, or lost one that image 1 has; a window that now stands on a different wall than in image 1 counts as lost and added; a door of image 1 that is gone in image 2 does not count. ' +
    // P4 und P5 vom 25.09.: bei "keine Fenster" kam einmal ein Dachfenster, einmal ein Fenster links dazu,
    // und extra_openings blieb false. Gezaehlt wird zuverlaessiger als verglichen.
    'Count the windows in each image, roof windows and skylights included; a glass shower panel, a glass door, a mirror or a picture is not a window. Set windows_before and windows_after to those two numbers. ' +
    'Set ceiling_changed true if the ceiling of image 2 has another shape than the ceiling of image 1: a slope, an attic, beams or a roof window that image 1 does not have, or a slope of image 1 that is gone. ' +
    'Set view_changed true if camera position, angle, lens or framing changed, or if image 2 shows floor, wall or ceiling area that lies outside image 1. ' +
    // Diego, 25.09. (Punkt c): die Wahl des Kunden wird nur abgelesen, ein Unterschied steht als Hinweis in der Mail,
    // nie als Ablehnung, damit wir sehen, wie oft es vorkommt. Proben vom 25.09.: Einbau- statt freistehender Wanne,
    // Kopfbrause ohne Dusche, ein Becken statt zwei, Aufsatz- statt Einbaubecken, der alte Spiegel.
    'For image 2 only: set washbasins_after to the number of washbasin bowls you can see (0 when none is visible); ' +
    'set basin_on_top_after true if the washbasin is a separate bowl standing on the countertop, false if it is set into the countertop or moulded into it; ' +
    'set mirror_after to what hangs above the washbasin: "cabinet" for a mirror cabinet with mirror doors, "mirror" for a flat mirror without a cabinet, "none" when there is none or you cannot see it; ' +
    'set mirror_kept true if that mirror or mirror cabinet is still the one of image 1, with the same shape, frame and lamp; ' +
    'set toilet_kept true if the toilet of image 2 is still the old toilet of image 1, with the same shape, not a new model; ' +
    'set bathtub_after to "freestanding" if the bathtub stands free on the floor with its own finished shell all round, "built_in" if it is built in against the walls with a tiled or panelled front, "none" when there is no bathtub; ' +
    'set overhead_shower_after true if there is an overhead or rain shower head anywhere; a hand shower on a hose does not count. ' +
    'Answer with JSON only, no markdown and exactly these keys: ' +
    '{"before":{"toilet":"left","washbasin":"left","shower":"none","bathtub":"none","bidet":"none"},' +
    '"after":{"toilet":"left","washbasin":"left","shower":"none","bathtub":"none","bidet":"none"},' +
    '"order_before":["washbasin","toilet"],"order_after":["washbasin","toilet"],' +
    '"nearest_before":"toilet","nearest_after":"toilet",' +
    '"toilet_on_low_wall_before":false,"toilet_on_low_wall_after":false,"new_wall_element":false,"wall_element_lost":false,' +
    '"foreground_object_before":false,"foreground_object_after":false,"window_much_bigger":false,"point_drain":false,"drain_wall":"none","shower_fittings_walls":[],' +
    '"shower_step":false,"shower_floor_after":"none","windows_before":0,"windows_after":0,"ceiling_changed":false,' +
    '"washbasins_after":0,"basin_on_top_after":false,"mirror_after":"none","mirror_kept":false,"toilet_kept":false,"bathtub_after":"none","overhead_shower_after":false,' +
    '"extra_openings":false,"view_changed":false,"reason":"short English note, max 25 words"}';
  const reply = await askCheckModel(model, question, [photo, gen], timeoutMs, ctx);
  if ('detail' in reply) {
    console.error('[badplaner] Fensterprüfung nicht möglich', reply.detail);
    return { status: 'unavailable', detail: reply.detail };
  }
  const parsed = reply.answer;
  const keys = ['before', 'after', 'order_before', 'order_after', 'nearest_before', 'nearest_after',
    'toilet_on_low_wall_before', 'toilet_on_low_wall_after', 'new_wall_element', 'wall_element_lost', 'foreground_object_before', 'foreground_object_after',
    'window_much_bigger', 'point_drain', 'drain_wall', 'shower_fittings_walls',
    'shower_step', 'shower_floor_after', 'windows_before', 'windows_after', 'ceiling_changed', 'extra_openings', 'view_changed', 'reason',
    'washbasins_after', 'basin_on_top_after', 'mirror_after', 'mirror_kept', 'toilet_kept', 'bathtub_after', 'overhead_shower_after'];
  // Die spaeter dazugekommenen Antworten sind freiwillig; fehlt eine, wird sie nicht geprueft.
  const optionalFlag = (key: string) => parsed?.[key] === undefined || typeof parsed[key] === 'boolean';
  const optionalWall = (key: string) => parsed?.[key] === undefined || WALLS.includes(parsed[key]);
  const optionalCount = (key: string) => parsed?.[key] === undefined || (Number.isInteger(parsed[key]) && parsed[key] >= 0 && parsed[key] <= 20);
  const optionalWalls = (key: string) => parsed?.[key] === undefined || (Array.isArray(parsed[key]) && parsed[key].length <= 4
    && new Set(parsed[key]).size === parsed[key].length && parsed[key].every((wall: unknown) => WALLS.includes(wall as Wall) && wall !== 'none'));
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
    || typeof parsed.window_much_bigger !== 'boolean'
    || !optionalWall('drain_wall') || !optionalWalls('shower_fittings_walls')
    || !optionalFlag('shower_step') || !optionalFlag('ceiling_changed') || !optionalCount('windows_before') || !optionalCount('windows_after')
    || typeof parsed.extra_openings !== 'boolean' || typeof parsed.view_changed !== 'boolean'
    || typeof parsed.reason !== 'string' || !parsed.reason.trim() || parsed.reason.length > 200
    || Object.keys(parsed).some((key) => !keys.includes(key))) return { status: 'unavailable', detail: 'Antwort unlesbar' };
  const wallAnswers = Object.fromEntries(['toilet_on_low_wall_before', 'toilet_on_low_wall_after', 'new_wall_element', 'wall_element_lost',
    'foreground_object_before', 'foreground_object_after', 'window_much_bigger'].map((key) => [key, parsed[key] as boolean]));
  const flags: CheckFlags = { extra_openings: parsed.extra_openings, view_changed: parsed.view_changed, before, after, orderBefore, orderAfter, nearestBefore, nearestAfter, wallAnswers };
  // Verworfen wird, was den Raum falsch zeigt: eine Oeffnung mehr oder weniger, mehr Fenster als
  // der Kunde angegeben hat, eine andere Decke, ein Sanitaerstueck an einer anderen Wand oder an
  // einem anderen Platz in der Reihe, Dusche oder Wanne nicht wie bestellt, das Bidet noch da.
  if (flags.extra_openings) return { status: 'rejected', reason: `an opening was added or lost (${parsed.reason.slice(0, 120)})`, flags };
  // Erlaubt ist die groessere Zahl: die des Kunden ("3" heisst drei oder mehr) oder die im Foto gezaehlte.
  // Zaehlt das Pruefmodell einen Spiegel als Fenster, dann in beiden Bildern, und das Bild bleibt.
  const counts = [/^[0-3]$/.test(wanted.windows) ? Number(wanted.windows) : undefined, parsed.windows_before].filter((n): n is number => typeof n === 'number');
  // "3 oder mehr" ohne Zahl aus dem Foto: keine Obergrenze.
  const allowedWindows = wanted.windows === '3' && typeof parsed.windows_before !== 'number' ? undefined : counts.length ? Math.max(...counts) : undefined;
  if (typeof parsed.windows_after === 'number' && allowedWindows !== undefined && parsed.windows_after > allowedWindows) {
    return { status: 'rejected', reason: `a window was added: the result shows ${parsed.windows_after} window(s) including roof windows, the photo ${allowedWindows === 0 ? 'none' : allowedWindows}`, flags };
  }
  if (parsed.ceiling_changed === true) return { status: 'rejected', reason: 'the ceiling changed its shape: a slope, attic, beams or roof window that the photo does not have, or a slope that is gone', flags };
  const fault = compareInventory(before, after, wanted) || compareOrder(orderBefore, orderAfter);
  if (fault) return { status: 'rejected', reason: fault, flags };
  // Alles Feinere geht als Hinweis in die Lead-Mail: diese Antworten irren oefter, und ein
  // Ideenbild mit einem kleinen Fehler hilft dem Kunden mehr als gar keines (Diego, 25.09.).
  const hints = [
    compareDepth(after, nearestBefore, nearestAfter),
    parsed.toilet_on_low_wall_before && !parsed.toilet_on_low_wall_after && 'the low wall the toilet stood against is gone',
    parsed.new_wall_element && 'a low wall, ledge, shelf or niche that is not in the photo was added',
    // Beim Aufputz-Spuelkasten zaehlt das Glasmodul nicht: die Pruefung liest es manchmal als Vorwand. Ein eigener Satz, weil
    // in P4 der sechsten Probe "Muretto dazu" in der Mail stand und im Bild nichts war: so sehen wir, welche Antwort irrte.
    !parsed.new_wall_element && wanted.cistern === 'unterputz' && !parsed.toilet_on_low_wall_before && parsed.toilet_on_low_wall_after
      && 'the toilet now stands against a low wall or boxed pre-wall that is not in the photo',
    parsed.wall_element_lost && 'a recess, alcove, niche or step of the wall that is in the photo was filled in or straightened',
    parsed.window_much_bigger && 'the window takes up much more of the result than of the photo',
    // Die Wahl des Kunden (Punkt c): ein unlesbarer Wert zaehlt nicht, die Pruefung bleibt trotzdem gueltig.
    wanted.basin && Number.isInteger(parsed.washbasins_after) && parsed.washbasins_after > 0
      && parsed.washbasins_after !== (wanted.basin === 'doppel' ? 2 : 1)
      && `${parsed.washbasins_after} washbasin bowl(s), but a ${wanted.basin === 'doppel' ? 'double' : 'single'} washbasin was chosen`,
    wanted.basinType && after.washbasin !== 'none' && typeof parsed.basin_on_top_after === 'boolean'
      && parsed.basin_on_top_after !== (wanted.basinType === 'aufsatz')
      && (parsed.basin_on_top_after ? 'the washbasin is a bowl standing on the countertop, but a basin set into the top was chosen'
        : 'the washbasin is set into the countertop, but a bowl standing on it was chosen'),
    wanted.mirror === 'spiegelschrank' && parsed.mirror_after === 'mirror' && 'a flat mirror hangs above the washbasin, but a mirror cabinet was chosen',
    wanted.mirror === 'spiegel' && parsed.mirror_after === 'cabinet' && 'a mirror cabinet hangs above the washbasin, but a flat mirror was chosen',
  ].filter((hint): hint is string => !!hint);
  // Schwere Hinweise (Diego, 27.09.): sie sieht der Kunde sofort. Hat das beste Bild einen davon, laufen zwei Bilder mehr,
  // und gewaehlt wird das beste aller Bilder; hat auch das einen, sieht der Kunde keines (04.10.). In der sechsten Probe P1 (Walk-in erhoeht),
  // P7 (alter Spiegel), in der fuenften P3 (altes WC).
  const serious = [
    parsed.mirror_kept === true && 'the mirror above the washbasin is still the old one of the photo',
    parsed.toilet_kept === true && 'the toilet is still the old one of the photo',
    wanted.bathtubType === 'freistehend' && parsed.bathtub_after === 'built_in' && 'the bathtub is built in, but a freestanding bathtub was chosen',
    wanted.bathtubType === 'einbau' && parsed.bathtub_after === 'freestanding' && 'the bathtub stands free, but a built-in bathtub was chosen',
    !wanted.shower && parsed.overhead_shower_after === true && 'there is an overhead shower, but no shower was chosen',
  ].filter((hint): hint is string => !!hint);
  // Der Walk-in bodeneben, die Duschwanne ohne Stufe oder Podest darunter (Diego, 04.10.), alle Armaturen an der
  // Stirnwand; beim Walk-in die Rinne an ihrem Fuss, die Duschwanne hat ihren eigenen Ablauf (Diego, 26.09.).
  // Welche Wand die Stirnwand ist, sagt die Vorpruefung im Foto; ohne sie
  // gehoert die Rinne an den Fuss der Armaturenwand. Seit dem 26.09. nur ein Hinweis (Diego, Entscheidung A): der
  // zweite Versuch hatte 0 von 6 Duschen gerichtet und kostet je rund CHF 0.12 und 35 s.
  const drainWall: Wall | undefined = parsed.drain_wall;
  const fittingsWalls: Wall[] | undefined = parsed.shower_fittings_walls;
  const seen = (wall?: Wall): wall is Wall => !!wall && wall !== 'none';
  const endWall = wanted.showerWall;
  // Ein unbekannter Wert zaehlt nicht, wie bei der Wahl des Kunden; ein Objekt warf sonst im Log nach dem bezahlten Bild.
  const showerFloor = ['tray', 'tiles', 'none'].includes(parsed.shower_floor_after) ? parsed.shower_floor_after as string : undefined;
  // Fuer die Mail an NLD, wie die Vorpruefung: was die Pruefung an der Dusche sah.
  const showerSeen = wanted.shower
    ? `Armaturen: ${fittingsWalls?.length ? fittingsWalls.map(wallDe).join(', ') : '–'}; Rinne: ${wallDe(drainWall)}; Boden: ${showerFloor === 'tray' ? 'Wanne' : showerFloor === 'tiles' ? 'Platten' : '–'}; Stufe: ${parsed.shower_step === true ? 'ja' : parsed.shower_step === false ? 'nein' : '–'}`
    : undefined;
  if (showerSeen) console.info('[badplaner] Dusche:', `${tray ? 'Duschwanne' : 'Walk-in'}, ${showerSeen}, Stirnwand laut Foto ${endWall ?? '-'}`);
  serious.push(...[
    wanted.shower && parsed.shower_step === true && (tray ? 'the shower tray stands on a step, kerb or platform; it must sit directly on the floor, with no more than its own low edge'
      : 'the shower floor is raised above the bathroom floor; it must be flush with the floor, with no step, kerb or tray edge'),
    walkIn && showerFloor === 'tray' && 'the shower has a shower tray, but a walk-in shower with the floor tiles continuing into it was chosen',
    tray && showerFloor === 'tiles' && 'the shower floor is tiled, but a shower with a shower tray was chosen',
    tray && seen(drainWall) && 'the shower has a channel drain; the shower tray needs its own small round drain',
    // P2 der sechsten Probe (Ausschnitt von Diego): zwei Rosetten und die Handbrause an einer Wand, an der anderen eine
    // runde Platte mit zwei Griffen. P8 der siebten: zwei Saetze an zwei Waenden.
    wanted.shower && fittingsWalls && fittingsWalls.length > 1 && 'the shower fittings are spread over two walls; they all belong together on one wall',
    // P1 und P5 der siebten Probe: alle Armaturen an der Laengswand. Die Stirnwand sagt die Vorpruefung im Foto.
    wanted.shower && endWall && fittingsWalls?.length === 1 && fittingsWalls[0] !== endWall
      && (endWall === 'back' ? `the shower fittings are on the ${fittingsWalls[0]} wall; they all belong on the short end wall of the shower, the ${endWall} wall`
        : `the shower fittings are on the ${fittingsWalls[0]} wall; seen from the door they all belong on the ${endWall} wall at the short end of the shower, seen from the side, and the ${fittingsWalls[0]} wall stays empty`),
  ].filter((hint): hint is string => !!hint));
  hints.push(...[
    walkIn && parsed.point_drain && 'the shower has a point drain; it needs a linear channel drain at the foot of the wall with the fittings',
    // Kein Hinweis mehr, an welcher Wand Rinne und Armaturen stehen: in P9 vom 26.09. waren beide falsch, Rinne und
    // Armaturen standen richtig (Diego). Die Waende stehen nur noch im Log.
  ].filter((hint): hint is string => !!hint));
  // Eine Tuer oder Mauerkante vorne, die fehlt, zaehlt nicht mehr (Diego, 04.10.): seit dem 27.09. war sie nur ein Hinweis,
  // wog aber in der Wahl des Bildes mit und hielt ein sonst fehlerloses Bild zurueck, bis das andere fertig war.
  // Ein anderer Bildausschnitt wird nur vermerkt.
  const all = [...serious, ...hints];
  return flags.view_changed ? { status: 'approved', note: parsed.reason.slice(0, 200), hints: all, serious, shower: showerSeen } : { status: 'approved', hints: all, serious, shower: showerSeen };
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
type Ceiling = 'flat' | 'sloped';
/** Die Wand am schmalen Ende von Wanne oder Dusche im Foto: dort sitzen die Duscharmaturen und die Rinne. */
type EndWall = 'left' | 'right' | 'back';
type PhotoCheck = { status: 'ok'; layout?: Layout; ceiling?: Ceiling; showerWall?: EndWall; showerLongWall?: EndWall; summary?: string } | { status: 'wrong_room'; reason: string } | { status: 'unavailable' };

async function checkPhoto(photo: Photo, room: 'badezimmer' | 'gaeste-wc', ctx: RequestContext): Promise<PhotoCheck> {
  const model = photoCheckModel();
  if (!model) return { status: 'unavailable' };
  const question =
    `A customer uploaded this photo as the ${room === 'gaeste-wc' ? 'guest WC' : 'bathroom'} they want renovated. ` +
    'Set is_bathroom true if it shows the inside of a bathroom or a WC, or a room being stripped or built as one: a toilet, a washbasin, a shower, a bathtub, a bidet, a tiled wet area or exposed sanitary pipes is enough. ' +
    'Set is_bathroom true as well whenever you are not sure. ' +
    'Set is_bathroom false only when the photo clearly shows something else, for example a living room, a bedroom, a kitchen, a balcony, a garden, an office, a car, a person, a document, a screenshot or a photo of a screen. ' +
    'Then, if it is a bathroom, name the wall each sanitary fixture stands against, seen from the camera: "left", "right", "back", "front", or "none" when it is not visible; a fixture that is only partly in frame still counts. ' +
    'List the visible fixtures in the order you see them from left to right, each at most once, and name the one closest to the camera, or "none" when you cannot tell. ' +
    // P4 vom 25.09.: aus einer flachen Decke wurde eine Dachschraege. Das Bildmodell bekommt jetzt gesagt, welche Decke es ist.
    'Set ceiling to "flat" when the visible ceiling is flat and horizontal, "sloped" when it slopes (an attic or roof slope), or "unknown" when no ceiling is visible. ' +
    // Problem 1 der siebten Probe (Diego, 27.09.): in P2 und P5 las die Vorpruefung die quere Wanne, von Wand zu Wand an der
    // Rueckwand, in 5 von 5 Laeufen als "laengs an der linken Wand". Statt "quer oder laengs" sagt sie jetzt, welche Waende
    // die Wanne beruehrt; Laengsseite und Enden rechnet der Code daraus aus.
    'If the photo shows a bathtub, or a shower when there is no bathtub, say which walls it touches, seen from the camera: ' +
    'set shower_left true if it touches the left wall and shower_right true if it touches the right wall; ' +
    'set shower_back to "along" if one of its long sides stands against the back wall over its whole length, "end" if it touches the back wall only with one of its narrow ends, "none" if it does not touch the back wall. ' +
    'With no bathtub and no shower, or when you cannot tell, set false, false and "none". ' +
    // Auch so las sie P2 als laengs. Der Waschtisch als Anker (Diego, 27.09.): steht er gleich neben einem schmalen Ende,
    // ist seine Wand die Stirnwand.
    'Then set basin_beside_end true if the washbasin or its cabinet stands right beside one of the two narrow ends of that bathtub or shower, almost touching it, and false if it stands along a long side, across the room from it or further away, or when you cannot tell. ' +
    'Answer with JSON only, no markdown and exactly these keys: {"is_bathroom":true,"reason":"short English reason, max 25 words",' +
    '"walls":{"toilet":"left","washbasin":"left","shower":"none","bathtub":"none","bidet":"none"},"order":["washbasin","toilet"],"nearest":"toilet","ceiling":"flat","shower_left":false,"shower_right":false,"shower_back":"none","basin_beside_end":false}';
  const reply = await askCheckModel(model, question, [photo], PHOTO_CHECK_TIMEOUT_MS, ctx, 'high');
  if ('detail' in reply) {
    console.error('[badplaner] Fotopruefung nicht moeglich', reply.detail);
    return { status: 'unavailable' };
  }
  const parsed = reply.answer;
  if (!parsed || Array.isArray(parsed) || typeof parsed.is_bathroom !== 'boolean' || typeof parsed.reason !== 'string'
    || !parsed.reason.trim() || parsed.reason.length > 200
    || Object.keys(parsed).some((key) => !['is_bathroom', 'reason', 'walls', 'order', 'nearest', 'ceiling', 'shower_left', 'shower_right', 'shower_back', 'basin_beside_end'].includes(key))) return { status: 'unavailable' };
  if (!parsed.is_bathroom) return { status: 'wrong_room', reason: parsed.reason.slice(0, 200) };
  // Der Grundriss ist eine Zugabe: fehlt er oder ist er unlesbar, wird ohne ihn gerendert.
  const walls = inventory(parsed.walls);
  const seen = order(parsed.order);
  const near = nearest(parsed.nearest);
  const ceiling: Ceiling | undefined = parsed.ceiling === 'flat' || parsed.ceiling === 'sloped' ? parsed.ceiling : undefined;
  // Aus den beruehrten Waenden: der Rueckwand entlang liegt die Wanne quer, mit den Enden links und rechts, und ein Ende
  // hat eine Wand nur, wo sie sie beruehrt; mit einem Ende an der Rueckwand liegt sie laengs, das Ende hinten ist ihre
  // einzige Wand und die Laengsseite die Seitenwand, die sie beruehrt (beide: eine Nische). Sonst gibt es keine Stirnwand.
  const left = parsed.shower_left === true;
  const right = parsed.shower_right === true;
  const back = parsed.shower_back === 'along' || parsed.shower_back === 'end' ? parsed.shower_back as 'along' | 'end' : undefined;
  const ends: EndWall[] = back === 'along' ? (['left', 'right'] as const).filter((wall) => (wall === 'left' ? left : right)) : back === 'end' ? ['back'] : [];
  const longWall: EndWall | undefined = back === 'along' ? 'back' : back === 'end' && left !== right ? (left ? 'left' : 'right') : undefined;
  // Zwei Enden an Waenden: die Armaturen kommen an das Ende zum Waschtisch, dort kommt das Wasser an (Diego, 27.09.), sonst
  // an das Ende zum WC; nie an ein offenes Ende. Die alten Armaturen zaehlen nicht: bei Wannen sitzen sie oft an der Laengsseite.
  const toward = (fixture: Fixture): EndWall | undefined => {
    const wall = walls?.[fixture];
    if (wall === 'left' || wall === 'right') return wall;
    if (!wall || wall === 'none') return undefined;
    const tub = seen?.indexOf(walls?.bathtub !== 'none' ? 'bathtub' : 'shower') ?? -1;
    const other = seen?.indexOf(fixture) ?? -1;
    return tub < 0 || other < 0 ? undefined : other < tub ? 'left' : 'right';
  };
  // Steht der Waschtisch gleich neben einem schmalen Ende, gilt seine Wand, auch gegen die gelesenen Waende (P2: "laengs
  // links"); die Laengsseite steht quer dazu. Nicht, wenn seine Wand die Laengsseite ist: dann steht er vor dem offenen Ende.
  const basinWall = walls?.washbasin;
  const basin: EndWall | undefined = parsed.basin_beside_end === true && (basinWall === 'left' || basinWall === 'right' || basinWall === 'back') && basinWall !== longWall ? basinWall : undefined;
  const showerWall = basin ?? (ends.length === 2 ? toward('washbasin') ?? toward('toilet') : ends[0]);
  const showerLong = basin ? (basin === 'back' ? (left !== right ? (left ? 'left' : 'right') : undefined) : 'back') : longWall;
  // Fuer die Mail an NLD (Problem 1 der siebten Probe): was die Vorpruefung sah und ob ihre Stirnwand gilt. Die Logs von
  // Vercel sind fuer uns nicht lesbar.
  const names: Record<Fixture, string> = { toilet: 'WC', washbasin: 'Waschtisch', shower: 'Dusche', bathtub: 'Wanne', bidet: 'Bidet' };
  const summary = [
    walls ? FIXTURES.filter((fixture) => walls[fixture] !== 'none').map((fixture) => `${names[fixture]} ${wallDe(walls[fixture])}`).join(', ') || 'kein Sanitärobjekt' : 'Grundriss unlesbar',
    back || left || right
      ? `Wanne/Dusche berührt ${[left && 'links', right && 'rechts', back === 'along' ? 'hinten der Länge nach' : back === 'end' && 'hinten mit einem Ende'].filter(Boolean).join(', ')}; Längsseite ${wallDe(showerLong)}, Stirnwand ${wallDe(showerWall)}${basin ? ' (Waschtisch am Ende)' : ends.length === 2 ? (toward('washbasin') ? ' (zum Waschtisch)' : toward('toilet') ? ' (zum WC)' : '') : ''}`
      : '',
    `Decke ${ceiling === 'flat' ? 'flach' : ceiling === 'sloped' ? 'schräg' : '–'}`,
  ].filter(Boolean).join('; ');
  return { status: 'ok', layout: walls && seen && near ? { walls, order: seen, nearest: near } : undefined, ceiling, showerWall, showerLongWall: showerWall ? showerLong : undefined, summary };
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
 * Ein weggeraeumtes Stueck loest die Regel nicht aus. Seit dem 25.09. nur ein
 * Hinweis in der Lead-Mail: "am naechsten" liest die Pruefung oft unsicher.
 */
function compareDepth(
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
  wanted: { room: 'badezimmer' | 'gaeste-wc'; shower: boolean; bathtub: boolean; cistern: 'aufputz' | 'unterputz'; showerWall?: EndWall; showerLongWall?: EndWall },
): string | null {
  // Kein Paket enthaelt ein Bidet. Steht es noch da, hat das Modell nicht umgebaut.
  if (after.bidet !== 'none') return `the bidet is still there, on the ${after.bidet} wall`;
  if (wanted.shower && after.shower === 'none') return 'the requested shower is missing';
  if (!wanted.shower && after.shower !== 'none') return `there is a shower on the ${after.shower} wall although none was ordered`;
  if (wanted.bathtub && after.bathtub === 'none') return 'the requested bathtub is missing';
  if (!wanted.bathtub && after.bathtub !== 'none') return `there is a bathtub on the ${after.bathtub} wall although none was ordered`;
  if (before.toilet !== 'none' && after.toilet === 'none') return 'the toilet is missing';
  // Gegenpruefung vom 27.09.: ohne diese Regel waehlte die Auswahl aus zwei Bildern eines, in dem der Waschtisch fehlte.
  if (before.washbasin !== 'none' && after.washbasin === 'none') return 'the washbasin is missing';
  if (before.toilet !== 'none' && after.toilet !== before.toilet) {
    return `the toilet moved from the ${before.toilet} wall to the ${after.toilet} wall`;
  }
  if (before.washbasin !== 'none' && after.washbasin !== 'none' && after.washbasin !== before.washbasin) {
    return `the washbasin moved from the ${before.washbasin} wall to the ${after.washbasin} wall`;
  }
  // Wanne wird Dusche: die Dusche gehoert an die Wand, an der die Wanne stand. Die Wand am schmalen Ende der Wanne
  // (Vorpruefung) gilt auch: dort sitzen die Armaturen, und das Pruefmodell nennt oft sie (P5 vom 26.09.). Sonst trieb
  // der zweite Versuch die Dusche wieder an die Laengswand, gedreht (Gegenpruefung vom 27.09.). Die Wand der Laengsseite
  // (Vorpruefung) gilt ebenso: eine Wanne mit dem Kopfende hinten steht auch an ihr (P2 und P5 der sechsten Probe).
  if (wanted.shower && before.shower === 'none' && before.bathtub !== 'none'
    && after.shower !== 'none' && after.shower !== before.bathtub && after.shower !== wanted.showerWall && after.shower !== wanted.showerLongWall) {
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
          // Jede Mail des Badplaners an Diego, Emanuel in Kopie, auch in der Vorschau, wo die
          // beiden Variablen fehlen (Diego, 25.09.). Bis dahin ging die Vorschau nur an Emanuel.
          to: [env.BADPLANER_TO || business.emailSecondary],
          cc: [env.BADPLANER_CC || business.email],
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
