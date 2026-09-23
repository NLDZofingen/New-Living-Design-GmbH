import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Badplaner.module.css';
import { imagesLoad } from './imagesLoad';
import { SEOHead } from '../../components';
import { business, bathPackages, individualPackage } from '../../config/business';
import {
  accentsForPlacement,
  badplanerFaq,
  optionsForPackage,
  tilesForLook,
  type AccentPlacementId,
  type PackageId,
  type RoomType,
} from '../../data/badplaner';
import { photoUrl } from '../../data/references';
import { generateFAQStructuredData, generateBreadcrumbStructuredData } from '../../utils/structuredData';
import { trackLead, trackBadplaner } from '../../utils/tracking';
import { resizeImageFile, fileToBase64, readFileNow, type ResizedImage } from './resizeImage';
import { MAX_PLAN_BASE64, MAX_SOURCE_IMAGE_BYTES } from './imageValidation';

/*
 * Badplaner: Paket wählen, Ausstattung wählen, Foto machen, Kontakt angeben,
 * Ideenbild erhalten. Die Bilderzeugung und der E-Mail-Versand laufen in
 * api/badplaner.ts. Beim Prerendering (ohne Browser) wird nur der Startzustand
 * gerendert; alles mit Datei, Kamera oder Fenster passiert in Handlern.
 *
 * Schritt 2 zeigt zuerst die wichtigsten Auswahlen. Umfangreiche Materialfamilien
 * und die optionalen Details sind einklappbar; alle Werte bleiben vorbelegt und
 * jede bisherige Option bleibt erreichbar.
 */

const PAGE_URL = `${business.siteUrl}/badplaner`;
const WINDOW_OPTIONS = [
  { id: '0', label: 'Keins' },
  { id: '1', label: '1 Fenster' },
  { id: '2', label: '2 Fenster' },
  { id: '3', label: '3 oder mehr' },
];
const CISTERN_OPTIONS = [
  { id: 'aufputz', label: 'Spülkasten sichtbar (Aufputz)' },
  { id: 'unterputz', label: 'Spülkasten in der Wand (Unterputz)' },
];
const API_URL = '/api/badplaner';
const MAX_PLAN_PDF_BYTES = 3_000_000; // Base64 + JSON remains below the API request cap.
const RENDER_TIMEOUT_MS = 240_000; // Server-Deadline 220 s (zwei Durchgaenge) plus Antwort (Ideenbild 2K, mehrere MB) auf dem Handy
const TILE_HINT = 'Nur eine kleine Auswahl. Alle Serien und Farben sehen Sie in unserer Ausstellung in Zofingen.';
const NEWSLETTER_TEXT =
  'Ja, ich möchte gelegentlich Ideen und Neuigkeiten von New Living Design per E-Mail erhalten (jederzeit abbestellbar).';

/** Fläche im Vertrag mit der API (Kapitel 10 der Spezifikation). */
const PLACEMENT_FIELD: Record<AccentPlacementId, string> = {
  waschtischwand: 'waschtisch',
  duschnische: 'dusche',
};

type Step = 1 | 2 | 3 | 4;
type RenderFailureCode = 'PHOTO_NOT_A_BATHROOM' | 'RENDER_FAILED' | 'RENDER_REJECTED';

function renderFailureCode(code: unknown, status: number): RenderFailureCode | null {
  if (code === 'PHOTO_NOT_A_BATHROOM' || code === 'RENDER_FAILED' || code === 'RENDER_REJECTED') return code;
  return status >= 500 ? 'RENDER_FAILED' : null;
}

interface Selection {
  format: string;               // Plattenformat (leer bei Atelier)
  look: string;                 // Look-Id (nur Atelier)
  tile: string;                 // Platte Wand (bzw. alles)
  floorDifferent: boolean;      // Boden anders als die Wand
  floor: string;                // Platte Boden
  accentMode: string;           // einheitlich | kombination (nur Atelier)
  accentPlacement: AccentPlacementId;
  accent: string;               // Akzentmaterial
  base: string;                 // Unterbau
  top: string;                  // Waschtischplatte
  basinType: string;            // integriertes Becken oder Aufsatzbecken (Atelier)
  tapSeries: string;            // Armaturenserie (Colore)
  finish: string;               // Armaturen-Oberfläche (Colore und Atelier)
  sanitary: string;             // Keramikfarbe
  wall: string;                 // Wandhöhe
  shower: string;
  bathtub: string;
  basin: string;
  mirror: string;
}

interface Result {
  leadId: string;
  dataUrl: string;
  mime: string;
  /** Vorschau: das Bild ist da, die Kontaktangaben noch nicht. Danach fehlt dieses Feld. */
  preview?: { ticket: string; exp: number; auswahl: [string, string][]; paket: unknown; bytes: Blob };
  delivery?: {
    lead: 'accepted';
    customer: 'accepted' | 'failed' | 'unknown' | 'skipped';
    newsletter?: 'accepted' | 'failed' | 'unknown' | 'skipped';
  };
}

/**
 * Vorher/Nachher oben auf der Seite: Foto eines alten Bads und das Ideenbild daraus.
 * Die zwei Dateien liefert NLD (echter Durchgang, mit Einwilligung des Kunden).
 * Fehlt eine, zeigt die Seite nichts statt eines kaputten Bildes. Ein onError am
 * <img> reicht dafuer nicht: die Seite ist vorgerendert, der Ladefehler faellt vor
 * der Hydration und React bekommt ihn nie mit. Darum erscheint der Block erst,
 * wenn beide Bilder nachweislich geladen sind.
 */
const VORHER_NACHHER = { vorher: '/badplaner/vorher-nachher/vorher.jpg', nachher: '/badplaner/vorher-nachher/nachher.jpg' };

const VorherNachher: React.FC = () => {
  const [position, setPosition] = useState(50);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    imagesLoad([VORHER_NACHHER.vorher, VORHER_NACHHER.nachher]).then((ok) => { if (alive) setReady(ok); });
    return () => { alive = false; };
  }, []);
  if (!ready) return null;
  return (
    <div className={styles.beforeAfter}>
      <img src={VORHER_NACHHER.vorher} alt="Vorher: Foto des bestehenden Bads" />
      <img src={VORHER_NACHHER.nachher} alt="Nachher: Ideenbild aus dem Badplaner" style={{ clipPath: `inset(0 0 0 ${position}%)` }} />
      <span className={styles.beforeAfterLabel}>Vorher</span>
      <span className={`${styles.beforeAfterLabel} ${styles.beforeAfterLabelRight}`}>Ideenbild</span>
      <span className={styles.beforeAfterHandle} style={{ left: `${position}%` }} aria-hidden="true" />
      <input type="range" min={0} max={100} value={position} onChange={(e) => setPosition(Number(e.target.value))} className={styles.beforeAfterRange} aria-label="Vorher und Ideenbild vergleichen" />
    </div>
  );
};

const firstId = (list: { id: string }[]): string => (list.length > 0 ? list[0].id : '');

/** Erste Option jeder Gruppe als Vorgabe: nichts ist Pflicht, alles ist vorbelegt. */
function defaultSelection(pkg: PackageId, room: RoomType): Selection {
  const o = optionsForPackage(pkg);
  const look = firstId(o.looks);
  const tileList = pkg === 'atelier' ? tilesForLook(look) : o.tiles;
  const tile = firstId(tileList);
  return {
    format: o.formats[0] ?? '',
    look,
    tile,
    floorDifferent: false,
    floor: tile,
    accentMode: firstId(o.accentModes),
    accentPlacement: 'waschtischwand',
    accent: firstId(accentsForPlacement('waschtischwand')),
    base: firstId(o.bases),
    top: firstId(o.tops),
    basinType: firstId(o.basinTypes),
    tapSeries: firstId(o.tapSeriesOptions),
    finish: firstId(o.finishes),
    sanitary: firstId(o.sanitary),
    wall: firstId(o.walls),
    shower: room === 'gaeste-wc' ? '' : (o.showers.find((item) => item.id === 'duschwanne')?.id ?? firstId(o.showers)),
    bathtub: room === 'gaeste-wc' ? '' : 'keine',
    basin: room === 'gaeste-wc' ? 'einzel' : firstId(o.basins),
    mirror: firstId(o.mirrors),
  };
}

/** Liste in Gruppen (Serie, Familie, Lieferant) zerlegen, Reihenfolge bleibt. */
function groupBy<T>(items: T[], key: (item: T) => string): { key: string; items: T[] }[] {
  const out: { key: string; items: T[] }[] = [];
  const index = new Map<string, { key: string; items: T[] }>();
  for (const item of items) {
    const k = key(item);
    let group = index.get(k);
    if (!group) {
      group = { key: k, items: [] };
      index.set(k, group);
      out.push(group);
    }
    group.items.push(item);
  }
  return out;
}

const howSteps = [
  { n: '1', title: 'Raum, Stil und Ausstattung wählen', text: 'Badezimmer oder Gäste-WC wählen. Danach Stil, Materialien und die passenden Positionen bestimmen oder direkt eine individuelle Beratung anfragen.' },
  { n: '2', title: 'Foto vom Raum machen', text: 'Am Handy neu aufnehmen oder ein Foto aus der Galerie wählen. Von der Tür aus, den ganzen Raum im Bild, Licht an. Das Foto wird vor dem Senden verkleinert.' },
  { n: '3', title: 'Ideenbild ansehen, dann in voller Qualität erhalten', text: 'Nach ein bis zwei Minuten sehen Sie Ihr Bad mit den gewählten Materialien als Vorschau. Mit Ihren Kontaktangaben erhalten Sie es in voller Qualität per E-Mail, dazu den Fixpreis des Pakets und eine kostenlose Beratung.' },
];

/** Musterbild; fehlt es (noch nicht geladen), zeigt es eine farbige Fläche. */
const Swatch: React.FC<{ image?: string | null; hex?: string; label: string; cover?: boolean; diagram?: boolean }> = ({ image, hex, label, cover, diagram }) => {
  const [broken, setBroken] = useState(false);
  // diagram: Strichzeichnung auf hellem Grund – ganz zeigen statt quadratisch beschneiden
  const coverClass = diagram ? `${styles.cardImg} ${styles.cardImgDiagram}` : styles.cardImg;
  if (!image || broken) {
    return (
      <span
        className={cover ? `${coverClass} ${styles.coverFallback}` : styles.swatchFallback}
        style={hex ? { background: hex } : undefined}
        aria-hidden="true"
      >
        {hex ? '' : label.slice(0, 3)}
      </span>
    );
  }
  return (
    <img
      src={image}
      alt=""
      loading="lazy"
      decoding="async"
      className={cover ? coverClass : styles.swatchImg}
      width={cover ? (diagram ? 520 : 480) : 72}
      height={cover ? (diagram ? 390 : 320) : 72}
      onError={() => setBroken(true)}
    />
  );
};

