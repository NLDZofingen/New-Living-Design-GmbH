/**
 * Katalog: Bereiche > Fachgebiete > Marken > Serien > Bilder (Startseite, /produkte, /partner).
 *
 * Daten in src/data/catalog.json (auch von scripts/routes.mjs für Prerender und Sitemap gelesen).
 * Aktive Marken und Kategorien: verbindliche Liste von NLD (Stand 23.09.2026).
 * Websites aus dem Quellenregister des NLD-Medienpakets vom 22.09.2026.
 * Nur echte, freigegebene Fotos; Lücken: docs/KATALOG_FORNITORI_V3.md.
 */
import catalog from './catalog.json';

export type AreaId = 'bad' | 'kuechen' | 'platten' | 'wellness';

export type SupplierImage = { src: string; srcSet?: string; width: number; height: number; alt: string };

type RawImage = { pack?: string; asset?: string; width: number; height: number; alt: string; sha1?: string };

// Dateien aus src/assets per Name (Vite liefert die gehashte URL).
const assetUrls = import.meta.glob<string>('../assets/*.{webp,jpg,jpeg,png,avif}', { eager: true, query: '?url', import: 'default' });

// Medienpaket: grösste WebP-Datei als src, 960w-Variante für kleinere Viewports.
const toImage = (raw: RawImage): SupplierImage => {
  if (raw.pack) {
    const base = `/images/${raw.pack}`;
    const src = `${base}-${raw.width}w.webp`;
    // 960w-Variante gibt es nur für Bilder, die breiter sind (nie vergrössert).
    return { src, srcSet: raw.width > 960 ? `${base}-960w.webp 960w, ${src} ${raw.width}w` : undefined, width: raw.width, height: raw.height, alt: raw.alt };
  }
  const src = assetUrls[`../assets/${raw.asset}`];
  if (!src) throw new Error(`catalog.json: Datei fehlt in src/assets: ${raw.asset}`);
  return { src, width: raw.width, height: raw.height, alt: raw.alt };
};

export type Area = { id: AreaId; title: string; label: string; text: string; groups: { title: string; brands: SupplierKey[] }[] };
/** extra: Einzelbild ohne vollständige Serie, Abschnitt «Weitere Bilder» */
export type Series = { name: string; area: AreaId; images: SupplierImage[]; extra?: boolean };

export type SupplierKey = keyof typeof catalog.suppliers;

export const areas = catalog.areas as Area[];

export type Supplier = {
  key: SupplierKey;
  name: string;
  url: string;
  series: Series[];
  /** alle Bilder der Marke über alle Serien */
  images: SupplierImage[];
  /** Bereiche mit Fachgebieten laut NLD-Liste */
  areas: { id: AreaId; title: string; specialties: string[] }[];
};

export const suppliers: Supplier[] = (Object.keys(catalog.suppliers) as SupplierKey[]).map((key) => {
  const raw = catalog.suppliers[key] as { name: string; url: string; series: { name: string; area: string; images: RawImage[]; extra?: boolean }[] };
  const series = raw.series.map((s) => ({ name: s.name, area: s.area as AreaId, images: s.images.map(toImage), ...(s.extra ? { extra: true } : {}) }));
  return {
    key,
    name: raw.name,
    url: raw.url,
    series,
    images: series.flatMap((s) => s.images),
    areas: areas.flatMap((area) => {
      const specialties = area.groups.filter((g) => g.brands.includes(key)).map((g) => g.title);
      return specialties.length ? [{ id: area.id, title: area.title, specialties }] : [];
    }),
  };
});

export const supplierByKey = (key: SupplierKey): Supplier => suppliers.find((s) => s.key === key)!;
export const areaById = (id: string): Area | undefined => areas.find((a) => a.id === id);
export const suppliersInArea = (area: AreaId): Supplier[] => suppliers.filter((s) => s.areas.some((a) => a.id === area));
export const seriesInArea = (s: Supplier, area: AreaId): Series[] => s.series.filter((x) => x.area === area);

/** Markenseite; ohne Bereich der erste Bereich mit Serienbildern, sonst der erste Bereich der Marke. */
export const supplierHref = (key: SupplierKey, area?: AreaId) => {
  const s = supplierByKey(key);
  return `/produkte/${area ?? s.series[0]?.area ?? s.areas[0].id}/${key}`;
};
export const areaHref = (area: AreaId) => `/produkte/${area}`;
/** Sprungmarke eines Fachgebiets auf der Bereichsseite, z. B. «Badmöbel» → badmoebel. */
export const groupSlug = (title: string) => title.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Einzelbilder nach Marke, für Seiten, die ein bestimmtes Bild zeigen (Startseite, /produkte). */
export const imageOf = (key: SupplierKey, seriesName?: string, index = 0): SupplierImage => {
  const s = supplierByKey(key);
  const series = seriesName ? s.series.find((x) => x.name === seriesName) : s.series[0];
  if (!series?.images[index]) throw new Error(`Kein Bild für ${key} ${seriesName ?? ''} #${index}`);
  return series.images[index];
};
