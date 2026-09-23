/**
 * Einzige Quelle für Firmendaten (NAP: Name, Adresse, Telefon), Öffnungszeiten,
 * Einzugsgebiet, Badpakete und Tracking-IDs.
 *
 * Alle Seiten, Footer, Kontakt und die strukturierten Daten (JSON-LD) lesen von hier.
 * Änderungen bitte NUR hier vornehmen, damit Website, Google Unternehmensprofil und
 * Bing Places dieselben Angaben zeigen.
 */

export const business = {
  legalName: 'New Living Design GmbH',
  name: 'New Living Design',
  siteUrl: 'https://newlivingdesign.ch',

  address: {
    street: 'Im Römerquartier 4A',
    zip: '4800',
    city: 'Zofingen',
    region: 'AG',
    regionName: 'Aargau',
    country: 'CH',
  },

  // Anzeige / tel:-Link. Hauptnummer wie im Google Unternehmensprofil; zweite Festnetzlinie nur auf der Kontaktseite.
  phone: { display: '062 544 58 54', e164: '+41625445854' },
  phoneSecondary: { display: '062 544 58 53', e164: '+41625445853' },
  mobileEmanuel: { display: '+41 76 605 13 07', e164: '+41766051307', label: 'Emanuel Verdile, Mobile' },
  whatsapp: { display: '+41 76 743 84 30', e164: '+41767438430' },
  email: 'emanuel.verdile@newlivingdesign.ch',
  emailSecondary: 'diego.verdile@newlivingdesign.ch',

  geo: { lat: 47.2842067, lng: 7.9477531 },
  mapsLink: 'https://maps.app.goo.gl/ZyhcBb3qb2JXkgny9',
  reviewLink: 'https://g.page/r/CRpjLLSpgbnwEBM/review',

  openingHours: [
    { days: 'Montag – Freitag', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '07:00', closes: '19:00' },
    { days: 'Samstag', dayOfWeek: ['Saturday'], opens: '09:00', closes: '13:00' },
  ],
  openingHoursNote: 'Termin nach Vereinbarung, auch ausserhalb der Öffnungszeiten.',

  social: {
    facebook: 'https://www.facebook.com/NewLDGMBH/',
    instagram: 'https://www.instagram.com/new_living_design/',
    linkedin: 'https://www.linkedin.com/in/diego-verdile-56727064/',
  },

  // Einzugsgebiet: ca. 40 km um Zofingen (wie im Google Unternehmensprofil)
  areaServed: [
    'Zofingen', 'Strengelbach', 'Brittnau', 'Oftringen', 'Reiden', 'Aarburg', 'Safenwil',
    'Olten', 'Aarau', 'Sursee', 'Langenthal', 'Reinach AG', 'Lenzburg', 'Willisau',
    'Rothrist', 'Kölliken', 'Schöftland',
  ],

  // Formspree-Formular (Kontakt und Badumbau-Anfrage)
  formspreeEndpoint: 'https://formspree.io/f/xdklvgpb',

  // Tracking – wird NUR nach Einwilligung im Cookie-Banner geladen (siehe utils/tracking.ts)
  ga4MeasurementId: 'G-S2MFTL82PC',
  metaPixelId: '783872098922670',
} as const;

export interface BathPackage {
  id: 'essenza' | 'colore' | 'atelier';
  name: string;
  price: number;        // CHF inkl. MwSt., Richtpreis
  priceLabel: string;   // formatiert, z. B. "23'000"
  claim: string;
  description: string;
  includes: string[];
  duration: string;
  extraPerSqm: number;  // CHF pro zusätzlichem m² Platten über 21 m²
  highlight?: boolean;
}

/**
 * Die drei Badpakete (Stand 10.09.2026). Referenzbad: ca. 6 m², ca. 21 m² Plattenfläche,
 * Dusche, Wand-WC, Waschtisch mit Möbel. Preise inkl. Material, Montage und 8.1 % MwSt.
 */