interface PickItem {
  id: string;
  label: string;
  image?: string | null;
  hex?: string;
  meta?: string;
  note?: string;
}

/** Muster mit Bild (Platten, Möbel, Akzente). */
const SwatchPicker: React.FC<{ name: string; items: PickItem[]; value: string; onChange: (id: string) => void }> = ({ name, items, value, onChange }) => (
  <div className={styles.swatches}>
    {items.map((o) => (
      <label key={o.id} className={`${styles.option} ${value === o.id ? styles.optionSelected : ''}`}>
        <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
        <Swatch image={o.image} hex={o.hex} label={o.label} />
        <span className={styles.optionLabel}>
          {o.label}
          {o.meta && <span className={styles.optionMeta}>{o.meta}</span>}
        </span>
      </label>
    ))}
  </div>
);

/** Kleine runde Auswahl (Keramikfarbe, Oberfläche, Format, Fenster). */
const ChipPicker: React.FC<{ name: string; items: PickItem[]; value: string; onChange: (id: string) => void }> = ({ name, items, value, onChange }) => (
  <div className={styles.chips}>
    {items.map((o) => (
      <label key={o.id} className={`${styles.option} ${styles.chip} ${value === o.id ? styles.optionSelected : ''}`}>
        <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
        {(o.image || o.hex) && <Swatch image={o.image} hex={o.hex} label={o.label} />}
        <span className={styles.optionLabel}>{o.label}</span>
      </label>
    ))}
  </div>
);

/** Reine Textauswahl (Wandhöhe, Dusche, Waschtisch, Spiegel). */
const ChoicePicker: React.FC<{ name: string; items: PickItem[]; value: string; onChange: (id: string) => void }> = ({ name, items, value, onChange }) => (
  <div className={styles.choices}>
    {items.map((o) => (
      <label key={o.id} className={`${styles.option} ${styles.choice} ${value === o.id ? styles.optionSelected : ''}`}>
        <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
        <span className={styles.optionLabel}>
          {o.label}
          {o.meta && <span className={styles.optionMeta}>{o.meta}</span>}
        </span>
      </label>
    ))}
  </div>
);

/** Karten mit Foto (Looks, Armaturenserien, Waschbeckenart). */
const CardPicker: React.FC<{ name: string; items: PickItem[]; value: string; onChange: (id: string) => void; large?: boolean; diagram?: boolean }> = ({ name, items, value, onChange, large, diagram }) => (
  <div className={large ? styles.lookCards : styles.photoCards}>
    {items.map((o) => (
      <label key={o.id} className={`${styles.card} ${value === o.id ? styles.cardSelected : ''}`}>
        <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
        <Swatch image={o.image} label={o.label} cover diagram={diagram} />
        <span className={styles.cardText}>
          <span className={styles.cardLabel}>{o.label}</span>
          {o.meta && <span className={styles.cardMeta}>{o.meta}</span>}
          {o.note && <span className={styles.cardNote}>{o.note}</span>}
        </span>
      </label>
    ))}
  </div>
);

const PositionPanel: React.FC<{
  id: string;
  title: string;
  summary: string;
  image?: string | null;
  open: boolean;
  onToggle: (trigger: HTMLButtonElement) => void;
  children: React.ReactNode;
}> = ({ id, title, summary, image, open, onToggle, children }) => (
  <section className={`${styles.positionPanel} ${open ? styles.positionPanelOpen : ''}`}>
    <button type="button" className={styles.positionHead} onClick={(event) => onToggle(event.currentTarget)} aria-expanded={open} aria-controls={`position-${id}`}>
      {image && <Swatch image={image} label={summary} />}
      <span className={styles.positionText}><strong>{title}</strong><span>{summary}</span></span>
      <span className={styles.positionToggle} aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    {open && <div id={`position-${id}`} className={styles.positionBody}>{children}</div>}
  </section>
);

