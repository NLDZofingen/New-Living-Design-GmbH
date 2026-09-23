/**
 * Referenzen: ausgeführte Projekte von New Living Design.
 * Fotos liegen in public/referenzen/ (WebP, 1600 px, plus *.thumb.webp 640 px).
 * Ort und Jahr sind optional und werden nur angezeigt, wenn gesetzt.
 */

export type ReferenceCategory = 'bad' | 'kueche' | 'gaeste-wc' | 'wohnraum' | 'ausstellung';

export interface ReferencePhoto {
  file: string;   // Dateiname in public/referenzen/
  alt: string;
}

export interface Reference {
  id: string;
  title: string;
  category: ReferenceCategory;
  summary: string;      // ein Satz für Raster und Google
  details: string[];    // Materialien, Produkte, Besonderheiten
  location?: string;    // Gemeinde, z. B. "Zofingen"
  year?: string;        // z. B. "2025"
  photos: ReferencePhoto[];
}

export const categoryLabels: Record<ReferenceCategory, string> = {
  bad: 'Bäder',
  kueche: 'Küchen',
  'gaeste-wc': 'Gäste-WC',
  wohnraum: 'Wohnräume',
  ausstellung: 'Ausstellung',
};

export const photoUrl = (file: string, thumb = false): string =>
  `/referenzen/${thumb ? file.replace('.webp', '.thumb.webp') : file}`;

