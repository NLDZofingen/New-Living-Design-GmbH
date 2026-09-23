import React from 'react';
import { Link } from 'react-router-dom';
import { SEOHead } from '../../components';
import { business, bathPackages, localBusinessJsonLd } from '../../config/business';
import { homeReferencePhotos, photoUrl, referenceById } from '../../data/references';
import { areaById, areaHref, areas, imageOf, supplierHref, suppliers, suppliersInArea, type AreaId, type SupplierImage, type SupplierKey } from '../../data/suppliers';
import styles from './Home.module.css';

const kitchen = referenceById('kueche-insel-messing');
const heroRef = referenceById('bad-marmoroptik-grau-schwarz');
const heroPhoto = heroRef?.photos.find((p) => p.file === 'bad-marmor-grau-02.webp');

type Shot = { image: SupplierImage; supplier?: SupplierKey; credit?: { label: string; href: string } };
type Chapter = { id: AreaId; more: string; main: Shot; side: Shot[] };

const kitchenImage: SupplierImage = { src: photoUrl('kueche-insel-messing-01.webp'), srcSet: `${photoUrl('kueche-insel-messing-01.webp', true)} 480w, ${photoUrl('kueche-insel-messing-01.webp')} 900w`, width: 900, height: 1600, alt: 'Realisierte Küche mit Insel, Messingdetails und Einbaugeräten' };

// Vier Bereiche als Kapitel: ein Hauptbild, zwei Nebenbilder; jeder Bildnachweis führt zur Marke im Katalog.
const chapters: Chapter[] = [
  { id: 'bad', more: 'Bad ansehen',
    main: { image: imageOf('edone'), supplier: 'edone' }, side: [{ image: imageOf('gessi'), supplier: 'gessi' }, { image: imageOf('cielo'), supplier: 'cielo' }] },
  { id: 'kuechen', more: 'Küchen ansehen',
    main: { image: kitchenImage, credit: { label: kitchen?.title ?? 'Referenzen', href: '/referenzen#kueche-insel-messing' } }, side: [{ image: imageOf('febal', 'Origina', 0), supplier: 'febal' }, { image: imageOf('febal', 'Origina', 1), supplier: 'febal' }] },
  { id: 'platten', more: 'Platten ansehen',
    main: { image: imageOf('lafabbrica'), supplier: 'lafabbrica' }, side: [{ image: imageOf('sicis', 'Elegance'), supplier: 'sicis' }, { image: imageOf('skema'), supplier: 'skema' }] },
  { id: 'wellness', more: 'Wellness ansehen',
    main: { image: imageOf('novellini', 'Home Oasis'), supplier: 'novellini' }, side: [{ image: imageOf('megius'), supplier: 'megius' }, { image: imageOf('albatros'), supplier: 'albatros' }] },
];

// Bildnachweis führt zur Marke im Bereich des Kapitels (Megius/Novellini haben Bad- und Wellness-Seiten).
const creditOf = (shot: Shot, area: AreaId) => shot.credit ?? (shot.supplier ? { label: suppliers.find((x) => x.key === shot.supplier)?.name ?? '', href: supplierHref(shot.supplier, area) } : undefined);

const Figure: React.FC<{ shot: Shot; area: AreaId; sizes: string; className?: string }> = ({ shot, area, sizes, className }) => {
  const credit = creditOf(shot, area);
  return (
    <figure className={className}>
      <img {...shot.image} sizes={sizes} loading="lazy" decoding="async" />
      {credit && <figcaption>{shot.supplier ? 'Marke' : 'Referenz'}: <Link to={credit.href}>{credit.label}</Link></figcaption>}
    </figure>
  );
};

