/**
 * Tracking nur mit Einwilligung.
 *
 * - Google Analytics 4 (Statistik)  -> Kategorie "analytics"
 * - Meta Pixel (Marketing)          -> Kategorie "marketing"
 *
 * Die beiden Kategorien sind getrennt. Google Consent Mode v2:
 *   Statistik -> analytics_storage
 *   Marketing -> ad_storage, ad_user_data, ad_personalization
 * Wer nur der Statistik zustimmt, bekommt ausschliesslich die Messung; alle
 * Werbesignale bleiben auf "denied".
 *
 * Kein Script wird geladen, bevor der Besucher im Cookie-Banner oder in den
 * Cookie-Einstellungen zugestimmt hat. Die Einwilligung liegt im Cookie
 * "nldConsent" als JSON {"analytics":bool,"marketing":bool,"ts":ms}.
 * Das Cookie "newLivingDesignCookieConsent" (react-cookie-consent) steuert nur,
 * ob der Banner angezeigt wird.
 */
import { Cookies } from 'react-cookie-consent';
import { business } from '../config/business.js';

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
}

export const CONSENT_COOKIE = 'nldConsent';
export const BANNER_COOKIE = 'newLivingDesignCookieConsent';

type Fbq = ((...args: unknown[]) => void) & {
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: unknown;
  callMethod?: (...args: unknown[]) => void;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: Fbq;
    _fbq?: Fbq;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

const GA_ID = business.ga4MeasurementId;
const PIXEL_ID = business.metaPixelId;

let gaLoaded = false;
let pixelBootstrapped = false; // fbevents.js liegt im DOM
let pixelLoaded = false; // Marketing eingewilligt und Pixel aktiv
let gtagScriptLoaded = false;
let consentModeReady = false;

export function readConsent(): ConsentState | null {
  const raw = Cookies.get(CONSENT_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    return { analytics: !!parsed.analytics, marketing: !!parsed.marketing };
  } catch {
    return null;
  }
}

export function saveConsent(state: ConsentState): void {
  const secure = window.location.protocol === 'https:';
  Cookies.set(CONSENT_COOKIE, JSON.stringify({ ...state, ts: Date.now() }), {
    expires: 365,
    sameSite: 'lax',
    secure,
  });
  Cookies.set(BANNER_COOKIE, state.analytics || state.marketing ? 'true' : 'false', {
    expires: 365,
    sameSite: 'lax',
    secure,
  });
  applyConsent(state);
}

/** Lädt oder deaktiviert die Dienste gemäss Einwilligung. */
export function applyConsent(state: ConsentState): void {
  updateGoogleConsent(state);

  if (state.analytics) enableGoogleAnalytics();
  else disableGoogleAnalytics();

  if (state.marketing) enableMetaPixel();
  else disableMetaPixel();
}

/**
 * Setzt die vier Google-Signale aus den zwei Kategorien: die Messung haengt an
 * der Statistik, die drei Werbesignale haengen am Marketing. Widerruf laeuft
 * ueber denselben Weg und wirkt ohne Neuladen der Seite.
 */
function updateGoogleConsent(state: ConsentState): void {
  initConsentMode();
  const ads = state.marketing ? 'granted' : 'denied';
  window.gtag!('consent', 'update', {
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
    analytics_storage: state.analytics ? 'granted' : 'denied',
  });
}

/** Beim Laden der Seite aufrufen: stellt eine frühere Einwilligung wieder her. */
export function initTrackingFromConsent(): void {
  initConsentMode();
  const state = readConsent();
  if (state) applyConsent(state);
}

/* ---------- Google Analytics 4 ---------- */

/** Legt window.gtag an, ohne etwas zu senden. */
function ensureGtagStub(): void {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  // gtag.js erkennt nur das echte `arguments`-Objekt als Befehl, kein Array.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
}

/**
 * Consent Mode v2: Standard "denied" beim Laden, "granted" mit der Einwilligung.
 * gtag.js und das config (= page_view mit session_start) kommen erst NACH der
 * Einwilligung. Vorher lief config schon beim Laden: page_view und
 * session_start gingen als anonymer Ping ohne Kennung raus, danach kam nur noch
 * user_engagement, und GA4 fuehrte die Sitzung als "(not set)" / Unassigned
 * statt utm_campaign=badplaner (19.09.2026: 32 Besucher aus Meta laut Vercel
 * Analytics, 0 Sitzungen "badplaner" in GA4). Besucher ohne Einwilligung zaehlt
 * Vercel Web Analytics ohne Cookies; GA4 zeigt anonyme Pings ohnehin nicht an.
 */
export function initConsentMode(): void {
  if (typeof window === 'undefined' || consentModeReady) return;
  consentModeReady = true;
  ensureGtagStub();
  window.gtag!('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
  });
}