export const bathPackages: BathPackage[] = [
  {
    id: 'essenza',
    name: 'Essenza',
    price: 23000,
    priceLabel: "23'000",
    claim: 'Das saubere, solide Bad mit dem ersten Farbtupfer',
    description:
      'Alles, was ein neues Bad braucht, mit Markenprodukten aus unserer Ausstellung. Farbe der Platten, des Möbels und der Armaturen wählen Sie frei innerhalb der Serie.',
    includes: [
      'Platten 30×60 oder 60×60 cm, Farbe frei wählbar innerhalb der Serie (ca. 21 m²)',
      'Wand-WC weiss mit Sanitärmodul Oli QR',
      'Badmöbel 80 cm, lackiert in einer Farbe nach Wahl, mit Waschtisch',
      'Spiegelschrank Pirovano 60 cm',
      'Duschwanne, Fixglas und Duschrinne',
      'Aufputz-Armaturen für Waschtisch und Dusche (Thermostat), Oberfläche nach Wahl',
      'Zubehör, Kleinmaterial, Schalter',
      'Demontage, Sanitär, Elektro, Gips, Plattenarbeiten, Maler, Entsorgung durch NLD',
    ],
    duration: '2 bis 3 Wochen',
    extraPerSqm: 200,
  },
  {
    id: 'colore',
    name: 'Colore',
    price: 27500,
    priceLabel: "27'500",
    claim: 'Grossformat, farbige Keramik und Armaturen in Ihrer Wunschoberfläche',
    description:
      'Unser meistgewähltes Bad: Platten 60×120 oder 120×120, WC und Duschwanne in Farbe, verchromte Armaturen in zwei Serien, Möbel matt lackiert. Farbe kostet bei uns nichts extra.',
    includes: [
      'Platten 60×120 oder 120×120 cm rektifiziert, Farbe und Struktur frei wählbar (ca. 21 m²)',
      'Farbiges Wand-WC der Serie mit Oli QR und Betätigungsplatte nach Wahl',
      'Badmöbel 100 cm, matt lackiert in Wunschfarbe',
      'Spiegelschrank Pirovano 90 cm, zwei Türen',
      'Farbige Duschwanne, Walk-in-Glas und Duschrinne',
      'Armaturen: Serie Up+ (rund) oder Ran (eckig) und Oberfläche nach Wahl',
      'Abgestimmtes Zubehör, Kleinmaterial, Schalter',
      '3D-Rendering in Ihrer Farbwahl vor der Unterschrift',
      'Demontage bis Übergabe durch NLD, Entsorgung inklusive',
    ],
    duration: '2 bis 3 Wochen',
    extraPerSqm: 240,
    highlight: true,
  },
  {
    id: 'atelier',
    name: 'Atelier',
    price: 36500,
    priceLabel: "36'500",
    claim: 'Das Bad nach Mass: freistehend, edle Materialien, auf Zeichnung',
    description:
      'Für grössere Bäder und besondere Wünsche: Grossformate oder Steinoptik, freistehende Badewanne, Möbel nach Mass, Designarmaturen und Lichtkonzept. Bemusterung in der Ausstellung.',
    includes: [
      'Grossformat oder Steinoptik, auch 120×120 cm (ca. 21 m²)',
      'Design-WC in Farbe mit Oli QR',
      'Freistehende Badewanne oder bodenebene Dusche',
      'Möbel nach Mass, Abdeckung in Stein oder Keramik',
      'Spiegel mit integriertem Licht',
      'Unterputz-Designarmaturen, Oberfläche nach Wahl (PVD)',
      'Beleuchtung, Nischen, Designradiator, Zubehör',
      '3D-Rendering und Bemusterung in der Ausstellung',
      'Demontage bis Übergabe durch NLD, ein Ansprechpartner',
    ],
    duration: 'ca. 3 Wochen',
    extraPerSqm: 290,
  },
];

/**
 * Vierte Karte im Badplaner: Bäder ausserhalb der Pakete. Ohne Preis; wer sie
 * wählt, gibt danach das nächstgelegene Paket als Grundlage an. Bewusst nicht
 * Teil von `bathPackages`, damit Startseite, Badumbau und Blog weiterhin die
 * drei Pakete mit Fixpreis zeigen.
 */
export const individualPackage = {
  id: 'individuell',
  name: 'Individuelle Lösung',
  claim: 'Bäder ausserhalb der Pakete, nach Budget.',
  question: 'Welchem Paket kommt Ihre Idee am nächsten?',
} as const;

export const packageNote =
  'Richtpreise inkl. Material, Montage und 8.1 % MwSt. für ein Referenzbad von ca. 6 m² mit ca. 21 m² Plattenfläche. Der verbindliche Fixpreis gilt nach Besichtigung und Aufmass vor Ort. Zusatzarbeiten und grössere Flächen werden vor der Freigabe ausgewiesen.';

/** Öffnungszeiten als schema.org OpeningHoursSpecification */
export const openingHoursSpecification = business.openingHours.map((h) => ({
  '@type': 'OpeningHoursSpecification',
  dayOfWeek: h.dayOfWeek,
  opens: h.opens,
  closes: h.closes,
}));

/** LocalBusiness-Knoten, den jede Seite einbetten kann */
export const localBusinessJsonLd = {
  '@context': 'https://schema.org',
  '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'],
  '@id': `${business.siteUrl}/#organization`,
  name: business.legalName,
  alternateName: business.name,
  url: business.siteUrl,
  telephone: business.phone.e164,
  email: business.email,
  image: `${business.siteUrl}/og-image.jpg`,
  logo: `${business.siteUrl}/logo.png`,
  priceRange: "CHF 23'000 – 45'000",
  address: {
    '@type': 'PostalAddress',
    streetAddress: business.address.street,
    postalCode: business.address.zip,
    addressLocality: business.address.city,
    addressRegion: business.address.region,
    addressCountry: business.address.country,
  },
  geo: { '@type': 'GeoCoordinates', latitude: business.geo.lat, longitude: business.geo.lng },
  hasMap: business.mapsLink,
  openingHoursSpecification,
  areaServed: business.areaServed.map((name) => ({ '@type': 'City', name })),
  sameAs: [business.social.facebook, business.social.instagram, business.social.linkedin],
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: business.phone.e164,
    contactType: 'customer service',
    availableLanguage: ['de', 'it', 'en'],
  },
};
