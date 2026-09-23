import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Agb.module.css';
import rexaImage from '../../assets/cytonn-photography-n95VMLxqM2I-unsplash.webp';
import { Helmet } from 'react-helmet-async';

const AGB: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => setIsVisible(true), []);

  return (
    <main id="main-content" className={styles.page}>
      {/* SEO Head */}
      <Helmet>
        <title>AGB | New Living Design GmbH</title>
        <link rel="canonical" href="https://newlivingdesign.ch/agb" />
        <meta
          name="description"
          content="Allgemeine Geschäftsbedingungen (AGB) der New Living Design GmbH für Beratung, Verkauf, Lieferung und Montage von Innenausstattungen."
        />
        <meta property="og:title" content="AGB | New Living Design GmbH" />
        <meta
          property="og:description"
          content="Hier finden Sie die Allgemeinen Geschäftsbedingungen (AGB) der New Living Design GmbH. Vertragsbedingungen für Beratung, Verkauf, Lieferung und Montage."
        />
        <meta property="og:image" content={rexaImage} />
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content="https://newlivingdesign.ch/agb"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AGB | New Living Design GmbH" />
        <meta
          name="twitter:description"
          content="Alle Vertragsbedingungen der New Living Design GmbH: Beratung, Verkauf, Lieferung und Montage von Bodenbelägen, Möbeln und Sanitärprodukten."
        />
        <meta name="twitter:image" content={rexaImage} />

        {/* Terms Schema.org */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TermsOfService",
            "name": "Allgemeine Geschäftsbedingungen",
            "url": "https://newlivingdesign.ch/agb",
            "publisher": {
              "@type": "Organization",
              "name": "New Living Design GmbH",
              "url": "https://newlivingdesign.ch",
              "logo": "https://newlivingdesign.ch/logo.png"
            },
            "datePublished": "2025-09-15",
            "description":
              "Allgemeine Geschäftsbedingungen (AGB) der New Living Design GmbH für Beratung, Verkauf, Lieferung und Montage von Innenausstattungen."
          })}
        </script>
      </Helmet>
      
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles['hero-background']}>
          <div className={styles['hero-overlay']} />
          <img
            src={rexaImage}
            alt="Hochwertiges Interieur – Allgemeine Geschäftsbedingungen"
            className={styles['hero-bg-image']}
          />
        </div>

        <div className={styles['hero-container']}>
          <div className={`${styles['hero-content']} ${isVisible ? styles.visible : ''}`}>
            <h1 className={styles['hero-title']}>
              <span className={styles['title-highlight']}>Allgemeine Geschäftsbedingungen (AGB)</span>
            </h1>
            <div className={styles['hero-description']}>
              <p>
                Vertragsbedingungen der New Living Design GmbH für Beratung, Verkauf, Lieferung und Montage.
              </p>
              <span className={styles.badge}>Stand: 15.09.2025</span>
            </div>
          </div>
          <div className={styles['hero-scroll-indicator']}>
            <div className={styles['scroll-dot']} />
            <span>Scrollen Sie nach unten</span>
          </div>
        </div>
      </section>

      {/* Dark legal content */}
      <section className={styles.legal}>
        <div className={styles.container}>
          {/* 1 */}
          <article id="geltung" className={styles.card}>
            <h3>1. Geltung & Vertragspartner</h3>
            <p>
              Diese AGB gelten für alle Verträge zwischen der <strong>New Living Design GmbH</strong> (nachfolgend „wir“)
              und unseren Kundinnen/Kunden (nachfolgend „Kunde“) über Beratung, Verkauf, Lieferung und Montage
              von Innenausstattungsprodukten (u. a. Bodenbeläge, Badezimmermöbel, Sanitärinstallationen, Armaturen)
              sowie zugehörige Dienstleistungen.
            </p>
            <p>
              Abweichende Bedingungen des Kunden werden nicht anerkannt, es sei denn, wir stimmen ihnen ausdrücklich
              schriftlich zu. Zwingende gesetzliche Bestimmungen bleiben vorbehalten.
            </p>
          </article>

          {/* 2 */}
          <article id="vertraege" className={styles.card}>
            <h3>2. Vertragsschluss & Angebote</h3>
            <ul className={styles.list}>
              <li><strong>Angebote/Kataloge:</strong> Unverbindlich; Änderungen in Design, Material, Sortiment und Preis vorbehalten.</li>
              <li><strong>Bestellung:</strong> Der Vertrag kommt durch unsere schriftliche Auftragsbestätigung oder Lieferung/Montage zustande.</li>
              <li><strong>Planungen:</strong> Zeichnungen/Skizzen/Muster bleiben unser Eigentum; Weitergabe an Dritte nur mit Zustimmung.</li>
              <li><strong>Sonderanfertigungen:</strong> Produktion erst nach Freigabe der Spezifikation durch den Kunden.</li>
            </ul>
          </article>

          {/* 3 */}
          <article id="preise" className={styles.card}>
            <h3>3. Preise, Zahlungsbedingungen, Eigentumsvorbehalt</h3>
            <ul className={styles.list}>
              <li><strong>Preise:</strong> In CHF inkl. MWST, zzgl. allfälliger Liefer-/Montage-/Entsorgungskosten, sofern nicht anders angegeben.</li>
              <li><strong>Zahlungsarten:</strong> <span className={styles.placeholder}>Vorkasse / Rechnung / Bar</span>. Fälligkeit: <span className={styles.placeholder}>30 Tage netto ab Rechnungsdatum</span>.</li>
              <li><strong>Anzahlung:</strong> Bei einige Bestellungen behalten wir uns eine Anzahlung vor.</li>
              <li><strong>Verzug:</strong> Verzugszins; Mahngebühren möglich.</li>
              <li><strong>Eigentumsvorbehalt:</strong> Bis zur vollständigen Zahlung verbleiben Waren in unserem Eigentum (Art. 715 ZGB i. V. m. OR).</li>
            </ul>
          </article>

          {/* 4 */}
          <article id="lieferung" className={styles.card}>
            <h3>4. Lieferung, Montage & Mitwirkungspflichten</h3>
            <ul className={styles.list}>
              <li><strong>Lieferfristen:</strong> Unverbindlich, sofern nicht ausdrücklich fix bestätigt.</li>
              <li><strong>Montagebedingungen:</strong> Der Kunde stellt rechtzeitig freien Zugang, Baustellenbereitschaft, Strom/Wasser sowie Park-/Zufahrtsmöglichkeit sicher.</li>
              <li><strong>Bauseitige Voraussetzungen:</strong> Ebenheit, Tragfähigkeit, Trocknung, Abdichtung, Anschlüsse etc. sind kundenseitig sicherzustellen oder separat zu beauftragen.</li>
              <li><strong>Mehr-/Zusatzleistungen:</strong> Nicht kalkulierte Zusatzarbeiten (z. B. Altuntergrundsanierung, Anpassarbeiten) werden nach Aufwand gemäss <span className={styles.placeholder}>Stundensätze</span> verrechnet.</li>
              <li><strong>Entsorgung:</strong> Demontage/Entsorgung Altmaterial nur, wenn ausdrücklich vereinbart.</li>
              <li><strong>Gefahrübergang:</strong> Mit Übergabe/Abnahme; bei Versand gemäss vereinbarter Lieferklausel.</li>
            </ul>
          </article>

          {/* 5 */}
          <article id="termine" className={styles.card}>
            <h3>5. Termine, Verzug & höhere Gewalt</h3>
            <p>
              Ereignisse höherer Gewalt (z. B. Lieferkettenstörungen, Streik, Naturereignisse, behördliche Massnahmen)
              verlängern Fristen angemessen. Bei Verzögerungen aus der Sphäre des Kunden (z. B. fehlende Mitwirkung)
              sind wir berechtigt, Zusatzaufwand in Rechnung zu stellen.
            </p>
          </article>

          {/* 6 */}
          <article id="beratung" className={styles.card}>
            <h3>6. Beratungstermine & Showroom-Nutzung</h3>
            <ul className={styles.list}>
              <li><strong>Vor-Ort-Erstberatung:</strong> Kostenloser Ersttermin gemäss Website. Verschiebung/Stornierung bis <span className={styles.placeholder}>24 h</span> vorher kostenfrei.</li>
              <li><strong>Showroom-Reservierung:</strong> Nutzung gemäss separat kommunizierten Bedingungen. Materialien werden über uns bezogen; gewerbliche Nutzung nur nach Vereinbarung.</li>
              <li><strong>Sorgfalt:</strong> Für Schäden im Showroom haftet der Verursacher.</li>
            </ul>
          </article>

          {/* 7 */}
          <article id="widerruf" className={styles.card}>
            <h3>7. Widerruf, Rückgabe & Stornierung</h3>
            <p>
              <strong>Schweiz:</strong> Ein allgemeines gesetzliches Widerrufsrecht besteht nicht. Wir gewähren freiwillig folgendes Rückgaberecht:
              <span className={styles.placeholder}>14 Tage ab Erhalt in Originalverpackung, unbenutzt</span>. Ausgenommen sind
              <em> Sonderanfertigungen, zugeschnittene Materialien, Hygieneartikel</em> sowie bereits verbaute Waren.
            </p>
            <ul className={styles.list}>
              <li><strong>Stornierung vor Produktion/Montage:</strong> Möglich; bereits entstandene Kosten werden belastet.</li>
              <li><strong>Rücksendekosten:</strong> Trägt der Kunde, sofern nicht anders vereinbart.</li>
              <li><strong>Rückerstattung:</strong> Nach Wareneingang & Prüfung innerhalb von <span className={styles.placeholder}>14 Tagen</span>.</li>
            </ul>
          </article>

          {/* 8 */}
          <article id="gewaehrleistung" className={styles.card}>
            <h3>8. Gewährleistung & Garantien</h3>
            <ul className={styles.list}>
              <li><strong>Gesetzliche Sachgewährleistung (OR):</strong> Für Mängel haften wir nach den gesetzlichen Bestimmungen; vertragliche Spezifika bleiben vorbehalten.</li>
              <li><strong>Herstellergarantien:</strong> Sofern vorhanden, gelten deren Bedingungen zusätzlich; Ansprüche hieraus sind vorrangig gegenüber dem Hersteller geltend zu machen.</li>
              <li><strong>Mängelrüge:</strong> Offensichtliche Mängel sind unverzüglich, spätestens innerhalb von <span className={styles.placeholder}>7 Kalendertagen</span> nach Lieferung/Montage schriftlich zu rügen.</li>
              <li><strong>Nacherfüllung:</strong> Nach unserer Wahl Nachbesserung, Ersatzlieferung oder angemessene Minderung; weitergehende Rechte gemäss Gesetz.</li>
              <li><strong>Ausschlüsse:</strong> Normale Abnutzung, unsachgemässe Nutzung, fehlende Pflege, bauseitige Mängel.</li>
            </ul>
          </article>

          {/* 9 */}
          <article id="haftung" className={styles.card}>
            <h3>9. Haftung</h3>
            <p>
              Für leichte Fahrlässigkeit haften wir – soweit gesetzlich zulässig – nicht für indirekte Schäden, entgangenen Gewinn,
              Daten-/Nutzungsausfall oder Folgeschäden. Unberührt bleiben Haftung für Vorsatz/grobe Fahrlässigkeit, Personenschäden
              sowie zwingende gesetzliche Haftung.
            </p>
          </article>

          {/* 10 */}
          <article id="daten" className={styles.card}>
            <h3>10. Datenschutz</h3>
            <p>
              Informationen zur Verarbeitung personenbezogener Daten finden Sie in unserer <Link to="/datenschutz">Datenschutzerklärung</Link>.
            </p>
          </article>

          {/* 11 */}
          <article id="ip" className={styles.card}>
            <h3>11. Urheberrechte, Nutzungsrechte</h3>
            <p>
              Planungen, Visualisierungen, Texte und Bilder sind urheberrechtlich geschützt. Eine Nutzung ausserhalb des
              Vertragszwecks bedarf unserer schriftlichen Zustimmung.
            </p>
          </article>

          {/* 12 */}
          <article id="abtretung" className={styles.card}>
            <h3>12. Abtretung, Verrechnung, Zurückbehaltung</h3>
            <p>
              Ansprüche gegen uns dürfen nur mit unserer Zustimmung abgetreten werden. Eine Verrechnung ist nur mit
              unbestrittenen oder rechtskräftig festgestellten Forderungen zulässig. Zurückbehaltungsrechte bestehen nur
              im gesetzlich vorgesehenen Umfang.
            </p>
          </article>

          {/* 14 */}
          <article id="recht" className={styles.card}>
            <h3>13. Anwendbares Recht & Gerichtsstand</h3>
            <p>
              Es gilt ausschliesslich schweizerisches Recht unter Ausschluss der Kollisionsnormen und des UN-Kaufrechts (CISG).
              Gerichtsstand ist – vorbehaltlich zwingender Verbrauchergerichtsstände – <span className={styles.placeholder}>Zofingen, Aargau</span>.
            </p>
          </article>

          {/* 15 */}
          <article id="schluss" className={styles.card}>
            <h3>15. Schlussbestimmungen</h3>
            <ul className={styles.list}>
              <li><strong>Schriftform:</strong> Änderungen/Ergänzungen bedürfen der Schriftform (E-Mail genügt, sofern nicht anders vereinbart).</li>
              <li><strong>Salvatorische Klausel:</strong> Ist eine Bestimmung unwirksam, bleibt der Vertrag im Übrigen wirksam; an deren Stelle tritt eine wirksame Regelung, die dem wirtschaftlichen Zweck am nächsten kommt.</li>
              <li><strong>Version:</strong> Es gilt die auf dieser Seite veröffentlichte AGB-Version.</li>
            </ul>
          </article>

          <div className={styles.ctaRow}>
            <Link to="/kontakt" className={styles.cta}>Frage zu AGB stellen</Link>
            <Link to="/" className={styles.ctaSecondary}>Zur Startseite</Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default AGB;