const Badplaner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [room, setRoom] = useState<RoomType | null>(null);
  const [pkg, setPkg] = useState<PackageId | null>(null);
  const [individuell, setIndividuell] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [beratung, setBeratung] = useState({ priorities: '', measurements: '', style: '', budget: '', imageWanted: false });
  const [beratungFile, setBeratungFile] = useState<File | null>(null);
  const [beratungStatus, setBeratungStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [beratungError, setBeratungError] = useState('');
  const [beratungRetry, setBeratungRetry] = useState<File | null>(null);
  const [renderFailure, setRenderFailure] = useState<RenderFailureCode | null>(null);
  const [showFailureConsultation, setShowFailureConsultation] = useState(false);

  const [photo, setPhoto] = useState<ResizedImage | null>(null);
  const PHOTO_INPUTS = ['bp-foto-kamera', 'bp-foto-galerie', 'bp-foto-kamera-neu', 'bp-foto-galerie-neu', 'bp-foto-datei'];
  const removePhoto = () => {
    setPhoto(null);
    setPhotoError('');
    // Sonst meldet der Browser beim gleichen Foto kein change-Ereignis mehr.
    for (const id of PHOTO_INPUTS) {
      const input = document.getElementById(id) as HTMLInputElement | null;
      if (input) input.value = '';
    }
  };
  const [photoBusy, setPhotoBusy] = useState(false);
  const [retryPhoto, setRetryPhoto] = useState<File | null>(null); // fuer «Nochmals versuchen»
  const [photoError, setPhotoError] = useState('');
  const [windows, setWindows] = useState(''); // Fenster auf dem Foto: '0' | '1' | '2' | '3'
  const [cistern, setCistern] = useState('');

  const [contact, setContact] = useState({ name: '', phone: '', email: '', place: '', consent: false, newsletter: false });
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  const [plan, setPlan] = useState({ sqm: '', note: '' });
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [planStatus, setPlanStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [planError, setPlanError] = useState('');
  const [planRetry, setPlanRetry] = useState<File | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Record<number, HTMLElement | null>>({});
  const renderSubmittingRef = useRef(false);
  const beratungSubmittingRef = useRef(false);
  const planSubmittingRef = useRef(false);
  const scrollRestoreRef = useRef<number | null>(null);
  const panelAnchorRef = useRef<{ trigger: HTMLButtonElement; top: number } | null>(null);

  useLayoutEffect(() => {
    if (scrollRestoreRef.current === null) return;
    const scrollY = scrollRestoreRef.current;
    scrollRestoreRef.current = null;
    window.scrollTo({ top: scrollY, left: window.scrollX, behavior: 'auto' });
  });

  useLayoutEffect(() => {
    const anchor = panelAnchorRef.current;
    if (!anchor) return;
    panelAnchorRef.current = null;
    const nextTop = anchor.trigger.getBoundingClientRect().top;
    window.scrollBy({ top: nextTop - anchor.top, left: 0, behavior: 'auto' });
  }, [openPanel]);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Zum Ergebnis scrollen, sobald es da ist
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  const options = pkg ? optionsForPackage(pkg) : null;
  const pkgInfo = pkg ? bathPackages.find((p) => p.id === pkg) : undefined;
  const isAtelier = pkg === 'atelier';
  const canOpenStep4 = !!room && !!pkg && !!sel && !!photo && /^[0-3]$/.test(windows)
    && (cistern === 'aufputz' || cistern === 'unterputz') && !photoBusy;

  // Platten des gewählten Looks (Atelier) bzw. des Pakets
  const tileList = useMemo(() => {
    if (!options || !sel) return [];
    return isAtelier ? tilesForLook(sel.look) : options.tiles;
  }, [options, sel, isAtelier]);

  const tileGroups = useMemo(() => groupBy(tileList, (t) => t.series), [tileList]);
  const baseGroups = useMemo(() => groupBy(options ? options.bases : [], (b) => b.family || b.collection), [options]);
  const topGroups = useMemo(() => groupBy(options ? options.tops : [], (t) => t.material), [options]);
  const accentList = useMemo(() => (sel ? accentsForPlacement(sel.accentPlacement) : []), [sel]);
  const accentGroups = useMemo(() => groupBy(accentList, (a) => a.supplier), [accentList]);
  const availableAccentPlacements = useMemo(
    () => options?.accentPlacements.filter((placement) => room === 'badezimmer' || placement.id !== 'duschnische') ?? [],
    [options, room],
  );

  const goTo = (next: Step, scroll = true) => {
    if (renderSubmittingRef.current) return;
    if (next === 4 && !canOpenStep4) return;
    setStep(next);
    if (scroll) {
      // Nur ausdrückliche Navigation scrollt. Eine Auswahl darf die Seite nicht versetzen.
      setTimeout(() => stepRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  };

  const choosePackage = (id: PackageId) => {
    if (!room) return;
    trackBadplaner('badplaner_paket', { raum: room, paket: id });
    scrollRestoreRef.current = window.scrollY;
    setIndividuell(false);
    setPkg(id);
    setSel(defaultSelection(id, room));
    setOpenPanel(null);
    setRenderFailure(null);
    setShowFailureConsultation(false);
    setStatus('idle');
    setErrorMsg('');
    goTo(2, false);
  };

  const togglePanel = (id: string, trigger: HTMLButtonElement) => {
    panelAnchorRef.current = { trigger, top: trigger.getBoundingClientRect().top };
    setOpenPanel((current) => (current === id ? null : id));
  };

  /** Vierte Karte: erst danach das nächstgelegene Paket als Grundlage wählen. */
  const chooseIndividual = () => {
    setIndividuell(true);
    setPkg(null);
    setSel(null);
    setOpenPanel(null);
    setStep(1);
    setRenderFailure(null);
    setShowFailureConsultation(false);
    setStatus('idle');
    setErrorMsg('');
  };

  const chooseRoom = (next: RoomType) => {
    trackBadplaner('badplaner_raum', { raum: next });
    setRoom(next);
    setPkg(null);
    setSel(null);
    setIndividuell(false);
    setOpenPanel(null);
    setPhoto(null);
    setWindows('');
    setResult(null);
    setStatus('idle');
    setErrorMsg('');
    setRenderFailure(null);
    setShowFailureConsultation(false);
  };

  const choose = <K extends keyof Selection>(key: K, value: Selection[K]) =>
    setSel((s) => (s ? { ...s, [key]: value } : s));

  /** Look wechseln: die Platten des neuen Looks werden neu vorbelegt. */
  const chooseLook = (id: string) => {
    const tile = firstId(tilesForLook(id));
    setSel((s) => (s ? { ...s, look: id, tile, floor: tile } : s));
  };

  /** Fläche wechseln: nur Materialien zeigen, die dort zulässig sind (Nassbereich). */
  const choosePlacement = (id: AccentPlacementId) => {
    if (room === 'gaeste-wc' && id === 'duschnische') return;
    const allowed = accentsForPlacement(id);
    setSel((s) => (s ? { ...s, accentPlacement: id, accent: allowed.some((a) => a.id === s.accent) ? s.accent : firstId(allowed) } : s));
  };

  const loadPhoto = async (file: File) => {
    setPhotoError('');
    setRetryPhoto(null);
    setPhotoBusy(true);
    try {
      const resized = await resizeImageFile(file, 1280, 0.82);
      setPhoto(resized);
      trackBadplaner('badplaner_foto', { raum: room || '', paket: pkg || '' });
      setWindows(''); // neues Foto, Fenster neu angeben
      setCistern('');
      setStatus('idle');
      setErrorMsg('');
      setRenderFailure(null);
      setShowFailureConsultation(false);
      setBeratungStatus('idle');
      setBeratungError('');
    } catch (error) {
      setPhoto(null);
      setRetryPhoto(file);
      // Nur unsere eigenen Meldungen sind deutsch und hilfreich. Eine DOMException
      // des Browsers (NotReadableError, SecurityError) darf nie beim Kunden landen.
      const own = error instanceof Error && error.name === 'Error' && error.message;
      setPhotoError(own || 'Dieses Foto konnte nicht geöffnet werden. Bitte ein anderes wählen oder es mit «Foto aufnehmen» neu aufnehmen.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    await loadPhoto(file); // die Datei zuerst lesen, das Feld erst danach leeren
    input.value = ''; // gleiche Datei darf erneut gewählt werden
  };

  const prepareFailureConsultation = (failure: RenderFailureCode | null) => {
    setRenderFailure(failure);
    setShowFailureConsultation(false);
    if (!failure) return;
    setBeratung((current) => ({
      ...current,
      priorities: current.priorities || 'Ich wünsche eine persönliche Beratung zu meiner Auswahl im Badplaner.',
      imageWanted: false,
    }));
    setBeratungStatus('idle');
    setBeratungError('');
  };

  /** Schritt 3: das Ideenbild VOR den Kontaktangaben. Die Anfrage folgt im Ergebnis. */
  const submitRender = async () => {
    if (renderSubmittingRef.current) return;
    if (!room || !pkg || !sel || !photo || !canOpenStep4) {
      setStatus('error');
      setErrorMsg('Bitte wählen Sie Raum, Stil oder Paket, Foto, Fensterzahl und Spülkastenart.');
      return;
    }
    if (!contact.consent) {
      setStatus('error');
      setErrorMsg('Bitte bestätigen Sie die Datenschutzerklärung.');
      return;
    }
    renderSubmittingRef.current = true;
    setStatus('sending');
    setErrorMsg('');
    prepareFailureConsultation(null);
    const kombination = isAtelier && sel.accentMode === 'kombination';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', Accept: 'application/json' },
        // Feldnamen nach Kapitel 10 der Spezifikation (Vertrag mit api/badplaner.ts)
        body: JSON.stringify({
          kind: 'render',
          stage: 'vorschau',
          raum: room,
          paket: pkg,
          individuell,
          format: isAtelier ? '' : sel.format,
          look: isAtelier ? sel.look : '',
          platte: sel.tile,
          boden: sel.floorDifferent ? sel.floor : '',
          kombination: isAtelier ? sel.accentMode : '',
          akzentFlaeche: kombination ? PLACEMENT_FIELD[sel.accentPlacement] : '',
          akzent: kombination ? sel.accent : '',
          top: sel.top,
          unterbau: sel.base,
          becken: sel.basinType,
          armaturenserie: pkg === 'colore' ? sel.tapSeries : '',
          finish: pkg === 'colore' || isAtelier ? sel.finish : '',
          keramik: sel.sanitary,
          wall: sel.wall,
          dusche: sel.shower,
          badewanne: sel.bathtub,
          waschtisch: sel.basin,
          spiegel: sel.mirror,
          windows,
          cistern,
          foto: photo.dataUrl,
          consent: contact.consent,
          website: '',
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && json.vorschau && json.image?.data && json.ticket) {
        const mime = json.image.mime || 'image/png';
        const bytes = Uint8Array.from(atob(json.image.data), (c) => c.charCodeAt(0));
        setResult({
          leadId: json.leadId || '',
          mime,
          dataUrl: `data:${mime};base64,${json.image.data}`,
          preview: { ticket: json.ticket, exp: json.exp, auswahl: json.auswahl || [], paket: json.paket, bytes: new Blob([bytes], { type: mime }) },
        });
        setStatus('idle');
        prepareFailureConsultation(null);
        trackBadplaner('badplaner_ideenbild', { raum: room || '', paket: pkg || '' });
      } else {
        setStatus('error');
        setErrorMsg(json?.error || friendlyHttpError(res.status));
        prepareFailureConsultation(renderFailureCode(json?.code, res.status));
      }
    } catch (error) {
      setStatus('error');
      setErrorMsg(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Die Erstellung hat zu lange gedauert und wurde abgebrochen. Bitte versuchen Sie es noch einmal.'
          : 'Keine Verbindung. Bitte prüfen Sie Ihr Netz und versuchen Sie es noch einmal.',
      );
      prepareFailureConsultation('RENDER_FAILED');
    } finally {
      window.clearTimeout(timeout);
      renderSubmittingRef.current = false;
    }
  };

  /**
   * Kontakt nach der Vorschau: Laenge, JSON und die Bildbytes in einem Binaerkoerper.
   * Als Base64 im JSON waere ein 2K-Bild zu gross fuer die Funktion (4.5 MB).
   */
  const submitAnfrage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!result?.preview || status === 'sending') return;
    const gotcha = (new FormData(e.currentTarget).get('_gotcha') || '').toString();
    if (gotcha.trim() !== '') return; // Honeypot
    if (contact.phone.replace(/\D/g, '').length < 7) {
      setStatus('error');
      setErrorMsg('Bitte eine gültige Telefonnummer angeben.');
      return;
    }
    setStatus('sending');
    setErrorMsg('');
    const { ticket, exp, auswahl, paket, bytes } = result.preview;
    const json = new TextEncoder().encode(JSON.stringify({
      kind: 'anfrage', leadId: result.leadId, ticket, exp, auswahl, paket, mime: result.mime,
      name: contact.name.trim(), email: contact.email.trim(), telefon: contact.phone.trim(), place: contact.place.trim(),
      newsletter: contact.newsletter, consent: contact.consent, website: gotcha,
    }));
    const head = new Uint8Array(4);
    new DataView(head.buffer).setUint32(0, json.length);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', Accept: 'application/json' },
        body: new Blob([head, json, bytes]),
      });
      const answer = await res.json().catch(() => null);
      if (res.ok && answer?.ok && answer.delivery?.lead === 'accepted') {
        const known = ['accepted', 'failed', 'unknown', 'skipped'];
        setResult({
          leadId: result.leadId,
          mime: result.mime,
          dataUrl: result.dataUrl,
          delivery: {
            lead: 'accepted',
            customer: known.includes(answer.delivery.customer) ? answer.delivery.customer : 'unknown',
            newsletter: known.includes(answer.delivery.newsletter) ? answer.delivery.newsletter : undefined,
          },
        });
        setStatus('idle');
        trackLead('form', 'badplaner');
        trackBadplaner('badplaner_kontakt', { raum: room || '', paket: pkg || '' });
      } else {
        setStatus('error');
        setErrorMsg(answer?.error || friendlyHttpError(res.status));
      }
    } catch {
      setStatus('error');
      setErrorMsg('Keine Verbindung. Bitte prüfen Sie Ihr Netz und versuchen Sie es noch einmal.');
    }
  };

  const submitBeratung = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!room || beratungSubmittingRef.current) return;
    setBeratungError('');
    if (contact.phone.replace(/\D/g, '').length < 7) {
      setBeratungStatus('error');
      setBeratungError('Bitte eine gültige Telefonnummer angeben.');
      return;
    }
    beratungSubmittingRef.current = true;
    setBeratungStatus('sending');
    try {
      let file: { name: string; mime: string; data: string } | undefined;
      if (renderFailure && photo) {
        file = { name: 'badfoto.jpg', mime: photo.mime, data: photo.base64 };
      } else if (beratungFile) {
        if (beratungFile.type === 'application/pdf') {
          file = { name: beratungFile.name, mime: 'application/pdf', data: await fileToBase64(beratungFile) };
        } else {
          const img = await resizeImageFile(beratungFile, 1800, 0.85, MAX_PLAN_BASE64 - 64 * 1024);
          file = { name: beratungFile.name, mime: img.mime, data: img.base64 };
        }
      }
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          kind: 'beratung',
          raum: room,
          priorities: beratung.priorities.trim(),
          measurements: beratung.measurements.trim(),
          style: beratung.style.trim(),
          budget: beratung.budget.trim(),
          imageWanted: renderFailure ? false : beratung.imageWanted,
          renderFailure: renderFailure || undefined,
          auswahl: renderFailure ? summaryRows.map((row) => [row.label, row.value]) : undefined,
          file,
          name: contact.name.trim(),
          email: contact.email.trim(),
          telefon: contact.phone.trim(),
          newsletter: contact.newsletter,
          consent: contact.consent,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setBeratungStatus('ok');
        trackLead('form', 'badplaner-beratung');
      } else {
        setBeratungStatus('error');
        setBeratungError(json?.error || friendlyHttpError(res.status));
      }
    } catch {
      setBeratungStatus('error');
      setBeratungError('Keine Verbindung. Bitte prüfen Sie Ihr Netz und versuchen Sie es noch einmal.');
    } finally {
      beratungSubmittingRef.current = false;
    }
  };

  const takeBeratungFile = async (picked: File | null, input?: HTMLInputElement) => {
    setBeratungError('');
    setBeratungStatus('idle');
    setBeratungRetry(null);
    const fail = (message: string, retry: File | null = null) => {
      setBeratungFile(null);
      if (input) input.value = '';
      setBeratungError(message);
      setBeratungStatus('error');
      setBeratungRetry(retry);
    };
    // Sofort in den Speicher lesen, vor file.size (siehe resizeImageFile).
    let file: File | null = null;
    try {
      file = picked && await readFileNow(picked);
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Datei konnte nicht gelesen werden', picked);
    }
    const isPdf = file?.type === 'application/pdf';
    if (file && file.size > (isPdf ? MAX_PLAN_PDF_BYTES : MAX_SOURCE_IMAGE_BYTES)) {
      return fail(isPdf ? 'Das PDF ist zu gross (max. 3 MB).' : 'Das Bild ist zu gross (max. 20 MB).');
    }
    if (beratung.imageWanted && isPdf) return fail('Für ein Ideenbild benötigen wir ein Foto des Raums.');
    setBeratungFile(file);
  };
  const onBeratungFile = (e: React.ChangeEvent<HTMLInputElement>) => takeBeratungFile(e.target.files?.[0] || null, e.target);

  const submitPlan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!result || planSubmittingRef.current) return;
    setPlanError('');
    if (!planFile && !plan.sqm && !plan.note.trim()) {
      setPlanStatus('error');
      setPlanError('Bitte einen Grundriss, die Grösse oder eine Bemerkung angeben.');
      return;
    }
    planSubmittingRef.current = true;
    setPlanStatus('sending');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
    try {
      let file: { name: string; mime: string; data: string } | undefined;
      if (planFile) {
        if (planFile.type === 'application/pdf') {
          file = { name: planFile.name, mime: 'application/pdf', data: await fileToBase64(planFile) };
        } else {
          // Bilder werden wie das Foto verkleinert (Grundriss darf etwas grösser sein)
          const img = await resizeImageFile(planFile, 1800, 0.85, MAX_PLAN_BASE64 - 64 * 1024);
          file = { name: planFile.name, mime: img.mime, data: img.base64 };
        }
      }
      const res = await fetch(API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          kind: 'grundriss',
          leadId: result.leadId,
          name: contact.name.trim(),
          phone: contact.phone.trim(),
          sqm: plan.sqm || undefined,
          note: plan.note.trim() || undefined,
          file,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setPlanStatus('ok');
      } else {
        setPlanStatus('error');
        setPlanError(json?.error || friendlyHttpError(res.status));
      }
    } catch {
      setPlanStatus('error');
      setPlanError('Die Zustellung konnte nicht bestätigt werden. Bitte senden Sie die Datei per WhatsApp oder kontaktieren Sie uns direkt.');
    } finally {
      window.clearTimeout(timeout);
      planSubmittingRef.current = false;
    }
  };

  const takePlanFile = async (picked: File | null, input?: HTMLInputElement) => {
    setPlanError('');
    setPlanStatus('idle');
    setPlanRetry(null);
    const fail = (message: string, retry: File | null = null) => {
      setPlanFile(null);
      if (input) input.value = '';
      setPlanError(message);
      setPlanStatus('error');
      setPlanRetry(retry);
    };
    // Sofort in den Speicher lesen, vor file.size (siehe resizeImageFile).
    let file: File | null = null;
    try {
      file = picked && await readFileNow(picked);
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Datei konnte nicht gelesen werden', picked);
    }
    const isPdf = file?.type === 'application/pdf';
    if (file && file.size > (isPdf ? MAX_PLAN_PDF_BYTES : MAX_SOURCE_IMAGE_BYTES)) {
      return fail(isPdf ? 'Das PDF ist zu gross (max. 3 MB).' : 'Das Bild ist zu gross (max. 20 MB).');
    }
    setPlanFile(file);
  };
  const onPlanFile = (e: React.ChangeEvent<HTMLInputElement>) => takePlanFile(e.target.files?.[0] || null, e.target);

  const startOver = () => {
    setResult(null);
    setStatus('idle');
    setRenderFailure(null);
    setShowFailureConsultation(false);
    setPlanStatus('idle');
    setPlanFile(null);
    goTo(2);
  };

  // Gewählte Optionen (für Zusammenfassung, WhatsApp-Text und Kurztexte)
  const chosen = options && sel
    ? {
        look: options.looks.find((l) => l.id === sel.look),
        tile: tileList.find((t) => t.id === sel.tile),
        floor: sel.floorDifferent ? tileList.find((t) => t.id === sel.floor) : undefined,
        accentMode: options.accentModes.find((a) => a.id === sel.accentMode),
        accentPlacement: options.accentPlacements.find((a) => a.id === sel.accentPlacement),
        accent: accentList.find((a) => a.id === sel.accent),
        base: options.bases.find((b) => b.id === sel.base),
        top: options.tops.find((t) => t.id === sel.top),
        basinType: options.basinTypes.find((b) => b.id === sel.basinType),
        tapSeries: options.tapSeriesOptions.find((t) => t.id === sel.tapSeries),
        finish: options.finishes.find((f) => f.id === sel.finish),
        sanitary: options.sanitary.find((s) => s.id === sel.sanitary),
        wall: options.walls.find((w) => w.id === sel.wall),
        shower: options.showers.find((s) => s.id === sel.shower),
        bathtub: options.bathtubs.find((s) => s.id === sel.bathtub),
        basin: options.basins.find((b) => b.id === sel.basin),
        mirror: options.mirrors.find((m) => m.id === sel.mirror),
      }
    : null;

  const quoteOnly = room === 'gaeste-wc' || (!!sel && ((sel.shower === 'keine') === (sel.bathtub === 'keine')));
  const wallLabel = chosen?.wall
    ? room === 'gaeste-wc' && chosen.wall.id === 'halbhoch'
      ? 'Wände bis ca. 120 cm, oberhalb weiss gestrichen'
      : chosen.wall.label
    : '';
  // Der Preis steht erst unter dem Ideenbild (priceLine), nicht in der Auswahl.
  const packageLabel = pkgInfo ? pkgInfo.name : '';
  const priceLine = pkgInfo
    ? quoteOnly
      ? `${room === 'gaeste-wc' ? 'Gäste-WC' : 'Ihr Bad'} im Stil ${pkgInfo.name}: individuelle Offerte nach der Besichtigung.`
      : `Ihr Bad im Paket ${pkgInfo.name}: Fixpreis ab CHF ${pkgInfo.priceLabel}, inklusive Material, Montage und 8.1 % MwSt.`
    : '';

  /** Nur die Zeilen, die wirklich gewählt wurden – mit den offiziellen Namen. */
  const summaryRows: { label: string; value: string }[] = [];
  if (chosen && options && sel && pkgInfo) {
    summaryRows.push({ label: 'Raum', value: room === 'gaeste-wc' ? 'Gäste-WC' : 'Badezimmer' });
    summaryRows.push({ label: room === 'gaeste-wc' ? 'Stilrichtung' : 'Paket', value: packageLabel });
    if (isAtelier && chosen.look) summaryRows.push({ label: 'Look', value: chosen.look.label });
    if (!isAtelier && sel.format) summaryRows.push({ label: 'Format', value: `${sel.format.replace('x', '×')} cm` });
    if (chosen.tile) {
      summaryRows.push({
        label: sel.floorDifferent ? 'Platten Wand' : 'Platten',
        value: `${chosen.tile.supplier} ${chosen.tile.series} ${chosen.tile.color}`,
      });
    }
    if (chosen.floor) {
      summaryRows.push({ label: 'Platten Boden', value: `${chosen.floor.supplier} ${chosen.floor.series} ${chosen.floor.color}` });
    }
    if (isAtelier && chosen.accentMode) {
      summaryRows.push({ label: 'Materialbild', value: chosen.accentMode.label });
      if (sel.accentMode === 'kombination' && chosen.accent && chosen.accentPlacement) {
        summaryRows.push({ label: 'Akzentfläche', value: chosen.accentPlacement.label });
        summaryRows.push({ label: 'Akzentmaterial', value: `${chosen.accent.supplier} ${chosen.accent.label}` });
      }
    }
    if (chosen.wall) summaryRows.push({ label: 'Wandhöhe', value: wallLabel });
    if (chosen.shower) summaryRows.push({ label: 'Dusche', value: chosen.shower.label });
    if (chosen.bathtub) summaryRows.push({ label: 'Badewanne', value: chosen.bathtub.label });
    if (chosen.base) summaryRows.push({ label: 'Unterbau', value: `${chosen.base.supplier} ${chosen.base.label}` });
    if (chosen.top) summaryRows.push({ label: 'Waschtischplatte', value: `${chosen.top.supplier} ${chosen.top.label}` });
    if (chosen.basinType && options.basinTypes.length > 1) {
      summaryRows.push({ label: 'Waschbeckenart', value: chosen.basinType.label });
    }
    if (pkg === 'colore' && chosen.tapSeries && chosen.finish) {
      summaryRows.push({ label: 'Armaturen', value: `${chosen.tapSeries.label}, ${chosen.finish.label}` });
    } else if (isAtelier && chosen.finish) {
      summaryRows.push({ label: 'Armaturen', value: `${chosen.finish.label}, ${options.tapSeries}` });
    } else if (options.tapSeries) {
      summaryRows.push({ label: 'Armaturen', value: options.tapSeries });
    }
    if (chosen.sanitary) summaryRows.push({ label: 'Keramik', value: chosen.sanitary.label });
    if (windows) summaryRows.push({
      label: 'Fenster im Foto',
      value: windows === '0' ? 'keine' : windows === '3' ? '3 oder mehr' : windows,
    });
    if (cistern) summaryRows.push({ label: 'WC / Spülkasten', value: cistern === 'aufputz'
      ? 'Aufputz, ersetzt durch Sanitärmodul (im Fixpreis enthalten)'
      : 'Unterputz' });
    if (chosen.basin) summaryRows.push({ label: 'Waschtisch', value: chosen.basin.label });
    if (chosen.mirror) summaryRows.push({ label: 'Spiegel', value: chosen.mirror.label });
  }

  const whatsappText = `Guten Tag, ich habe im Badplaner ein Ideenbild erstellt (${packageLabel || 'Badplaner'}${chosen?.tile ? `, Platte ${chosen.tile.label}` : ''}). Können wir das besprechen?`;
  const whatsappUrl = `https://wa.me/${business.whatsapp.e164.replace('+', '')}?text=${encodeURIComponent(whatsappText)}`;

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      '@id': `${PAGE_URL}#app`,
      name: 'Badplaner von New Living Design',
      url: PAGE_URL,
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Web',
      description: 'Paket wählen, Foto vom Bad machen, Ideenbild erhalten: kostenlos und unverbindlich, aus Zofingen.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'CHF' },
      provider: { '@id': `${business.siteUrl}/#organization` },
    },
    generateFAQStructuredData(badplanerFaq),
    generateBreadcrumbStructuredData([
      { name: 'Home', url: '/' },
      { name: 'Badplaner', url: '/badplaner' },
    ]),
  ];

  const stepDone = (n: Step) => (n === 1 ? !!room && !!pkg : n === 2 ? !!pkg : n === 3 ? !!photo : !!result);
  const stepEnabled = (n: Step) => (n === 1 ? true : n === 4 ? canOpenStep4 : !!room && !!pkg);

  const renderStepHead = (n: Step, title: string, summary?: string) => (
    <button
      type="button"
      className={styles.stepHead}
      onClick={() => goTo(n)}
      disabled={!stepEnabled(n)}
      aria-expanded={step === n}
      aria-controls={`schritt-${n}-inhalt`}
    >
      <span className={styles.stepNumber}>{stepDone(n) && step !== n ? '✓' : n}</span>
      <span>
        <span className={styles.stepTitle}>{title}</span>
        {summary && step !== n && <span className={styles.stepSummary}>{summary}</span>}
      </span>
      <span className={styles.stepChevron} aria-hidden="true">⌄</span>
    </button>
  );

  const stepClass = (n: Step) => `${styles.step} ${step === n ? styles.stepOpen : ''} ${stepDone(n) ? styles.stepDone : ''}`;

  const renderPackageCards = () => (
    <div className={styles.packages} role="radiogroup" aria-label={room === 'gaeste-wc' ? 'Stilrichtung' : 'Badpaket'}>
      {bathPackages.map((p) => (
        <button
          type="button"
          key={p.id}
          role="radio"
          aria-checked={pkg === p.id}
          className={`${styles.package} ${pkg === p.id ? styles.packageSelected : ''}`}
          onClick={() => choosePackage(p.id)}
        >
          {p.highlight && <span className={styles.packageBadge}>Meistgewählt</span>}
          <span className={styles.packageName}>{p.name}</span>
          <span className={styles.packageClaim}>{p.claim}</span>
          {room === 'gaeste-wc' && <span className={styles.hint}>Die Stilwahl bestimmt Materialien und Farben, aber kein kommerzielles Badpaket.</span>}
        </button>
      ))}
    </div>
  );

  return (
    <main id="main-content" className={styles.page}>
      <SEOHead
        title="Badplaner für Badezimmer und Gäste-WC | New Living Design"
        description="Badezimmer oder Gäste-WC wählen, Materialien zusammenstellen und mit einem Foto ein persönliches Ideenbild anfragen. Aus Zofingen."
        keywords="Badplaner, Bad planen online, Badumbau Ideen, Badezimmer Visualisierung, Bad Ideenbild, Badumbau Zofingen, Badplaner kostenlos"
        url="/badplaner"
        type="website"
        structuredData={structuredData}
        image={`${business.siteUrl}${photoUrl('bad-travertin-gold-01.webp')}`}
      />

      {/* Hero: zuerst das Ergebnis, dann der Weg dahin */}
      <section className={`${styles.hero} ${styles.heroCompact}`}>
        <div className={`${styles.heroContent} ${isVisible ? styles.visible : ''}`}>
          <p className={styles.eyebrow}>Neu · Badplaner</p>
          <h1 className={styles.heroTitle}>Ihr Bad als Ideenbild, aus Ihrem eigenen Foto</h1>
          <VorherNachher />
          {/* Der Knopf gleich unter dem Bild: auf dem Telefon noch ueber dem Cookie-Streifen. */}
          <div className={styles.heroActions}>
            <a href="#planer" className={styles.ctaPrimary} onClick={() => trackBadplaner('badplaner_start')}>Jetzt starten</a>
            <a href="#ablauf" className={styles.ctaSecondary}>So funktioniert's</a>
          </div>
          <p className={styles.heroText}>Materialien wählen, Foto vom Bad hochladen: nach ein bis zwei Minuten sehen Sie Ihr Bad neu. Kostenlos und unverbindlich, aus Zofingen.</p>
          <p className={styles.heroNote}>
            Ideenbild, kein Plan: Das Bild zeigt eine Stimmung mit den gewählten Materialien. Masse, Leitungen und Details klären wir vor Ort.
          </p>
        </div>
      </section>

      {/* Planer: Schritte 1 bis 3, das Ideenbild kommt vor dem Kontakt */}
      <section id="planer" className={`${styles.section} ${styles.light}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Badplaner</span>
            <h2 className={styles.sectionTitle}>Drei Schritte bis zum Ideenbild</h2>
          </div>

          <div className={styles.steps}>
            {/* Schritt 1: Raum und Weg */}
            <article id="schritt-1" className={stepClass(1)} ref={(el) => { stepRefs.current[1] = el; }}>
              {renderStepHead(1, 'Raum und Weg wählen', room ? `${room === 'gaeste-wc' ? 'Gäste-WC' : 'Badezimmer'}${packageLabel ? ` · ${packageLabel}` : ''}` : undefined)}
              {step === 1 && (
                <div id="schritt-1-inhalt" className={styles.stepBody}>
                  <h3 className={styles.choiceTitle}>Welchen Raum möchten Sie gestalten?</h3>
                  <div className={styles.roomChoices} role="radiogroup" aria-label="Raum wählen">
                    <button type="button" role="radio" aria-checked={room === 'badezimmer'} className={`${styles.roomChoice} ${room === 'badezimmer' ? styles.roomChoiceSelected : ''}`} onClick={() => chooseRoom('badezimmer')}>
                      <strong>Badezimmer</strong><span>Mit unabhängiger Wahl von Dusche und Badewanne</span>
                    </button>
                    <button type="button" role="radio" aria-checked={room === 'gaeste-wc'} className={`${styles.roomChoice} ${room === 'gaeste-wc' ? styles.roomChoiceSelected : ''}`} onClick={() => chooseRoom('gaeste-wc')}>
                      <strong>Gäste-WC</strong><span>Ohne Dusche und Badewanne · Individuelle Offerte</span>
                    </button>
                  </div>

                  {room && (
                    <div className={styles.pathChoice}>
                      <h3 className={styles.choiceTitle}>{room === 'gaeste-wc' ? 'Stilrichtung wählen' : 'Badpaket wählen'}</h3>
                      <p className={styles.hint}>{room === 'gaeste-wc' ? 'Die Stilrichtung ist unabhängig von einem kommerziellen Paket. Für das Gäste-WC erstellen wir nach der Prüfung eine individuelle Offerte.' : 'Die bestehenden Richtpreise gelten für die vorgesehenen Paketleistungen. Neue Sonderkombinationen werden individuell offeriert.'}</p>
                      {renderPackageCards()}
                      <div className={styles.packagesFull}>
                        <button type="button" className={`${styles.package} ${styles.packageCustom} ${individuell ? styles.packageSelected : ''}`} aria-pressed={individuell} onClick={chooseIndividual}>
                          <span className={styles.packageName}>{individualPackage.name}</span>
                          <span className={styles.packagePrice}>Individuelle Offerte</span>
                          <span className={styles.packageClaim}>Direkt Beratung oder Besichtigung anfragen, ohne alle Ausstattungen zu wählen.</span>
                        </button>
                      </div>
                      {room === 'badezimmer' && <p className={styles.hint}>Richtpreise inkl. Material, Montage und MwSt. Details auf der Seite <Link to="/badumbau-zofingen#pakete">Badumbau</Link>.</p>}
                    </div>
                  )}

                  {room && individuell && (
                    <form className={styles.consultationForm} onSubmit={submitBeratung}>
                      <div className={styles.processNote}>
                        <strong>So geht es weiter</strong>
                        <span>Wir beurteilen Ihre Angaben, Fotos oder Ihre Situation zuerst telefonisch. Wenn ein Besuch sinnvoll ist, vereinbaren wir gemeinsam einen Termin. Danach erhalten Sie eine persönliche Offerte.</span>
                      </div>
                      <label className={styles.field} htmlFor="bp-priorities">
                        <span>Was möchten Sie verändern, und was ist Ihnen wichtig?</span>
                        <textarea id="bp-priorities" required rows={4} value={beratung.priorities} onChange={(e) => setBeratung({ ...beratung, priorities: e.target.value })} placeholder="Zum Beispiel mehr Stauraum, pflegeleichte Oberflächen oder eine neue Raumaufteilung" />
                      </label>
                      <label className={styles.field} htmlFor="bp-measurements">
                        <span>Masse oder Angaben zum Raum (optional)</span>
                        <textarea id="bp-measurements" rows={2} value={beratung.measurements} onChange={(e) => setBeratung({ ...beratung, measurements: e.target.value })} placeholder="Zum Beispiel Raumgrösse, vorhandene Anschlüsse oder Masse aus einer Skizze" />
                      </label>
                      <div className={styles.formRow}>
                        <label className={styles.field} htmlFor="bp-style"><span>Stilpräferenz (optional)</span><input id="bp-style" value={beratung.style} onChange={(e) => setBeratung({ ...beratung, style: e.target.value })} placeholder="Zum Beispiel ruhig, farbig oder Naturstein" /></label>
                        <label className={styles.field} htmlFor="bp-budget"><span>Budgetrahmen (optional)</span><input id="bp-budget" value={beratung.budget} onChange={(e) => setBeratung({ ...beratung, budget: e.target.value })} placeholder="Freiwillige Angabe" /></label>
                      </div>
                      <label className={styles.field} htmlFor="bp-beratung-file">
                        <span>{beratung.imageWanted ? 'Foto des Raums (erforderlich für ein Ideenbild)' : 'Foto, Masse oder Plan (optional)'}</span>
                        <input id="bp-beratung-file" type="file" accept={beratung.imageWanted ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} required={beratung.imageWanted && !beratungFile} onChange={onBeratungFile} />
                        {beratungFile && <span className={styles.hint}>Gewählt: {beratungFile.name}</span>}
                      </label>
                      <label className={styles.consent} htmlFor="bp-image-wanted">
                        <input id="bp-image-wanted" type="checkbox" checked={beratung.imageWanted} onChange={(e) => {
                          const imageWanted = e.target.checked;
                          if (imageWanted && beratungFile?.type === 'application/pdf') setBeratungFile(null);
                          setBeratung({ ...beratung, imageWanted });
                        }} />
                        <span>Ich wünsche zusätzlich ein Ideenbild. Dafür ist ein Foto des Raums nötig. Das Bild wird erst nach Prüfung der Anfrage erstellt.</span>
                      </label>
                      <div className={styles.formRow}>
                        <label className={styles.field} htmlFor="bp-consult-name"><span>Vorname und Name</span><input id="bp-consult-name" required autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></label>
                        <label className={styles.field} htmlFor="bp-consult-email"><span>E-Mail</span><input id="bp-consult-email" type="email" required autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
                      </div>
                      <label className={styles.field} htmlFor="bp-consult-phone"><span>Telefon oder WhatsApp</span><input id="bp-consult-phone" type="tel" required autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
                      <label className={styles.consent} htmlFor="bp-consult-consent"><input id="bp-consult-consent" type="checkbox" required checked={contact.consent} onChange={(e) => setContact({ ...contact, consent: e.target.checked })} /><span>Ich habe die <Link to="/datenschutz#badplaner" target="_blank" rel="noopener noreferrer">Datenschutzerklärung</Link> gelesen und stimme der Bearbeitung meiner Anfrage zu.</span></label>
                      <label className={styles.consent} htmlFor="bp-consult-news"><input id="bp-consult-news" type="checkbox" checked={contact.newsletter} onChange={(e) => setContact({ ...contact, newsletter: e.target.checked })} /><span>{NEWSLETTER_TEXT}</span></label>
                      <button type="submit" className={styles.ctaDark} disabled={beratungStatus === 'sending' || (beratung.imageWanted && !beratungFile)}>{beratungStatus === 'sending' ? 'Wird gesendet…' : 'Beratung / Besichtigung anfragen'}</button>
                      {beratung.imageWanted && !beratungFile && <p className={styles.hint}>Bitte ein Foto des Raums hinzufügen, wenn Sie ein Ideenbild wünschen.</p>}
                      {beratungStatus === 'ok' && <p className={styles.success}>Vielen Dank. Ihre Anfrage wurde übermittelt. Wir melden uns für die erste Beurteilung.</p>}
                      {beratungStatus === 'error' && <p className={styles.error} role="alert">{beratungError}</p>}
                      {beratungStatus === 'error' && !beratungFile && <DateiWaehlen id="bp-beratung-datei" onChange={onBeratungFile} onRetry={beratungRetry ? () => takeBeratungFile(beratungRetry) : undefined} />}
                    </form>
                  )}
                </div>
              )}
            </article>

            {/* Schritt 2: Stil sichtbar, Positionen als einzelne Tendinen */}
            <article id="schritt-2" className={stepClass(2)} ref={(el) => { stepRefs.current[2] = el; }}>
              {renderStepHead(
                2,
                'Ausstattung wählen',
                chosen?.tile ? `${isAtelier && chosen.look ? `${chosen.look.label} · ` : ''}${chosen.tile.label} · ${chosen.base?.label ?? ''}` : 'Platten, Möbel, Armaturen',
              )}
              {step === 2 && options && sel && chosen && (
                <div id="schritt-2-inhalt" className={styles.stepBody}>
                  <h3 className={styles.blockTitle}>Stil</h3>
                  {isAtelier ? (
                    <fieldset className={styles.group}>
                      <legend>Look <span className={styles.groupMeta}>· die Stimmung im Raum</span></legend>
                      <CardPicker name="look" large value={sel.look} onChange={chooseLook} items={options.looks.map((l) => ({ id: l.id, label: l.label, image: l.image, meta: l.description }))} />
                    </fieldset>
                  ) : <p className={styles.styleSummary}>{pkgInfo?.name}: {pkgInfo?.claim}</p>}

                  <h3 className={styles.blockTitle}>Positionen</h3>
                  <div className={styles.positionList}>
                    <PositionPanel id="wand" title="Wandplatten" summary={`${chosen.tile?.supplier ?? ''} ${chosen.tile?.series ?? ''} ${chosen.tile?.color ?? ''} · ${wallLabel}`} image={chosen.tile?.image} open={openPanel === 'wand'} onToggle={(trigger) => togglePanel('wand', trigger)}>
                      {!isAtelier && options.formats.length > 1 && <fieldset className={styles.group}><legend>Format</legend><ChipPicker name="format" value={sel.format} onChange={(id) => choose('format', id)} items={options.formats.map((f) => ({ id: f, label: `${f.replace('x', '×')} cm` }))} /></fieldset>}
                      <fieldset className={styles.group}><legend>Serie und Farbe</legend>{tileGroups.map((g) => <div className={styles.subGroup} key={g.key}><h4 className={styles.groupSub}>{g.key} <span className={styles.groupSubMeta}>{g.items[0].supplier} · {g.items.length} Optionen</span></h4><SwatchPicker name="platte" value={sel.tile} onChange={(id) => choose('tile', id)} items={g.items.map((t) => ({ id: t.id, label: t.color, image: t.image }))} /></div>)}<p className={styles.hint}>{TILE_HINT}</p></fieldset>
                      <fieldset className={styles.group}><legend>Höhe des Wandbelags</legend><ChoicePicker name="wall" value={sel.wall} onChange={(id) => choose('wall', id)} items={options.walls.map((o) => ({ id: o.id, label: room === 'gaeste-wc' && o.id === 'halbhoch' ? 'Wände bis ca. 120 cm, oberhalb weiss gestrichen' : o.label }))} /></fieldset>
                    </PositionPanel>

                    <PositionPanel id="boden" title="Bodenplatten" summary={sel.floorDifferent && chosen.floor ? `${chosen.floor.supplier} ${chosen.floor.series} ${chosen.floor.color}` : 'Gleiche Platte wie an der Wand'} image={(sel.floorDifferent ? chosen.floor : chosen.tile)?.image} open={openPanel === 'boden'} onToggle={(trigger) => togglePanel('boden', trigger)}>
                      <ChoicePicker name="bodenart" value={sel.floorDifferent ? 'anders' : 'gleich'} onChange={(id) => choose('floorDifferent', id === 'anders')} items={[{ id: 'gleich', label: 'Gleiche Platte wie an der Wand' }, { id: 'anders', label: 'Andere Bodenplatte wählen' }]} />
                      {sel.floorDifferent && <fieldset className={styles.group}><legend>Serie und Farbe für den Boden</legend>{tileGroups.map((g) => <div className={styles.subGroup} key={g.key}><h4 className={styles.groupSub}>{g.key} <span className={styles.groupSubMeta}>{g.items[0].supplier}</span></h4><SwatchPicker name="boden" value={sel.floor} onChange={(id) => choose('floor', id)} items={g.items.map((t) => ({ id: t.id, label: t.color, image: t.image }))} /></div>)}</fieldset>}
                    </PositionPanel>

                    <PositionPanel id="unterbau" title="Unterbau" summary={chosen.base ? `${chosen.base.supplier} ${chosen.base.label}` : 'Vorausgewählt'} image={chosen.base?.image} open={openPanel === 'unterbau'} onToggle={(trigger) => togglePanel('unterbau', trigger)}>
                      {baseGroups.map((g) => <div className={styles.subGroup} key={g.key}><h4 className={styles.groupSub}>{g.key} <span className={styles.groupSubMeta}>{g.items.length} Optionen</span></h4><SwatchPicker name="unterbau" value={sel.base} onChange={(id) => choose('base', id)} items={g.items.map((b) => ({ id: b.id, label: b.label, image: b.image, hex: b.hex }))} /></div>)}
                    </PositionPanel>

                    <PositionPanel id="top" title="Waschtischplatte" summary={chosen.top ? `${chosen.top.supplier} ${chosen.top.label}` : 'Vorausgewählt'} image={chosen.top?.image} open={openPanel === 'top'} onToggle={(trigger) => togglePanel('top', trigger)}>
                      {topGroups.map((g) => <div className={styles.subGroup} key={g.key}><h4 className={styles.groupSub}>{g.key}</h4><SwatchPicker name="top" value={sel.top} onChange={(id) => choose('top', id)} items={g.items.map((t) => ({ id: t.id, label: t.color, image: t.image }))} /></div>)}
                    </PositionPanel>

                    <PositionPanel id="becken" title="Waschbecken" summary={`${chosen.basinType?.label ?? ''} · ${chosen.basin?.label ?? ''}`} image={chosen.basinType?.image} open={openPanel === 'becken'} onToggle={(trigger) => togglePanel('becken', trigger)}>
                      {options.basinTypes.length > 1 && <fieldset className={styles.group}><legend>Waschbeckenart</legend><CardPicker name="becken" diagram value={sel.basinType} onChange={(id) => choose('basinType', id)} items={options.basinTypes.map((b) => ({ id: b.id, label: b.label, image: b.image, meta: [b.supplier, b.example].filter(Boolean).join(' · ') }))} /></fieldset>}
                      <fieldset className={styles.group}><legend>Konfiguration</legend><ChoicePicker name="waschtisch" value={sel.basin} onChange={(id) => choose('basin', id)} items={options.basins.filter((o) => room === 'badezimmer' || o.id === 'einzel').map((o) => ({ id: o.id, label: o.label }))} /></fieldset>
                    </PositionPanel>

                    {room === 'badezimmer' && <PositionPanel id="nassbereich" title="Dusche / Badewanne" summary={`${chosen.shower?.label ?? ''} · ${chosen.bathtub?.label ?? ''}`} open={openPanel === 'nassbereich'} onToggle={(trigger) => togglePanel('nassbereich', trigger)}>
                      <fieldset className={styles.group}><legend>Dusche</legend><ChoicePicker name="dusche" value={sel.shower} onChange={(id) => choose('shower', id)} items={options.showers.map((o) => ({ id: o.id, label: o.label }))} /></fieldset>
                      {sel.shower !== 'keine' && <p className={styles.wetAreaNote}>Bei Duschwanne und Gefälledusche werden die Wandflächen im gesamten Duschbereich bis zur Decke mit Platten belegt.</p>}
                      <fieldset className={styles.group}><legend>Badewanne</legend><ChoicePicker name="badewanne" value={sel.bathtub} onChange={(id) => choose('bathtub', id)} items={options.bathtubs.map((o) => ({ id: o.id, label: o.label }))} /></fieldset>
                      {quoteOnly && <p className={styles.quoteNote}>Diese Kombination wird als individuelle Offerte geprüft. Es wird kein zusätzlicher Raum erfunden; Umbauten bleiben in der bestehenden Nasszone.</p>}
                    </PositionPanel>}

                    <PositionPanel id="armaturen" title="Armaturen" summary={pkg === 'colore' && chosen.tapSeries && chosen.finish ? `${chosen.tapSeries.label}, ${chosen.finish.label}` : isAtelier && chosen.finish ? `${chosen.finish.label}, ${options.tapSeries}` : options.tapSeries} image={(pkg === 'colore' && chosen.tapSeries?.image) || chosen.finish?.image} open={openPanel === 'armaturen'} onToggle={(trigger) => togglePanel('armaturen', trigger)}>
                      {pkg === 'colore' && <CardPicker name="armaturenserie" value={sel.tapSeries} onChange={(id) => choose('tapSeries', id)} items={options.tapSeriesOptions.map((t) => ({ id: t.id, label: t.label, image: t.image, meta: t.shape, note: t.note }))} />}
                      {isAtelier && <div className={styles.photoCards}>{options.tapSeriesOptions.map((t) => <figure key={t.id} className={styles.card} style={{ margin: 0, cursor: 'default' }}><Swatch image={t.image} label={t.label} cover /><figcaption className={styles.cardText}><span className={styles.cardLabel}>{t.label}</span><span className={styles.cardMeta}>{t.shape}</span><span className={styles.cardNote}>{t.note}</span></figcaption></figure>)}</div>}
                      {(pkg === 'colore' || isAtelier) && <ChipPicker name="finish" value={sel.finish} onChange={(id) => choose('finish', id)} items={options.finishes.map((f) => ({ id: f.id, label: f.label, image: f.image }))} />}
                      {pkg === 'essenza' && <p className={styles.hint}>{options.tapSeries}. Im Paket enthalten, keine weitere Auswahl.</p>}
                    </PositionPanel>

                    <PositionPanel id="keramik" title="Sanitärkeramik" summary={chosen.sanitary?.label ?? 'Vorausgewählt'} image={chosen.sanitary?.image} open={openPanel === 'keramik'} onToggle={(trigger) => togglePanel('keramik', trigger)}>
                      <ChipPicker name="keramik" value={sel.sanitary} onChange={(id) => choose('sanitary', id)} items={options.sanitary.map((s) => ({ id: s.id, label: s.label, image: s.image, hex: s.hex }))} />
                    </PositionPanel>

                    <PositionPanel id="spiegel" title="Spiegel" summary={chosen.mirror?.label ?? 'Vorausgewählt'} open={openPanel === 'spiegel'} onToggle={(trigger) => togglePanel('spiegel', trigger)}>
                      <ChoicePicker name="spiegel" value={sel.mirror} onChange={(id) => choose('mirror', id)} items={options.mirrors.map((o) => ({ id: o.id, label: o.label }))} />
                    </PositionPanel>

                    {isAtelier && <PositionPanel id="akzent" title="Akzentmaterial" summary={sel.accentMode === 'kombination' && chosen.accent ? `${chosen.accentPlacement?.label}: ${chosen.accent.label}` : 'Einheitliches Materialbild'} image={sel.accentMode === 'kombination' ? chosen.accent?.image : undefined} open={openPanel === 'akzent'} onToggle={(trigger) => togglePanel('akzent', trigger)}>
                      <ChoicePicker name="kombination" value={sel.accentMode} onChange={(id) => choose('accentMode', id)} items={options.accentModes.map((a) => ({ id: a.id, label: a.label }))} />
                      {sel.accentMode === 'kombination' && <><fieldset className={styles.group}><legend>Akzentfläche</legend><ChoicePicker name="akzentflaeche" value={sel.accentPlacement} onChange={(id) => choosePlacement(id as AccentPlacementId)} items={availableAccentPlacements.map((a) => ({ id: a.id, label: a.label }))} /></fieldset>{accentGroups.map((g) => <div className={styles.subGroup} key={g.key}><h4 className={styles.groupSub}>{g.key}</h4><SwatchPicker name="akzent" value={sel.accent} onChange={(id) => choose('accent', id)} items={g.items.map((a) => ({ id: a.id, label: a.label, image: a.image }))} /></div>)}</>}
                    </PositionPanel>}
                  </div>

                  <div className={styles.stepActions}>
                    <button type="button" className={styles.ctaDark} onClick={() => goTo(3)}>Weiter zum Foto</button>
                  </div>
                </div>
              )}
            </article>

            {/* Schritt 3: Foto */}
            <article id="schritt-3" className={stepClass(3)} ref={(el) => { stepRefs.current[3] = el; }}>
              {renderStepHead(3, 'Foto und Ideenbild', result ? 'Ideenbild erstellt' : photo ? 'Foto bereit' : 'Aufnehmen oder aus der Galerie wählen')}
              {step === 3 && (
                <div id="schritt-3-inhalt" className={styles.stepBody}>
                  {photo ? (
                    <div className={styles.previewBox}>
                      <img src={photo.dataUrl} alt="Ihr Foto" className={styles.preview} />
                      <button
                        type="button"
                        className={styles.previewRemove}
                        onClick={removePhoto}
                        aria-label="Foto entfernen"
                        title="Foto entfernen"
                      >×</button>
                    </div>
                  ) : (
                    <div className={styles.upload}>
                      <p className={styles.uploadTitle}>
                        {photoBusy ? 'Foto wird vorbereitet…' : 'Foto aufnehmen oder aus der Galerie wählen'}
                      </p>
                      <div className={styles.uploadActions}>
                        <span className={styles.uploadAction}>
                          <input
                            type="file"
                            id="bp-foto-kamera"
                            className={styles.fileInput}
                            accept="image/*"
                            capture="environment"
                            onChange={onPhoto}
                            disabled={photoBusy}
                          />
                          <label className={styles.ctaDark} htmlFor="bp-foto-kamera">Foto aufnehmen</label>
                        </span>
                        <span className={styles.uploadAction}>
                          <input
                            type="file"
                            id="bp-foto-galerie"
                            className={styles.fileInput}
                            accept="image/*"
                            onChange={onPhoto}
                            disabled={photoBusy}
                          />
                          <label className={styles.ctaLight} htmlFor="bp-foto-galerie">Aus der Galerie wählen</label>
                        </span>
                      </div>
                      <span className={styles.hint}>
                        Jetzt neu aufnehmen oder ein Foto nehmen, das Sie schon haben. Am besten von der Tür aus, das ganze Bad im Bild, Licht an.
                      </span>
                    </div>
                  )}
                  {photoError && <p className={styles.error} role="alert">{photoError}</p>}
                  {photoError && <DateiWaehlen id="bp-foto-datei" onChange={onPhoto} disabled={photoBusy} onRetry={retryPhoto ? () => loadPhoto(retryPhoto) : undefined} />}
                  {photo && (
                    <>
                      <p className={styles.hint}>Am besten von der Tür aus, das ganze Bad im Bild, Licht an. Das Foto wurde auf {photo.width}×{photo.height} Pixel verkleinert.</p>
                      <fieldset className={styles.group}>
                        <legend>Wie viele Fenster sind auf dem Foto? <span className={styles.groupMeta}>· Dachfenster zählen mit</span></legend>
                        <ChipPicker name="windows" items={WINDOW_OPTIONS} value={windows} onChange={setWindows} />
                        <p className={styles.hint}>Damit das Ideenbild kein Fenster dazuerfindet: Fenster, Türen und Wände bleiben, wie sie sind.</p>
                      </fieldset>
                      <fieldset className={styles.group}>
                        <legend>Wie ist der Spülkasten beim WC eingebaut?</legend>
                        <ChipPicker name="cistern" items={CISTERN_OPTIONS} value={cistern} onChange={setCistern} />
                        <p className={styles.hint}>Aufputz: Der Spülkasten ist sichtbar, meist als Kasten über oder hinter dem WC. Unterputz: Das WC hängt an der Wand, sichtbar ist nur die Betätigungsplatte. Ein sichtbarer Spülkasten wird im Ideenbild durch das im Fixpreis enthaltene Sanitärmodul ersetzt.</p>
                      </fieldset>
                      <label className={styles.consent} htmlFor="bp-consent">
                        <input type="checkbox" id="bp-consent" name="consent" required checked={contact.consent} onChange={(e) => setContact({ ...contact, consent: e.target.checked })} />
                        <span>
                          Ich habe die <Link to="/datenschutz#badplaner" target="_blank" rel="noopener noreferrer">Datenschutzerklärung</Link> gelesen. Mein Foto wird zur
                          Erstellung des Ideenbilds an Google (Gemini API) übermittelt und uns per E-Mail zugestellt.
                        </span>
                      </label>
                      <div className={styles.stepActions}>
                        <button type="button" className={styles.ctaDark} onClick={submitRender} disabled={!windows || !cistern || !contact.consent || status === 'sending'}>
                          {status === 'sending' ? 'Wird erstellt…' : 'Ideenbild erstellen'}
                        </button>
                        {(!windows || !cistern) && <span className={styles.hint}>Bitte Fenster und Spülkasten angeben.</span>}
                      </div>
                      {status === 'sending' && (
                        <div className={styles.progress} role="status" aria-live="polite">
                          <div className={styles.progressBar}><span /></div>
                          <p className={styles.progressText}>Wir gestalten Ihr Bad und prüfen das Bild. Das dauert meist ein bis zwei Minuten, bei einem zweiten Anlauf bis zu vier; bitte lassen Sie die Seite offen.</p>
                        </div>
                      )}
                      {status === 'error' && !result && (
                        <p className={styles.error} role="alert">
                          {errorMsg} Oder rufen Sie uns an: <a href={`tel:${business.phone.e164}`} data-lead="badplaner-fehler">{business.phone.display}</a>
                        </p>
                      )}
                      {status === 'error' && renderFailure && !showFailureConsultation && (
                        <div className={styles.stepActions}>
                          <button type="button" className={styles.ctaDark} onClick={() => setShowFailureConsultation(true)}>Persönliche Beratung anfragen</button>
                        </div>
                      )}
                      {status === 'error' && renderFailure && showFailureConsultation && (
                        <form className={styles.consultationForm} onSubmit={submitBeratung}>
                          <div className={styles.processNote}>
                            <strong>Persönliche Beratung statt eines neuen Versuchs</strong>
                            <span>Wir verwenden Ihr bereits hochgeladenes Foto und Ihre gewählte Ausstattung für diese Beratungsanfrage. Es wird kein neues Ideenbild erzeugt.</span>
                          </div>
                          <label className={styles.field} htmlFor="bp-failure-priorities">
                            <span>Was ist Ihnen bei Ihrem Bad wichtig?</span>
                            <textarea id="bp-failure-priorities" required rows={3} autoFocus value={beratung.priorities} onChange={(e) => setBeratung({ ...beratung, priorities: e.target.value })} />
                          </label>
                          <div className={styles.formRow}>
                            <label className={styles.field} htmlFor="bp-failure-name"><span>Vorname und Name</span><input id="bp-failure-name" required autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></label>
                            <label className={styles.field} htmlFor="bp-failure-email"><span>E-Mail</span><input id="bp-failure-email" type="email" required autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
                          </div>
                          <label className={styles.field} htmlFor="bp-failure-phone"><span>Telefon oder WhatsApp</span><input id="bp-failure-phone" type="tel" required autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
                          <label className={styles.consent} htmlFor="bp-failure-consent"><input id="bp-failure-consent" type="checkbox" required checked={contact.consent} onChange={(e) => setContact({ ...contact, consent: e.target.checked })} /><span>Ich habe die <Link to="/datenschutz#badplaner" target="_blank" rel="noopener noreferrer">Datenschutzerklärung</Link> gelesen und stimme der Bearbeitung meiner Anfrage zu.</span></label>
                          <label className={styles.consent} htmlFor="bp-failure-news"><input id="bp-failure-news" type="checkbox" checked={contact.newsletter} onChange={(e) => setContact({ ...contact, newsletter: e.target.checked })} /><span>{NEWSLETTER_TEXT}</span></label>
                          <button type="submit" className={styles.ctaDark} disabled={beratungStatus === 'sending'}>{beratungStatus === 'sending' ? 'Wird gesendet…' : 'Persönliche Beratung anfragen'}</button>
                          {beratungStatus === 'ok' && <p className={styles.success}>Vielen Dank. Ihre Anfrage wurde übermittelt. Wir melden uns bei Ihnen.</p>}
                          {beratungStatus === 'error' && <p className={styles.error} role="alert">{beratungError}</p>}
                        </form>
                      )}
                      <div className={`${styles.uploadActions} ${styles.changePhoto}`}>
                        <span className={styles.uploadAction}>
                          <input
                            type="file"
                            id="bp-foto-kamera-neu"
                            className={styles.fileInput}
                            accept="image/*"
                            capture="environment"
                            onChange={onPhoto}
                            disabled={photoBusy}
                          />
                          <label className={styles.ctaLight} htmlFor="bp-foto-kamera-neu">Neues Foto aufnehmen</label>
                        </span>
                        <span className={styles.uploadAction}>
                          <input
                            type="file"
                            id="bp-foto-galerie-neu"
                            className={styles.fileInput}
                            accept="image/*"
                            onChange={onPhoto}
                            disabled={photoBusy}
                          />
                          <label className={styles.ctaLight} htmlFor="bp-foto-galerie-neu">Anderes Foto aus der Galerie</label>
                        </span>
                      </div>
                      {photoBusy && <p className={styles.hint}>Foto wird vorbereitet…</p>}
                    </>
                  )}
                </div>
              )}
            </article>

          </div>
        </div>
      </section>

      {/* Ergebnis + Schritt 5 */}
      {result && pkgInfo && (
        <section id="ergebnis" className={`${styles.section} ${styles.dark}`}>
          <div className={styles.container}>
            <div className={styles.result} ref={resultRef}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>Ihr Ideenbild</span>
                <h2 className={styles.sectionTitle}>{result.preview ? 'Ihr Ideenbild ist fertig' : 'So könnte Ihr Bad aussehen'}</h2>
              </div>
              <div className={result.preview ? styles.watermark : undefined}>
                <img src={result.dataUrl} alt={`Ideenbild Ihres Bads im Paket ${pkgInfo.name}`} className={styles.resultImage} />
              </div>
              <span className={styles.badge}>{result.preview ? 'Vorschau · Ideenbild, kein Plan' : 'Ideenbild, kein Plan'}</span>
              {result.preview ? (
                <form className={styles.extra} onSubmit={submitAnfrage}>
                  <h3>In voller Qualität per E-Mail, dazu eine kostenlose Beratung</h3>
                  <p>Wir schicken Ihnen das Ideenbild ohne Wasserzeichen, nennen den Fixpreis des Pakets und melden uns für ein kurzes Gespräch. Unverbindlich.</p>
                  <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className={styles.honeypot} aria-hidden="true" />
                  <div className={styles.formRow}>
                    <label className={styles.field} htmlFor="bp-name">
                      <span>Vorname und Name</span>
                      <input type="text" id="bp-name" name="name" required autoComplete="name" placeholder="Vorname und Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                    </label>
                    <label className={styles.field} htmlFor="bp-email">
                      <span>E-Mail</span>
                      <input type="email" id="bp-email" name="email" required autoComplete="email" placeholder="name@beispiel.ch" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                    </label>
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.field} htmlFor="bp-phone">
                      <span>Telefon oder WhatsApp</span>
                      <input type="tel" id="bp-phone" name="telefon" required autoComplete="tel" placeholder="+41 ..." value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                    </label>
                    <label className={styles.field} htmlFor="bp-place">
                      <span>PLZ / Ort</span>
                      <input type="text" id="bp-place" name="place" required autoComplete="postal-code" placeholder="z. B. 4800 Zofingen" value={contact.place} onChange={(e) => setContact({ ...contact, place: e.target.value })} />
                    </label>
                  </div>
                  <label className={styles.consent} htmlFor="bp-newsletter">
                    <input type="checkbox" id="bp-newsletter" name="newsletter" checked={contact.newsletter} onChange={(e) => setContact({ ...contact, newsletter: e.target.checked })} />
                    <span>{NEWSLETTER_TEXT}</span>
                  </label>
                  <div className={styles.stepActions}>
                    <button type="submit" className={styles.ctaPrimary} disabled={status === 'sending'}>
                      {status === 'sending' ? 'Wird gesendet…' : 'Ideenbild und Beratung erhalten'}
                    </button>
                  </div>
                  {status === 'error' && (
                    <p className={styles.error} role="alert">
                      {errorMsg} Oder rufen Sie uns an: <a href={`tel:${business.phone.e164}`} data-lead="badplaner-fehler">{business.phone.display}</a>
                    </p>
                  )}
                </form>
              ) : (<>
              <p className={styles.priceLine}>{priceLine}</p>
              {result.delivery && result.delivery.customer !== 'accepted' && (
                <p className={styles.resultNote} role="status">
                  <strong>Hinweis:</strong> Ihre Anfrage wurde an uns weitergeleitet, aber Ihre E-Mail-Kopie konnte nicht bestätigt werden. Bitte speichern Sie das Ideenbild jetzt mit „Bild speichern“.
                </p>
              )}
              <div className={styles.compare}>
                <figure>
                  <img src={photo?.dataUrl} alt="Ihr Foto (vorher)" />
                  <figcaption>Vorher: Ihr Foto</figcaption>
                </figure>
                <figure>
                  <img src={result.dataUrl} alt="Ideenbild (nachher)" />
                  <figcaption>Nachher: Ideenbild</figcaption>
                </figure>
              </div>
              <ul className={styles.summary}>
                {summaryRows.map((row) => (
                  <li key={row.label}><span>{row.label}</span><span>{row.value}</span></li>
                ))}
              </ul>
              <div className={styles.resultActions}>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={styles.ctaPrimary} data-lead="badplaner-ergebnis">Per WhatsApp besprechen</a>
                <a href={result.dataUrl} download={`ideenbild-${pkgInfo.id}.${result.mime === 'image/jpeg' ? 'jpg' : 'png'}`} className={styles.ctaSecondary}>Bild speichern</a>
                <Link to="/kontakt" className={styles.ctaSecondary}>Termin in der Ausstellung</Link>
              </div>
              <p className={styles.resultNote}>
                Ihre Angaben wurden an uns weitergeleitet. Wir melden uns innerhalb eines Arbeitstages. Das Ideenbild zeigt eine Stimmung mit den gewählten Materialien;
                Masse, Leitungen und Details klären wir vor Ort.{' '}
                <button type="button" onClick={startOver}>Andere Farben oder ein anderes Paket probieren</button> (bis zu fünf Ideenbilder pro Tag).
              </p>
              </>)}
            </div>

            {/* Schritt 5: Grundriss (optional), erst nach der Anfrage */}
            {!result.preview && <form className={styles.extra} onSubmit={submitPlan}>
              <h3>Für eine genauere Einschätzung</h3>
              <p>Optional: Grundriss, Grösse und Wünsche. Damit können wir den Richtpreis vor der Besichtigung besser einschätzen.</p>
              {planStatus === 'ok' ? (
                <p className={styles.success}>Danke, wir melden uns innerhalb eines Arbeitstages.</p>
              ) : (
                <>
                  <div className={styles.formRow}>
                    <label className={styles.field} htmlFor="bp-plan-file">
                      <span>Grundriss (JPEG, PNG, WebP bis 20 MB; PDF bis 3 MB)</span>
                      <input type="file" id="bp-plan-file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onPlanFile} />
                      {planFile && <span className={styles.hint}>Gewählt: {planFile.name}</span>}
                    </label>
                    <label className={styles.field} htmlFor="bp-plan-sqm">
                      <span>Bad-Grösse in m²</span>
                      <input type="number" id="bp-plan-sqm" inputMode="decimal" min="1" max="200" step="0.5" placeholder="z. B. 6.5" value={plan.sqm} onChange={(e) => setPlan({ ...plan, sqm: e.target.value })} />
                    </label>
                  </div>
                  <label className={styles.field} htmlFor="bp-plan-note">
                    <span>Bemerkung</span>
                    <textarea id="bp-plan-note" rows={3} placeholder="Alter des Bads, Wünsche, Zeitpunkt" value={plan.note} onChange={(e) => setPlan({ ...plan, note: e.target.value })} />
                  </label>
                  <div className={styles.stepActions}>
                    <button type="submit" className={styles.ctaPrimary} disabled={planStatus === 'sending'}>
                      {planStatus === 'sending' ? 'Wird gesendet…' : 'Senden'}
                    </button>
                  </div>
                  {planStatus === 'error' && <p className={styles.error} role="alert">{planError}</p>}
                  {planStatus === 'error' && !planFile && <DateiWaehlen id="bp-plan-datei" onChange={onPlanFile} onRetry={planRetry ? () => takePlanFile(planRetry) : undefined} />}
                </>
              )}
            </form>}
          </div>
        </section>
      )}

      {/* So funktioniert's */}
      <section id="ablauf" className={`${styles.section} ${styles.dark}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>So funktioniert's</span>
            <h2 className={styles.sectionTitle}>Drei Schritte, ein Ideenbild</h2>
          </div>
          <ol className={styles.how}>
            {howSteps.map((s) => (
              <li key={s.n} className={styles.howStep}>
                <span className={styles.stepNumber}>{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className={styles.center}>
            <a href="#planer" className={styles.ctaPrimary} onClick={() => trackBadplaner('badplaner_start')}>Jetzt starten</a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className={`${styles.section} ${styles.light}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Häufige Fragen</span>
            <h2 className={styles.sectionTitle}>Fragen zum Badplaner</h2>
          </div>
          <div className={styles.faq}>
            {badplanerFaq.map((item) => (
              <details key={item.question} className={styles.faqItem}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
          <p className={styles.hint} style={{ textAlign: 'center', marginTop: '2rem' }}>
            Lieber direkt sprechen? <a href={`tel:${business.phone.e164}`} data-lead="badplaner-faq">{business.phone.display}</a> oder{' '}
            <a
              href={`https://wa.me/${business.whatsapp.e164.replace('+', '')}?text=${encodeURIComponent('Guten Tag, ich interessiere mich für Ihre Produkte und eine Beratung in Ihrer Ausstellung. Können Sie mich kontaktieren?')}`}
              target="_blank"
              rel="noopener noreferrer"
              data-lead="badplaner-faq"
            >WhatsApp</a>.
          </p>
        </div>
      </section>
    </main>
  );
};

/** Verständliche Meldung, wenn die API keinen Text liefert. */
/**
 * Ausweg, wenn die Fotoauswahl von Android eine Datei nicht hergibt (Foto nur
 * in Google Fotos, umgerechnetes Foto). Ohne accept="image/*" öffnet Chrome den
 * Dateimanager statt der Fotoauswahl; das Format prüft resizeImageFile.
 */
function DateiWaehlen({ id, onChange, disabled, onRetry }: { id: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; disabled?: boolean; onRetry?: () => void }) {
  return (
    <>
      <p className={styles.hint}>Foto zuerst auf das Handy herunterladen oder einen Screenshot davon wählen.</p>
      <div className={`${styles.uploadActions} ${styles.changePhoto}`}>
        {onRetry && <button type="button" className={styles.ctaLight} onClick={onRetry} disabled={disabled}>Nochmals versuchen</button>}
        <span className={styles.uploadAction}>
          <input type="file" id={id} className={styles.fileInput} onChange={onChange} disabled={disabled} />
          <label className={styles.ctaLight} htmlFor={id}>Datei wählen</label>
        </span>
      </div>
    </>
  );
}

function friendlyHttpError(status: number): string {
  if (status === 413) return 'Das Bild ist zu gross für den Upload. Bitte ein kleineres Foto wählen.';
  if (status === 429) return 'Tageslimit erreicht (3 Ideenbilder). Rufen Sie uns an oder kommen Sie in die Ausstellung.';
  if (status === 503) return 'Der Badplaner ist im Moment nicht verfügbar.';
  return 'Das hat nicht geklappt. Bitte in einer Minute noch einmal versuchen.';
}

export default Badplaner;