const Home: React.FC = () => {
  const showroomImage = photoUrl('ausstellung-zofingen-01.webp');
  return (
    <main id="main-content" className={styles.home}>
      <SEOHead title="Bad, Küchen, Platten & Wellness in Zofingen | New Living Design"
        description="Bad, Küchen, Platten und Wellness in Zofingen: Materialien vergleichen, persönlich beraten lassen und Bad oder Küche auf Wunsch in 3D planen."
        keywords="Bad Zofingen, Küchen Zofingen, Küchenplanung, Badmöbel, Platten, Keramikplatten, Wellness, Ausstellung Zofingen, New Living Design"
        url="/" type="website" structuredData={localBusinessJsonLd} image={`${business.siteUrl}${showroomImage}`} />

      {/* Hero: vollflächiges Projektbild, Typografie-Panel ragt in den nächsten Abschnitt */}
      <section className={styles.hero} aria-labelledby="home-title">
        <figure className={styles.heroFigure}>
          <img src={photoUrl('bad-marmor-grau-02.webp')} alt={heroPhoto?.alt ?? ''} width="1600" height="1102" fetchPriority="high" />
          {heroRef && <figcaption><Link to={`/referenzen#${heroRef.id}`}>{heroRef.title}</Link></figcaption>}
        </figure>
        <div className={styles.heroPanel}>
          <p className={styles.eyebrow}><span className={styles.dot} /> Ausstellung in Zofingen</p>
          <h1 id="home-title" className={styles.heroTitle}>Bad, Küchen, Platten &amp; Wellness.</h1>
          <p className={styles.heroLead}>Nicht einzeln ausgesucht. Als Raum gedacht.</p>
          <p className={styles.heroText}>Wir kombinieren Materialien, Farben und Produkte so, dass sie zu Ihrem Raum, Ihrem Stil und Ihrem Budget passen. Wir beraten Sie persönlich in unserer Ausstellung in Zofingen. Bad und Küche visualisieren wir auf Wunsch in 3D.</p>
          <div className={styles.actions}>
            <Link to="/kontakt" className={`${styles.button} ${styles.buttonLight}`}>Ausstellungsberatung anfragen</Link>
            <a href="#sortiment" className={styles.textLink}>Produkte entdecken</a>
          </div>
          <div className={styles.heroAddress}><span>{business.address.street}</span><span>{business.address.zip} {business.address.city}</span></div>
        </div>
      </section>

      {/* Vier Bereiche als Kapitel: Index, dann je ein Hauptbild mit zwei Nebenbildern */}
      <section id="sortiment" className={styles.journey} aria-labelledby="sortiment-title">
        <div className={styles.container}>
          <div className={styles.journeyHead}>
            <div><p className={styles.eyebrow}>Bad, Küchen, Platten und Wellness</p><h2 id="sortiment-title">Vier Bereiche. Eine stimmige Auswahl.</h2></div>
            <nav aria-label="Bereiche" className={styles.index}>
              <ol>{chapters.map((c, i) => <li key={c.id}><a href={`#bereich-${c.id}`}><span>{String(i + 1).padStart(2, '0')}</span>{areaById(c.id)?.title}</a></li>)}</ol>
            </nav>
            <Link to="/produkte" className={styles.textLink}>Alle Produkte ansehen</Link>
          </div>
          {chapters.map((c, i) => {
            const brands = suppliersInArea(c.id);
            const area = areaById(c.id)!;
            return (
              <article key={c.id} id={`bereich-${c.id}`} className={`${styles.chapter} ${i % 2 ? styles.chapterAlt : ''} ${c.main.image.height > c.main.image.width ? styles.chapterPortrait : ''}`} aria-labelledby={`bereich-${c.id}-title`}>
                <div className={styles.chapterText}>
                  <span className={styles.storyNumber} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <h3 id={`bereich-${c.id}-title`}>{area.title}</h3>
                  <p className={styles.storyLabel}>{area.label}</p>
                  <p className={styles.storyBody}>{area.text}</p>
                  <div className={styles.chapterLinks}>
                    <Link to={`/produkte#${c.id}`} className={styles.textLink}>{c.more}</Link>
                    <Link to={areaHref(c.id)} className={styles.textLink}>{brands.length === 1 ? '1 Marke' : `${brands.length} Marken`} und Serien</Link>
                  </div>
                </div>
                <Figure shot={c.main} area={c.id} className={styles.chapterMain} sizes="(max-width: 767px) 100vw, (max-width: 1100px) 66vw, 760px" />
                <div className={styles.chapterSide}>
                  {c.side.map((shot) => <Figure key={shot.image.src} shot={shot} area={c.id} sizes="(max-width: 767px) 50vw, (max-width: 1100px) 33vw, 380px" />)}
                </div>
              </article>
            );
          })}
          <p className={styles.imageNote}>Die gezeigte Küche wurde von uns realisiert. Weitere Motive zeigen ausgewählte Produkte unserer Lieferanten. Auswahl und Verfügbarkeit klären wir persönlich mit Ihnen.</p>
        </div>
      </section>

      {/* Weg zum vollständigen Katalog: Zahlen je Bereich statt einer Namensliste */}
      <section className={styles.catalog} aria-labelledby="catalog-title">
        <div className={`${styles.container} ${styles.catalogGrid}`}>
          <div>
            <p className={styles.eyebrow}>Unsere Marken</p>
            <h2 id="catalog-title">Marken, aus denen eine stimmige Auswahl wird.</h2>
            <p className={styles.catalogIntro}>Nicht jedes Produkt passt zu jedem Raum. Wir nutzen die Sortimente unserer Partner, um Materialien, Funktionen und Oberflächen passend zu Ihrem Projekt zusammenzustellen.</p>
            <Link to="/partner" className={styles.button}>Alle {suppliers.length} Marken ansehen</Link>
          </div>
          <ul className={styles.catalogAreas}>
            {areas.map((a) => {
              const n = suppliersInArea(a.id).length;
              return (
                <li key={a.id}>
                  <Link to={areaHref(a.id)}>
                    <strong>{n}</strong>
                    <span>{a.title}</span>
                    <small>{a.groups.map((g) => g.title).join(' · ')}</small>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className={styles.showroom} aria-labelledby="showroom-title">
        <div className={`${styles.container} ${styles.showroomGrid}`}>
          <figure className={styles.showroomFigure}>
            <img src={showroomImage} srcSet={`${photoUrl('ausstellung-zofingen-01.webp', true)} 480w, ${showroomImage} 1200w`} sizes="(max-width: 767px) 100vw, 40vw" alt="Einblick in unsere Ausstellung in Zofingen: Waschtische, ovale Spiegel und eine Wand in Onyxoptik" width="1200" height="1600" loading="lazy" decoding="async" />
            <figcaption><span>New Living Design</span><span>Unsere Ausstellung</span></figcaption>
          </figure>
          <div className={styles.showroomText}>
            <p className={styles.eyebrow}>Ausstellung in Zofingen</p><h2 id="showroom-title">Was am Bildschirm gefällt, muss im Raum überzeugen.</h2>
            <p className={styles.showroomIntro}>Oberflächen wirken je nach Licht, Format und Umgebung anders. In unserer Ausstellung vergleichen Sie Platten, Möbel, Armaturen und Farben direkt miteinander. Wir stellen mit Ihnen eine Auswahl zusammen, die nicht nur einzeln gefällt, sondern als Ganzes funktioniert.</p>
            <Link to="/kontakt" className={`${styles.button} ${styles.buttonLight}`}>Beratung in Zofingen anfragen</Link>
          </div>
          <div className={styles.visitCard}>
            <p className={styles.visitLabel}>Wir freuen uns auf Ihren Besuch.</p>
            <address><strong>{business.address.street}</strong><br />{business.address.zip} {business.address.city}</address>
            <dl>{business.openingHours.map((hours) => <div key={hours.days}><dt>{hours.days}</dt><dd>{hours.opens}–{hours.closes}</dd></div>)}</dl>
            <p className={styles.visitNote}>{business.openingHoursNote}</p>
            <div className={styles.visitLinks}><a href={business.mapsLink} target="_blank" rel="noopener noreferrer" className={styles.textLink}>Route planen</a><a href={`tel:${business.phone.e164}`} className={styles.textLink}>{business.phone.display}</a></div>
            <a href={business.mapsLink} target="_blank" rel="noopener noreferrer" className={styles.reviewLink}>Kundenstimmen auf Google lesen</a>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.references}`} aria-labelledby="references-title">
        <div className={styles.container}>
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Echte Projekte aus der Region</p><h2 id="references-title">Von uns geplant. Für Kunden realisiert.</h2></div><Link to="/referenzen" className={styles.textLink}>Referenzen ansehen</Link></div>
          <div className={styles.referenceGrid}>
            {homeReferencePhotos.map(({ reference, photo }) => (
              <Link key={reference.id} to={`/referenzen#${reference.id}`} className={styles.referenceCard}>
                <img src={photoUrl(photo.file, true)} srcSet={`${photoUrl(photo.file, true)} 480w, ${photoUrl(photo.file)} 1067w`} sizes="(max-width: 767px) 100vw, 40vw" alt={photo.alt} loading="lazy" decoding="async" width="480" height="640" /><div><h3>{reference.title}</h3></div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.planner} aria-labelledby="planner-title">
        <div className={`${styles.container} ${styles.plannerInner}`}>
          <div><p className={styles.eyebrow}>Ein erster Eindruck</p><h2 id="planner-title">Ein Ideenbild, bevor Sie sich festlegen.</h2><p>Mit dem Badplaner probieren Sie ausgewählte Materialien und Farben auf einem Foto Ihres Badezimmers aus. Das Ergebnis ist eine erste Inspiration – kostenlos und unverbindlich, aber keine verbindliche Planung.</p></div>
          <Link to="/badplaner" className={`${styles.button} ${styles.buttonLight}`}>Badplaner ausprobieren</Link>
        </div>
      </section>

      <section className={`${styles.section} ${styles.renovation}`} aria-labelledby="renovation-title">
        <div className={styles.container}>
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Wenn Sie nicht nur Produkte suchen</p><h2 id="renovation-title">Vom ausgewählten Bad zum kompletten Umbau.</h2><p className={styles.renovationIntro}>Für Badumbauten im Umkreis von rund 40 km um Zofingen koordinieren wir auf Wunsch den gesamten Ablauf – von der Demontage über Sanitär-, Elektro- und Plattenarbeiten bis zur Montage und Übergabe. Unsere drei Badpakete geben Ihnen dafür eine klare erste Preisorientierung.</p></div><Link to="/badumbau-zofingen" className={styles.textLink}>Badumbau und Pakete ansehen</Link></div>
          <div className={styles.packageRow}>{bathPackages.map((pkg) => <Link key={pkg.id} to={`/badumbau-zofingen#paket-${pkg.id}`}><span>{pkg.name}</span><strong>ab CHF {pkg.priceLabel}</strong></Link>)}</div>
          <p className={styles.imageNote}>Richtpreise inkl. Material, Montage und MwSt. Der Fixpreis gilt nach der Besichtigung vor Ort.</p>
        </div>
      </section>

      <section className={styles.contact} aria-labelledby="contact-title">
        <div className={`${styles.container} ${styles.contactInner}`}>
          <div><p className={styles.eyebrow}>Der nächste Schritt</p><h2 id="contact-title">Was möchten Sie verändern?</h2><p>Bringen Sie Fotos, einen Grundriss oder einfach Ihre erste Idee mit. Wir klären gemeinsam, welche Produkte und welcher nächste Schritt zu Ihrem Projekt passen.</p></div>
          <div className={styles.contactActions}><Link to="/kontakt" className={styles.button}>Beratung anfragen</Link><a href={`tel:${business.phone.e164}`} className={styles.textLink}>{business.phone.display} anrufen</a></div>
        </div>
      </section>
    </main>
  );
};

export default Home;
