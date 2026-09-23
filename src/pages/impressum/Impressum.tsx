import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Impressum.module.css';
import rexaImage from '../../assets/giammarco-boscaro-zeH-ljawHtg-unsplash.webp';
import { Helmet } from 'react-helmet-async';

const Impressum: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => setIsVisible(true), []);

  return (
    <main id="main-content" className={styles.page}>
      {/* SEO Head */}
      <Helmet>
        <title>Impressum | New Living Design GmbH</title>
        <link rel="canonical" href="https://newlivingdesign.ch/impressum" />
        <meta
          name="description"
          content="Impressum der New Living Design GmbH in Zofingen: Anbieter, Handelsregister, Unternehmenszweck, Haftung und Urheberrecht."
        />
        <meta property="og:title" content="Impressum | New Living Design GmbH" />
        <meta
          property="og:description"
          content="Rechtliche Angaben zur New Living Design GmbH: Anbieter, Handelsregistereintrag, Unternehmenszweck, Haftungsausschluss und Urheberrecht."
        />
        <meta property="og:image" content={rexaImage} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://newlivingdesign.ch/impressum" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Impressum | New Living Design GmbH" />
        <meta
          name="twitter:description"
          content="Rechtliche Angaben zur New Living Design GmbH: Impressum gemäss schweizerischem Recht und EU-Standards."
        />
        <meta name="twitter:image" content={rexaImage} />

        {/* LegalService Schema.org */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LegalService",
            "name": "New Living Design GmbH",
            "url": "https://newlivingdesign.ch/impressum",
            "image": "https://newlivingdesign.ch/logo.png",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "Im Römerquartier 4A",
              "postalCode": "4800",
              "addressLocality": "Zofingen",
              "addressCountry": "CH"
            },
            "telephone": "+41625445854",
            "email": "emanuel.verdile@newlivingdesign.ch",
            "founder": "Emanuel Diego Verdile",
            "foundingDate": "2024",
            "legalName": "New Living Design GmbH",
            "vatID": "CHE-271.178.411 MWST",
            "leiCode": "CHE-271.178.411",
            "areaServed": "CH"
          })}
        </script>
      </Helmet>
      
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles['hero-background']}>
          <div className={styles['hero-overlay']} />
          <img
            src={rexaImage}
            alt="Hochwertiges Interieur – Impressum"
            className={styles['hero-bg-image']}
          />
        </div>

        <div className={styles['hero-container']}>
          <div className={`${styles['hero-content']} ${isVisible ? styles.visible : ''}`}>
            <h1 className={styles['hero-title']}>
              <span className={styles['title-highlight']}>Impressum</span>
            </h1>
            <div className={styles['hero-description']}>
              <p>Angaben gemäss schweizerischem Recht (UWG/OR) und – soweit anwendbar – nach EU-Standards.</p>
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
          {/* Karten */}
          <article id="anbieter" className={styles.card}>
            <h3>1. Anbieter & Kontakt</h3>
            <p>
              <strong>New Living Design GmbH</strong><br />
              <span className={styles.placeholder}>Im Römerquartier 4A</span><br />
              <span className={styles.placeholder}>4800 Zofingen, Schweiz</span><br />
              E-Mail: <span className={styles.placeholder}>emanuel.verdile@newlivingdesign.ch</span><br />
              Telefon: <span className={styles.placeholder}>062 544 58 54</span><br />
              Website: <span className={styles.placeholder}>https://newlivingdesign.ch</span>
            </p>
          </article>

          <article id="vertretung" className={styles.card}>
            <h3>2. Vertretungsberechtigte Person(en)</h3>
            <p>
              Geschäftsführung: <span className={styles.placeholder}>Emanuel Diego Verdile</span><br />
              Zeichnungsberechtigung gemäss Handelsregistereintrag.
            </p>
          </article>

          <article id="register" className={styles.card}>
            <h3>3. Handelsregister & UID/MWST</h3>
            <p>
              Eingetragen im Handelsregister des Kantons <span className={styles.placeholder}>Aargau</span>.<br />
              Firmennummer (UID): <span className={styles.placeholder}>CHE-271.178.411</span><br />
              MWST-Nr.: <span className={styles.placeholder}>CHE-271.178.411 MWST</span>
            </p>
          </article>

          <article id="zweck" className={styles.card}>
            <h3>4. Unternehmenszweck</h3>
            <p>
              Die Gesellschaft bezweckt die Erbringung von Dienstleistungen im Bereich der Projektleitung, der Bauleitung, 
              der Durchführung von planerischen- und ausführungstechnischen Arbeiten, das Bewirtschaften, den Erwerb, 
              den Verkauf, die Vermarktung und die Vermittlung von Liegenschaften, das Begründen von Stockwerkeigentum, 
              das Center- und Facilitymanagement, das Erbringen von Leistungen im Bereich Wohnen mit Services 
              (inkl. Dienstleistungsmanagement) sowie das Erbringen von Finanz- und Bautreuhandleistungen. 
              Im weiteren bezweckt die Gesellschaft den Handel mit Waren im Baubereich. Die Gesellschaft kann 
              weigniederlassungen und Tochtergesellschaften im In- und Ausland errichten und sich an anderen Unternehmen 
              im In- und Ausland beteiligen sowie alle Geschäfte tätigen, die direkt oder indirekt mit ihrem Zweck in 
              Zusammenhang stehen. Die Gesellschaft kann im In- und Ausland Grundeigentum erwerben, belasten, veräussern 
              und verwalten. Sie kann auch Finanzierungen für eigene oder fremde Rechnung vornehmen sowie Garantien und 
              Bürgschaften für Tochtergesellschaften und Dritte eingehen.
            </p>
          </article>

          <article id="haftung" className={styles.card}>
            <h3>5. Haftungsausschluss</h3>
            <p>
              Die Inhalte dieser Website wurden mit grösster Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und
              Aktualität können wir jedoch keine Gewähr übernehmen. Haftungsansprüche aufgrund materieller oder
              immaterieller Schäden, die aus dem Zugriff oder der Nutzung bzw. Nichtnutzung der veröffentlichten
              Informationen entstehen, sind – soweit gesetzlich zulässig – ausgeschlossen.
            </p>
          </article>

          <article id="links" className={styles.card}>
            <h3>6. Externe Links</h3>
            <p>
              Verlinkte Webseiten Dritter liegen ausserhalb unseres Verantwortungsbereichs. Es wird jegliche Verantwortung
              für solche Webseiten abgelehnt. Der Zugriff und die Nutzung solcher Webseiten erfolgen auf eigene Gefahr.
            </p>
          </article>

          <article id="urheberrecht" className={styles.card}>
            <h3>7. Urheberrecht</h3>
            <p>
              Die Urheber- und alle anderen Rechte an Inhalten, Bildern, Fotos oder anderen Dateien auf der Website
              gehören der <strong>New Living Design GmbH</strong> oder den speziell genannten Rechteinhabern.
              Für die Reproduktion jeglicher Elemente ist die schriftliche Zustimmung der
              Rechteinhaber im Voraus einzuholen.
            </p>
          </article>

          <article id="os" className={styles.card}>
            <h3>8. Online-Streitbeilegung (EU/EWR, optional)</h3>
            <p>
              Für Verbraucher in der EU/EWR: Die EU-Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit.
              Wir sind nicht verpflichtet und in der Regel nicht bereit, an Streitbeilegungsverfahren vor einer
              Verbraucherschlichtungsstelle teilzunehmen.
            </p>
          </article>

          <article id="technik" className={styles.card}>
            <h3>9. Technische Umsetzung & Hosting</h3>
            <p>
              Entwicklung/Betreuung: <span className={styles.placeholder}>New Living Design GmbH</span><br />
              Hosting: <span className={styles.placeholder}>Hostpoint, Schweiz</span>
            </p>
          </article>

          <article id="aenderungen" className={styles.card}>
            <h3>10. Änderungen</h3>
            <p>
              Wir behalten uns vor, dieses Impressum jederzeit anzupassen. Es gilt die jeweils auf dieser Seite
              veröffentlichte Version.
            </p>
          </article>

          <div className={styles.ctaRow}>
            <Link to="/kontakt" className={styles.cta}>Kontakt aufnehmen</Link>
            <Link to="/" className={styles.ctaSecondary}>Zur Startseite</Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Impressum;