/** Einmal pro Seitenaufruf, nach der Einwilligung: laedt gtag.js und sendet den page_view mit der aktuellen URL (auf der Landingpage samt UTM). */
function loadGtagScript(): void {
  if (gtagScriptLoaded) return;
  gtagScriptLoaded = true;
  window.gtag!('js', new Date());
  window.gtag!('config', GA_ID, {
    anonymize_ip: true,
    cookie_flags: 'SameSite=None;Secure',
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
}

function enableGoogleAnalytics(): void {
  window[`ga-disable-${GA_ID}`] = false;
  loadGtagScript();
  gaLoaded = true;
}

function disableGoogleAnalytics(): void {
  gaLoaded = false;
  window[`ga-disable-${GA_ID}`] = true;
  const idSuffix = GA_ID.replace('G-', '');
  ['_ga', `_ga_${idSuffix}`, '_gid', '_gat', `_gat_gtag_${GA_ID.replace('-', '_')}`].forEach((name) => {
    removeCookieEverywhere(name);
  });
}

/* ---------- Meta Pixel ---------- */

function enableMetaPixel(): void {
  pixelLoaded = true;
  if (pixelBootstrapped) {
    window.fbq?.('consent', 'grant');
    return;
  }
  pixelBootstrapped = true;

  // Standard-Bootstrap des Meta Pixel (fbevents.js), ohne eval.
  if (!window.fbq) {
    const fn = function (...args: unknown[]) {
      if (n.callMethod) {
        n.callMethod(...args);
      } else {
        n.queue.push(args);
      }
    };
    const n = Object.assign(fn, { queue: [] as unknown[][], loaded: true, version: '2.0', push: fn }) as Fbq;
    window.fbq = n;
    window._fbq = n;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  const fbq = window.fbq as Fbq;
  fbq('consent', 'grant');
  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');
}

function disableMetaPixel(): void {
  // pixelLoaded steuert auch trackLead/trackBadplaner/trackPageView: ohne das
  // Zuruecksetzen wuerde fbq nach dem Widerruf weiter Ereignisse sammeln.
  pixelLoaded = false;
  if (pixelBootstrapped) window.fbq?.('consent', 'revoke');
  ['_fbp', '_fbc'].forEach(removeCookieEverywhere);
}

/* ---------- Lead-Ereignisse ---------- */

export type LeadChannel = 'whatsapp' | 'phone' | 'email' | 'form';

/**
 * Meldet einen Lead-Kontakt, nur wenn die Dienste geladen sind (Einwilligung).
 *
 * GA4: ein Ereignis pro Kanal (lead_whatsapp, lead_phone, lead_email, lead_form),
 *      Parameter lead_source = Stelle auf der Seite, page_path = Pfad.
 *      Die vier Namen sind in GA4 als Schlüsselereignisse hinterlegt und werden
 *      als Conversions in Google Ads importiert.
 * Meta Pixel: Standardereignis "Lead" für Formulare, "Contact" für Telefon/WhatsApp/E-Mail.
 */
export function trackLead(channel: LeadChannel, place: string): void {
  if (window.gtag && gaLoaded) {
    window.gtag('event', `lead_${channel}`, {
      lead_source: place,
      page_path: window.location.pathname,
    });
  }
  if (window.fbq && pixelLoaded) {
    window.fbq('track', channel === 'form' ? 'Lead' : 'Contact', {
      content_name: place,
      content_category: channel,
    });
  }
}

/**
 * Schritte im Badplaner. Ohne diese Ereignisse sieht man in GA4 nur, dass
 * jemand die Seite geoeffnet hat, nicht wo er stehen bleibt.
 *
 * badplaner_start      Klick auf "Jetzt starten"
 * badplaner_raum       Badezimmer oder Gaeste-WC gewaehlt
 * badplaner_paket      Paket oder Stilrichtung gewaehlt
 * badplaner_foto       Foto geladen und angenommen
 * badplaner_kontakt    Formular abgeschickt
 * badplaner_ideenbild  Bild da und dem Kunden gezeigt
 *
 * Derselbe Name geht als eigenes Ereignis an den Meta Pixel, damit beide
 * Seiten dieselbe Sprache sprechen.
 */
export type BadplanerStep =
  | 'badplaner_start'
  | 'badplaner_raum'
  | 'badplaner_paket'
  | 'badplaner_foto'
  | 'badplaner_kontakt'
  | 'badplaner_ideenbild';

export function trackBadplaner(step: BadplanerStep, params: { raum?: string; paket?: string } = {}): void {
  const payload = {
    raum: params.raum || '',
    paket: params.paket || '',
    page_path: typeof window === 'undefined' ? '' : window.location.pathname,
  };
  if (window.gtag && gaLoaded) window.gtag('event', step, payload);
  if (window.fbq && pixelLoaded) window.fbq('trackCustom', step, payload);
}

let clickTrackingInstalled = false;

/**
 * Einmal beim Start aufrufen: erfasst auf allen Seiten Klicks auf tel:-, mailto:-
 * und WhatsApp-Links, ohne jeden Link einzeln anfassen zu müssen.
 * Ein Link kann mit data-lead="…" eine sprechende Stelle angeben; sonst wird
 * Pfad + Linktext gemeldet.
 */
export function installLeadClickTracking(): void {
  if (clickTrackingInstalled || typeof document === 'undefined') return;
  clickTrackingInstalled = true;
  document.addEventListener(
    'click',
    (ev) => {
      const target = ev.target as Element | null;
      const link = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute('href') || '';
      const place =
        link.dataset.lead || `${window.location.pathname}:${(link.textContent || '').trim().slice(0, 40)}`;
      if (href.startsWith('tel:')) trackLead('phone', place);
      else if (href.startsWith('mailto:')) trackLead('email', place);
      else if (href.startsWith('whatsapp:') || /(^|\/\/)(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i.test(href)) {
        trackLead('whatsapp', place);
      }
    },
    { capture: true },
  );
}

/**
 * Seitenwechsel in der SPA. GA4 erfasst Verlaufsänderungen selbst
 * ("Erweiterte Messung" im Datenstream), darum hier nur der Meta Pixel.
 */
export function trackPageView(_path: string): void {
  void _path;
  if (window.fbq && pixelLoaded) {
    window.fbq('track', 'PageView');
  }
}

function removeCookieEverywhere(name: string): void {
  const host = window.location.hostname;
  Cookies.remove(name, { path: '/' });
  Cookies.remove(name, { path: '/', domain: host });
  Cookies.remove(name, { path: '/', domain: `.${host}` });
  const parts = host.split('.');
  if (parts.length > 2) {
    Cookies.remove(name, { path: '/', domain: `.${parts.slice(-2).join('.')}` });
  }
}
