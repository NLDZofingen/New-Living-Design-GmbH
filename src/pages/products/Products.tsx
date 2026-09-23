import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Products.module.css';
import wandverkleidungenImage from '../../assets/Inediti_05_HP_desktop.webp';
import armaturenImage from '../../assets/Newform_Deltazero_P2.webp';
import sanitaerapparateImage from '../../assets/Ambiente-Set-5.webp';
import heizkoerperImage from '../../assets/image.avif';
import beleuchtungenImage from '../../assets/BEAM_STICK_family_color_edited.avif';
import accessoiresImage from '../../assets/viv-au2420bmset5_5.avif';
import { SEOHead } from '../../components';
import { photoUrl, referenceById } from '../../data/references';
import { areaHref, imageOf, supplierByKey, supplierHref, suppliersInArea, type AreaId, type SupplierImage, type SupplierKey } from '../../data/suppliers';

// Herstellerbilder aus dem NLD-Medienpaket vom 22.09.2026; Zuordnung zur Marke in src/data/suppliers.ts.
type SubcategoryCard = {
  id?: string;
  title: string;
  supplier: SupplierKey;
  image: SupplierImage;
};

const heroes = {
  bad: imageOf('edone'),
  kuechen: imageOf('febal', 'Origina', 0),
  wellness: imageOf('novellini', 'Home Oasis'),
  platten: imageOf('emilgroup'),
};

const cards: Record<keyof typeof heroes, SubcategoryCard[]> = {
  bad: [
    { id: 'badmoebel', title: 'Badmöbel', supplier: 'froidevaux', image: imageOf('froidevaux') },
    { id: 'armaturen', title: 'Armaturen', supplier: 'gessi', image: imageOf('gessi') },
    { id: 'sanitaerkeramik', title: 'Sanitärkeramik', supplier: 'cielo', image: imageOf('cielo') },
    { id: 'duschen', title: 'Duschen & Duschabtrennungen', supplier: 'vismaravetro', image: imageOf('vismaravetro') },
    { id: 'accessoires', title: 'Badaccessoires', supplier: 'capannoli', image: imageOf('capannoli') },
    { id: 'designheizkoerper', title: 'Designheizkörper', supplier: 'antrax', image: imageOf('antrax') },
    { title: 'Designheizkörper', supplier: 'cordivari', image: imageOf('cordivari') },
  ],
  kuechen: [
    { id: 'kuechenwelten', title: 'Küchenwelten', supplier: 'febal', image: imageOf('febal', 'Origina', 1) },
  ],
  wellness: [
    { id: 'whirlpool', title: 'Whirlpool & Minipool', supplier: 'novellini', image: imageOf('novellini', 'Moon') },
    { title: 'Whirlpool & Minipool', supplier: 'albatros', image: imageOf('albatros') },
    { id: 'sauna', title: 'Sauna', supplier: 'novellini', image: imageOf('novellini', 'Fun Sauna') },
    { id: 'hammam', title: 'Hammam & Dampfbad', supplier: 'megius', image: imageOf('megius') },
  ],
  platten: [
    { id: 'grossformate', title: 'Grossformate & Marmoroptik', supplier: 'lafabbrica', image: imageOf('lafabbrica') },
    { id: 'mosaik', title: 'Mosaik', supplier: 'sicis', image: imageOf('sicis', 'Elegance') },
    { id: 'parkett', title: 'Parkett & Holz', supplier: 'skema', image: imageOf('skema') },
    { id: 'spc', title: 'SPC & Designböden', supplier: 'zenon', image: imageOf('zenon') },
    { title: 'SPC & Designböden', supplier: 'deco', image: imageOf('deco') },
    { id: 'wandbelaege', title: 'Dekorative Wandbeläge & Tapeten', supplier: 'inkiostro', image: imageOf('inkiostro') },
    { id: 'naturstein', title: 'Mosaik', supplier: 'mosavit', image: imageOf('mosavit') },
  ],
};