export const references: Reference[] = [
  {
    id: 'bad-marmoroptik-grau-schwarz',
    title: 'Bad in grauer Marmoroptik mit schwarzen Armaturen',
    category: 'bad',
    summary: 'Grossformatige Platten in grauer Marmoroptik, schwarze Badewanne, Regenpaneel und Waschtisch aus Mineralwerkstoff auf gerilltem Möbel.',
    details: [
      'Wand- und Bodenplatten in grauer Marmoroptik mit braunen Adern, gleiche Platte im Duschbereich',
      'Badewanne schwarz matt mit Wandarmatur und Handbrause in Schwarz',
      'Dusche mit Regenpaneel aus der Wand, Nische in der Platte, Glastrennwand schwarz',
      'Aufsatzwaschtisch oval in Stein-Optik, Möbel mit gerillter Front, Abdeckung aus Mineralwerkstoff',
      'Spiegel oval mit Hinterleuchtung und Spot, Zubehör schwarz matt',
    ],
    photos: [
      { file: 'bad-marmor-grau-01.webp', alt: 'Waschtisch mit ovalem Spiegel und Dusche, Platten in grauer Marmoroptik' },
      { file: 'bad-marmor-grau-02.webp', alt: 'Badezimmer in grauer Marmoroptik mit schwarzen Armaturen und Badewanne' },
      { file: 'bad-marmor-grau-03.webp', alt: 'Schwarze Badewanne mit Wandarmatur vor Marmorplatten' },
      { file: 'bad-marmor-grau-04.webp', alt: 'Dusche mit schwarzem Regenpaneel und Nische in Marmoroptik' },
      { file: 'bad-marmor-grau-05.webp', alt: 'Ovaler Aufsatzwaschtisch mit schwarzer Armatur auf gerilltem Möbel' },
      { file: 'bad-marmor-grau-06.webp', alt: 'Hinterleuchteter ovaler Spiegel über dem Waschtisch' },
      { file: 'bad-marmor-grau-07.webp', alt: 'Detail schwarze Waschtischarmatur und Waschtisch in Steinoptik' },
    ],
  },
  {
    id: 'dusche-zellige-petrol-messing',
    title: 'Dusche mit Zellige-Platten in Petrol und Messing',
    category: 'bad',
    summary: 'Handglasierte Platten 10×10 in Petrol, Duschsäule und Armaturen in Messing, Waschtisch grün matt auf Stahlkonsole mit Holz.',
    details: [
      'Zellige-Platten 10×10 cm in Petrol, jede Platte etwas anders: lebendige Wand ohne zwei gleiche Stücke',
      'Walk-in-Dusche mit Glaswand, Ablagenische über die ganze Breite, Duschsäule Messing',
      'Aufsatzwaschtisch grün matt auf schwarzer Stahlkonsole mit Handtuchhalter, Ablage in Holz',
      'Waschtischarmatur Messing, Spiegel organisch geformt',
      'Duschboden mit Mosaik in Gold-Braun',
    ],
    photos: [
      { file: 'dusche-zellige-petrol-01.webp', alt: 'Waschtisch grün matt mit Messingarmatur vor Zellige-Platten in Petrol' },
      { file: 'dusche-zellige-petrol-02.webp', alt: 'Walk-in-Dusche mit Messing-Duschsäule und Zellige-Platten' },
      { file: 'dusche-zellige-petrol-03.webp', alt: 'Dusche mit Glaswand, Nische und Platten in Petrol' },
      { file: 'dusche-zellige-petrol-04.webp', alt: 'Regenbrause aus Messing vor Platten in Petrol' },
    ],
  },
  {
    id: 'bad-marmoroptik-blau-weiss',
    title: 'Bad in blauer Marmoroptik mit weissen Möbeln',
    category: 'bad',
    summary: 'Wandplatten in Marmoroptik blau-gold, weisser Waschtisch mit Möbel, Spiegelschrank mit Licht und bodenebene Dusche.',
    details: [
      'Akzentwand mit Platten in blau-goldener Marmoroptik, übrige Wände hell',
      'Waschtisch mit Möbel weiss, Spiegelschrank mit Beleuchtung',
      'Bodenebene Dusche mit Glaswand, Wand-WC mit Betätigungsplatte',
      'Boden in heller Steinoptik',
    ],
    photos: [
      { file: 'bad-marmor-blau-01.webp', alt: 'Badezimmer mit blauer Marmoroptik, weissem Waschtischmöbel und Spiegelschrank' },
      { file: 'bad-marmor-blau-02.webp', alt: 'Dusche mit Glaswand und Platten in blauer Marmoroptik' },
      { file: 'bad-marmor-blau-03.webp', alt: 'Wand-WC und Waschtisch vor blauer Marmorwand' },
    ],
  },
  {
    id: 'bad-marmoroptik-beige-grossformat',
    title: 'Badumbau mit Grossformat-Platten in beiger Marmoroptik',
    category: 'bad',
    summary: 'Wände und Boden in beiger Marmoroptik im Grossformat, Doppelwaschtisch mit Möbel, bodenebene Dusche und Wand-WC.',
    details: [
      'Grossformat-Platten in Marmoroptik beige-braun an Wänden und Boden, wenig Fugen',
      'Doppelwaschtisch mit Möbel in Greige, zwei Spiegel mit Licht',
      'Bodenebene Dusche mit Glaswand, Nische, Handbrause und Regenbrause',
      'Wand-WC mit Betätigungsplatte, Wände in warmem Grau',
    ],
    photos: [
      { file: 'bad-marmor-beige-01.webp', alt: 'Doppelwaschtisch mit Möbel und zwei Spiegeln vor beiger Marmorwand' },
      { file: 'bad-marmor-beige-02.webp', alt: 'Badezimmer mit Platten in beiger Marmoroptik und Fenster' },
      { file: 'bad-marmor-beige-03.webp', alt: 'Waschtischmöbel mit Spiegel in Marmoroptik-Bad' },
      { file: 'bad-marmor-beige-04.webp', alt: 'Bodenebene Dusche mit Glaswand und Nische in beiger Marmoroptik' },
      { file: 'bad-marmor-beige-05.webp', alt: 'Wand-WC mit Betätigungsplatte vor Grossformat-Platten' },
    ],
  },
  {
    id: 'bad-travertinoptik-gold',
    title: 'Bad in Travertin-Optik mit goldenen Armaturen',
    category: 'bad',
    summary: 'Platten in Travertin-Optik an Wand und Boden, Waschtisch mit Möbel und Spiegelschrank, Duschsäule und Armaturen in Gold.',
    details: [
      'Wände und Boden in Travertin-Optik, durchgehend bis in die Dusche',
      'Waschtisch als Aufsatzschale auf Möbel mit Steinabdeckung, Spiegelschrank mit Lichtband',
      'Walk-in-Dusche mit Glaswand, Duschsäule und Armaturen in Gold',
      'Wand-WC mit Betätigungsplatte, Deckenspots',
    ],
    photos: [
      { file: 'bad-travertin-gold-01.webp', alt: 'Badezimmer in Travertin-Optik mit goldenen Armaturen und Spiegelschrank' },
      { file: 'bad-travertin-gold-02.webp', alt: 'Waschtisch mit Aufsatzschale und goldener Armatur, Dusche im Hintergrund' },
    ],
  },
  {
    id: 'dusche-mosaik-gold',
    title: 'Dusche mit Goldmosaik und Messingarmaturen',
    category: 'bad',
    summary: 'Duschrückwand aus Goldmosaik, Glaswand rahmenlos, Duschsäule und Waschtischarmatur in Messing.',
    details: [
      'Rückwand der Dusche mit Mosaik in Gold, seitliche Wände hell',
      'Rahmenlose Glaswand, Duschsäule Messing mit Regenbrause',
      'Waschtisch weiss mit Messingarmatur, Boden in Betonoptik',
    ],
    photos: [
      { file: 'dusche-mosaik-gold-01.webp', alt: 'Dusche mit Goldmosaik-Rückwand und Messing-Duschsäule' },
      { file: 'dusche-mosaik-gold-02.webp', alt: 'Glaswand und Goldmosaik in der Dusche, Waschtisch mit Messingarmatur' },
    ],
  },
  {
    id: 'nassbereich-dekorwand-messing',
    title: 'Dusche mit Dekorwand und Messing',
    category: 'bad',
    summary: 'Wasserfeste Dekorwand mit floralem Motiv in der Dusche, Metallic-Platten, Duschsäule und Stabilisator in Messing, Boden in Petrol.',
    details: [
      'Dekorwand mit floralem Motiv, wasserfest verarbeitet, als Rückwand der Dusche',
      'Seitenwand mit Platten in Metallic-Optik, Nische für Ablage',
      'Duschsäule mit Regenbrause und Glaswand mit Stabilisator, alles in Messing',
      'Boden in Petrol, Sockel abgestimmt',
    ],
    photos: [
      { file: 'dusche-dekor-messing-01.webp', alt: 'Dusche mit floraler Dekorwand, Metallic-Platten und Messing-Duschsäule' },
    ],
  },
  {
    id: 'gaeste-bad-steinoptik',
    title: 'Kleines Bad in Steinoptik mit Dusche',
    category: 'gaeste-wc',
    summary: 'Kompaktes Bad mit Platten in grauer Steinoptik, Dusche mit Glaswand, Wand-WC, Waschtisch mit Möbel und rundem Spiegel.',
    details: [
      'Platten in grauer Steinoptik an Wand und Boden, hell und pflegeleicht',
      'Dusche mit Glaswand am Fenster, Wand-WC mit Betätigungsplatte',
      'Waschtisch mit Möbel, runder Spiegel mit Beleuchtung, Handtuchradiator',
    ],
    photos: [
      { file: 'gaeste-bad-steinoptik-01.webp', alt: 'Kleines Bad mit Dusche, Wand-WC und rundem Spiegel in Steinoptik' },
    ],
  },
  {
    id: 'gaeste-wc-holzoptik-gold',
    title: 'Gäste-WC mit Boden in Holzoptik und goldener Armatur',
    category: 'gaeste-wc',
    summary: 'Gäste-WC mit hellen Wandplatten, Boden in Holzoptik, kleinem Waschtisch mit goldener Armatur und rundem Spiegel.',
    details: [
      'Wände in heller Steinoptik, Boden in Holzoptik',
      'Handwaschbecken mit goldener Armatur, runder Spiegel mit Licht',
      'Wand-WC mit Betätigungsplatte, Zubehör abgestimmt',
    ],
    photos: [
      { file: 'gaeste-wc-holzoptik-01.webp', alt: 'Gäste-WC mit Handwaschbecken, goldener Armatur und Boden in Holzoptik' },
    ],
  },
  {
    id: 'kueche-insel-messing',
    title: 'Küche mit Insel, gerillter Front und Messing-Leuchten',
    category: 'kueche',
    summary: 'Grifflose Küche in Grau-Braun matt, Kochinsel mit Abdeckung in schwarzer Marmoroptik und gerillter Front, beleuchtete Vitrine, Pendelleuchten Messing.',
    details: [
      'Fronten grifflos, matt in Grau-Braun; Hochschrankzeile mit Backofen und Mikrowelle',
      'Kochinsel mit Induktion, Abdeckung und Wange in schwarzer Marmoroptik, Front gerillt in Holz',
      'Vitrine mit LED-Beleuchtung, Rückwand in dunkler Steinoptik',
      'Pendelleuchten aus Rauchglas und Messing, Barhocker in Cognac',
      'Boden in Marmoroptik grau-braun',
    ],
    photos: [
      { file: 'kueche-insel-messing-01.webp', alt: 'Küche mit Kochinsel in schwarzer Marmoroptik und Messing-Pendelleuchten' },
      { file: 'kueche-insel-messing-02.webp', alt: 'Grifflose Küche in Grau-Braun mit Insel und Barhockern' },
      { file: 'kueche-insel-messing-03.webp', alt: 'Küchenzeile mit beleuchteter Vitrine und Einbaugeräten' },
      { file: 'kueche-insel-messing-04.webp', alt: 'Kochinsel mit Induktionsfeld und Pendelleuchten' },
      { file: 'kueche-insel-messing-05.webp', alt: 'Detail Vitrine mit LED-Licht und Hochschränke' },
    ],
  },
  {
    id: 'wohnraum-boden-marmoroptik',
    title: 'Wohnraum mit Boden in Marmoroptik',
    category: 'wohnraum',
    summary: 'Wohnzimmer mit Grossformat-Boden in Marmoroptik grau-braun, glänzend verlegt, mit passender Deckenleuchte.',
    details: [
      'Grossformat-Platten in Marmoroptik, glänzend, wenig Fugen',
      'Sockelleisten abgestimmt, Deckenleuchte mit Ringen',
    ],
    photos: [
      { file: 'wohnraum-boden-marmor-01.webp', alt: 'Wohnzimmer mit glänzendem Boden in Marmoroptik' },
    ],
  },
  {
    id: 'ausstellung-zofingen',
    title: 'Unsere Ausstellung in Zofingen',
    category: 'ausstellung',
    summary: 'Doppelwaschtisch mit Aufsatzschalen, ovale Spiegel mit Hinterleuchtung und Wand in grüner Onyx-Optik, zu sehen Im Römerquartier 4A.',
    details: [
      'Wand in grüner Onyx-Optik mit Kupferadern',
      'Zwei ovale Spiegel mit Rahmen in Bronze und Hinterleuchtung',
      'Aufsatzschalen rund in Greige, Armaturen Messing, Möbel mit gerillter Front',
    ],
    location: 'Zofingen',
    photos: [
      { file: 'ausstellung-zofingen-01.webp', alt: 'Ausstellung New Living Design Zofingen: Doppelwaschtisch mit ovalen Spiegeln und Onyx-Wand' },
    ],
  },
];

export const referenceById = (id: string): Reference | undefined => references.find((r) => r.id === id);

/** Bewusste, kurze Auswahl; die vollständigen Referenzen bleiben unverändert. */
const homeReferenceIds = ['bad-marmoroptik-grau-schwarz', 'dusche-zellige-petrol-messing', 'wohnraum-boden-marmoroptik'];
export const homeReferencePhotos = homeReferenceIds.flatMap((id) => {
  const reference = referenceById(id);
  return reference?.photos[0] ? [{ reference, photo: reference.photos[0] }] : [];
});