const HERO_SIZES = '(max-width: 1024px) calc(100vw - 3rem), 680px';

const SubcategoryGrid: React.FC<{ items: SubcategoryCard[]; label: string; area: AreaId }> = ({ items, label, area }) => {
  const brands = suppliersInArea(area);
  return (
    <>
      <ul className={styles['subcategory-grid']} aria-label={label}>
        {items.map((card) => (
          <li key={card.image.src} id={card.id} className={styles['subcategory-card']}>
            <figure>
              <img {...card.image} sizes="(max-width: 1024px) 50vw, 300px" loading="lazy" decoding="async" />
              <figcaption>
                <h4 className={styles['subcategory-title']}>{card.title}</h4>
                <Link to={supplierHref(card.supplier, area)} className={styles['subcategory-brand']}>{supplierByKey(card.supplier).name}</Link>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      {/* Alle Marken des Bereichs, auch ohne Bild; jede öffnet ihre Angaben im Markenverzeichnis */}
      <div className={styles['area-brands']}>
        <p className={styles['area-brands-title']}><Link to={areaHref(area)}>Marken und Serien</Link> <span>{brands.length}</span></p>
        <ul>
          {brands.map((s) => (
            <li key={s.key}><Link to={supplierHref(s.key, area)}>{s.name}</Link>{s.images.length > 0 && <span aria-label={`${s.images.length} ${s.images.length === 1 ? 'Bild' : 'Bilder'}`}>{s.images.length}</span>}</li>
          ))}
        </ul>
      </div>
    </>
  );
};

const Products: React.FC = () => {
  // Eigenes Projektbild statt des Ausstellungsbilds der Startseite
  const heroFile = 'bad-travertin-gold-01.webp';
  const heroAlt = referenceById('bad-travertinoptik-gold')?.photos.find((p) => p.file === heroFile)?.alt ?? '';

  return (
    <main id="main-content" className={styles['products-page']}>
      <SEOHead
        title="Bad, Küchen, Platten & Wellness | New Living Design Zofingen"
        description="Badmöbel, Küchen, Platten und Wellness in Zofingen vergleichen. Persönliche Auswahlberatung, 3D-Planung sowie Lieferung und Montage."
        keywords="Badmöbel Zofingen, Küchenplanung Zofingen, Küchenmontage, Keramikplatten kaufen, Wellnesskabine, Ausstellung Zofingen, Schweiz"
        url="/produkte"
        type="website"
        image="https://newlivingdesign.ch/assets/14264-rchi-mirabilia-villas-01.webp"
      />

      {/* Hero: echte Ausstellung in Zofingen statt Symbolbild */}
      <section className={styles.hero}>
        <div className={styles['hero-content']}>
          <h1 className={styles['hero-title']}>
            <span className={styles['title-line']}>Bad, Küchen, Platten</span>
            <span>&amp; Wellness.</span>
          </h1>
          <div className={styles['hero-description']}>
            <p>
              Eine Auswahl, die zusammenpasst.
            </p>
          </div>
          <p className={styles['hero-scroll-indicator']}>Scrollen Sie nach unten</p>
        </div>
        <figure className={styles['hero-figure']}>
          <img
            src={photoUrl(heroFile)}
            srcSet={`${photoUrl(heroFile, true)} 480w, ${photoUrl(heroFile)} 1200w`}
            sizes="(max-width: 767px) 100vw, 45vw"
            alt={heroAlt}
            width="1200"
            height="1600"
            fetchPriority="high"
          />
        </figure>
      </section>

      {/* Introduction Section */}
      <section className={`${styles.introduction}`}>
        <div className={styles['introduction-container']}>
          <div className={styles['section-header']}>
            <span className={styles['section-label']}>Ausstellung in Zofingen</span>
            <h2 className={styles['section-title']}>Nicht möglichst viel. Sondern das, was zusammenpasst.</h2>
          </div>
          <div className={styles['introduction-content']}>
            <p>
              Ein stimmiger Raum entsteht nicht durch möglichst viele Produkte. Entscheidend ist, dass Proportionen,
              Farben, Oberflächen und Nutzung zusammenpassen.
            </p>
            <p>
              In unserer Ausstellung vergleichen Sie Farben, Oberflächen und Formate direkt am Material.
            </p>
          </div>
        </div>
      </section>

      {/* Product Categories */}
      <section className={styles['product-categories']}>
        <div className={styles['categories-container']}>
          {/* Badmöbel */}
          <div id="bad" className={`${styles['category-section']} ${styles.light}`}>
            <div className={styles['category-content']}>
              <div className={styles['category-text']}>
                <h3 className={styles['category-title']}>Badprodukte gemeinsam auswählen</h3>
                <div className={styles['category-description']}>
                  <p>
                    Wir wählen mit Ihnen Badmöbel, Waschtisch, WC, Armaturen, Dusche, Badewanne und Zubehör als
                    gemeinsame Kombination aus. Dabei achten wir auf Masse, Materialien, Farben und die tägliche Nutzung.
                    Neben Serienmöbeln zeigen wir auch massgefertigte Lösungen aus Corian® und Korakril™.
                  </p>
                  <ul className={styles['category-highlights']} aria-label="Bad-Sortiment">
                    <li>Badmöbel</li><li>Waschtische</li><li>Armaturen</li><li>Keramik</li><li>Duschen</li><li>Badewannen</li>
                  </ul>
                  <Link to="/kontakt" className={styles['category-link']}>Badberatung anfragen</Link>
                </div>
              </div>
              <div className={styles['category-image']}>
                <img {...heroes.bad} sizes={HERO_SIZES} />
              </div>
            </div>
            <SubcategoryGrid items={cards.bad} label="Bad-Kategorien" area="bad" />
          </div>

          {/* Küchen */}
          <div id="kuechen" className={`${styles['category-section']} ${styles.dark} ${styles.reverse}`}>
            <div className={styles['category-content']}>
              <div className={styles['category-text']}>
                <h3 className={styles['category-title']}>Eine Küche, die im Alltag funktioniert</h3>
                <div className={styles['category-description']}>
                  <p>
                    Eine Küche muss morgens, beim Kochen und mit Gästen funktionieren. Wir planen Raumaufteilung,
                    Stauraum, Fronten, Arbeitsfläche, Geräte und Licht als Ganzes. Mit der 3D-Visualisierung sehen Sie
                    Proportionen und Materialien vor der Bestellung. Lieferung, Montage und die Renovation der
                    bestehenden Küche koordinieren wir nach Bedarf.
                  </p>
                  <ul className={styles['category-highlights']} aria-label="Küchenleistungen">
                    <li>Planung &amp; 3D</li><li>Lieferung</li><li>Montage</li><li>Renovation</li>
                  </ul>
                  <Link to="/kontakt" className={styles['category-link']}>Küchenberatung anfragen</Link>
                </div>
              </div>
              <div className={styles['category-image']}>
                <img {...heroes.kuechen} sizes={HERO_SIZES} />
              </div>
            </div>
            <SubcategoryGrid items={cards.kuechen} label="Küchen-Kategorien" area="kuechen" />
          </div>

          {/* Wellness */}
          <div id="wellness" className={`${styles['category-section']} ${styles.light}`}>
            <div className={styles['category-content']}>
              <div className={styles['category-text']}>
                <h3 className={styles['category-title']}>Wellness beginnt mit den Möglichkeiten des Raums</h3>
                <div className={styles['category-description']}>
                  <p>
                    Sauna, Dampfbad, Wellnesskabine oder Whirlwanne benötigen die passende Fläche und die richtigen
                    Anschlüsse. Wir klären zuerst Raum, Nutzung und technische Voraussetzungen. Danach wählen wir mit
                    Ihnen eine Ausführung, die zu Ihrem Alltag und Ihrem Budget passt.
                  </p>
                  <p>
                    Wellness sehen Sie bei uns in der Ausstellung in Zofingen.
                  </p>
                  <ul className={styles['category-highlights']} aria-label="Wellness-Sortiment">
                    <li>Sauna</li><li>Dampf</li><li>Wellnesskabinen</li><li>Whirlwannen</li>
                  </ul>
                  <Link to="/kontakt" className={styles['category-link']}>Wellness-Beratung anfragen</Link>
                </div>
              </div>
              <div className={styles['category-image']}>
                <img {...heroes.wellness} sizes={HERO_SIZES} />
              </div>
            </div>
            <SubcategoryGrid items={cards.wellness} label="Wellness-Kategorien" area="wellness" />
          </div>

          {/* Platten */}
          <div id="platten" className={`${styles['category-section']} ${styles.dark} ${styles.reverse}`}>
            <div className={styles['category-content']}>
              <div className={styles['category-text']}>
                <h3 className={styles['category-title']}>Platten für Wand, Boden und Aussenbereich</h3>
                <div className={styles['category-description']}>
                  <p>
                    Platten bestimmen nicht nur die Farbe eines Raums, sondern auch Fugenbild, Pflege und Trittsicherheit.
                    Vergleichen Sie Keramik, Feinsteinzeug, Mosaik und Grossformate direkt am Muster – von kleinen Formaten
                    bis zu grossen Platten für durchgehende Flächen. Für Terrassen und andere Aussenbereiche beraten wir
                    Sie auch zu geeigneten rutschhemmenden Oberflächen.
                  </p>
                  <ul className={styles['category-highlights']} aria-label="Platten-Sortiment">
                    <li>Keramik</li><li>Feinsteinzeug</li><li>Mosaik</li><li>Grossformate</li><li>Outdoor</li>
                  </ul>
                  <Link to="/kontakt" className={styles['category-link']}>Plattenberatung anfragen</Link>
                </div>
              </div>
              <div className={styles['category-image']}>
                <img {...heroes.platten} sizes={HERO_SIZES} />
              </div>
            </div>
            <SubcategoryGrid items={cards.platten} label="Platten-Kategorien" area="platten" />
          </div>

          {/* Weitere Themen: ruhiges Raster statt sechs gleich gewichteter Vollbreiten-Abschnitte.
              Die drei 380x347-Bilder werden nie breiter als ihre Originalgrösse gezeigt (siehe .detail-small). */}
          <div className={styles.details}>
            {/* Wandverkleidungen */}
            <article className={styles.detail}>
              <img src={wandverkleidungenImage} alt="Wohnraum mit gemusterter Wandverkleidung" width="1400" height="787" loading="lazy" decoding="async" />
              <h3 className={styles['category-title']}>Nicht jede Wand braucht dieselbe Oberfläche</h3>
              <p>Neben Keramik bieten wir Glasfaser- und Vinyltapeten, Holzverkleidungen, Mosaik und Vetrite. Wir zeigen Ihnen, welche Oberfläche für den jeweiligen Raum geeignet ist und wie sie sich mit Boden, Möbeln und Licht kombinieren lässt.</p>
            </article>
            {/* Armaturen */}
            <article className={styles.detail}>
              <img src={armaturenImage} alt="Schwarze Wannenarmatur mit Handbrause auf einer dunklen Steinfläche" width="1400" height="989" loading="lazy" decoding="async" />
              <h3 className={styles['category-title']}>Form und Oberfläche konsequent weiterführen</h3>
              <p>Rund oder eckig, verchromt, schwarz, gebürstet oder in einer PVD-Oberfläche: Wir stimmen Waschtisch-, Dusch- und Wannenarmaturen auf Keramik, Möbel und Zubehör ab. Dabei berücksichtigen wir Bedienung, Anschlüsse und Pflege ebenso wie die Gestaltung.</p>
            </article>
            {/* Sanitärapparate */}
            <article className={styles.detail}>
              <img src={sanitaerapparateImage} alt="Wandhängendes WC und Bidet in Schwarz neben einem Waschtischmöbel aus Holz" width="1400" height="1000" loading="lazy" decoding="async" />
              <h3 className={styles['category-title']}>Keramik und Ausstattung passend zum Raum</h3>
              <p>Unser Sortiment umfasst Waschtische, WCs, Dusch-WCs, Badewannen, Duschwannen und Duschlösungen. Wir achten darauf, dass Masse, Anschlüsse und Nutzung zur Raumsituation passen und die einzelnen Produkte eine gemeinsame Linie bilden.</p>
            </article>
            {/* Heizkörper */}
            <article className={`${styles.detail} ${styles['detail-small']}`}>
              <img src={heizkoerperImage} alt="Vertikaler Designheizkörper in einem Wohnraum" width="380" height="347" loading="lazy" decoding="async" />
              <h3 className={styles['category-title']}>Wärme, Format und Anschluss zusammen planen</h3>
              <p>Handtuch- und Designheizkörper sind in unterschiedlichen Grössen, Formen und Farben erhältlich. Wir stimmen Modell, Heizleistung und Anschlussposition auf den Raum und die übrige Ausstattung ab.</p>
            </article>
            {/* Beleuchtungen */}
            <article className={`${styles.detail} ${styles['detail-small']}`}>
              <img src={beleuchtungenImage} alt="Zylindrische Pendelleuchten in Schwarz mit Messingdetails" width="380" height="347" loading="lazy" decoding="async" />
              <h3 className={styles['category-title']}>Licht für Alltag und Atmosphäre</h3>
              <p>Gutes Licht am Spiegel erfüllt eine andere Aufgabe als die Beleuchtung des gesamten Raums. Wir kombinieren Funktions- und Stimmungslicht passend zu Oberflächen, Farben und Nutzung.</p>
            </article>
            {/* Accessoires */}
            <article className={`${styles.detail} ${styles['detail-small']}`}>
              <img src={accessoiresImage} alt="Schwarzer Wandhalter mit zwei Seifenspendern" width="380" height="347" loading="lazy" decoding="async" />
              <h3 className={styles['category-title']}>Die letzte Auswahl soll nicht zufällig sein</h3>
              <p>Handtuchhalter, Papierrollenhalter, Haken, Seifenhalter und weitere Accessoires führen Form und Oberfläche der Armaturen weiter. So wirkt der Raum bis ins Detail abgestimmt.</p>
            </article>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={`${styles['cta-section']}`}>
        <div className={styles['cta-container']}>
          <div className={styles['cta-content']}>
            <h2 className={styles['cta-title']}>Bringen Sie mit, was Sie bereits haben.</h2>
            <p className={styles['cta-description']}>
              Fotos, Grundriss, Masse, ein Materialmuster oder nur eine erste Idee: Wir beginnen dort, wo Ihr Projekt
              heute steht, und stellen mit Ihnen die nächsten Entscheidungen zusammen.
            </p>
            <div className={styles['cta-buttons']}>
              <Link to="/kontakt" className={`${styles['cta-button']} ${styles.primary}`}>
                <span>Auswahlberatung anfragen</span>
                <svg className={styles['cta-arrow']} viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <Link to="/dienstleistungen" className={`${styles['cta-button']} ${styles.secondary}`}>
                <span>Dienstleistungen ansehen</span>
                <svg className={styles['cta-arrow']} viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Produktkategorien von New Living Design",
          "itemListElement": [
            { name: "Badmöbel, Armaturen und Keramik", anchor: "bad" },
            { name: "Küchenplanung, Lieferung, Montage und Renovation", anchor: "kuechen" },
            { name: "Platten für Wand, Boden und Aussenbereich", anchor: "platten" },
            { name: "Wellness für Ihr Zuhause", anchor: "wellness" }
          ].map((cat, i) => ({
            "@type": "ListItem",
            "position": i + 1,
            "name": cat.name,
            "url": `https://newlivingdesign.ch/produkte#${cat.anchor}`
          }))
        }) }} />
    </main>
  );
};

export default Products;
