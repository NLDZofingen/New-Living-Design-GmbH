import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './DataSecurity.module.css';
import dataImage from '../../assets/kaffeebart-KrPulSdUetk-unsplash.webp';
import { Helmet } from 'react-helmet-async';
import CookieSettings from '../../components/cookie/CookieSettings';

const DataSecurity: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => setIsVisible(true), []);

  return (
    <main id="main-content" className={styles.page}>
      {/* SEO Head */}
      <Helmet>
        <title>Datenschutzerklärung | New Living Design GmbH</title>
        <link rel="canonical" href="https://newlivingdesign.ch/datenschutz" />
        <meta
          name="description"
          content="Datenschutzerklärung der New Living Design GmbH: Verarbeitung personenbezogener Daten bei Website-Nutzung, Kontakt und Terminvereinbarung."
        />
        <meta property="og:title" content="Datenschutzerklärung | New Living Design GmbH" />
        <meta
          property="og:description"
          content="Transparenz beim Datenschutz: Hier finden Sie alle Informationen zur Verarbeitung Ihrer personenbezogenen Daten durch die New Living Design GmbH."
        />
        <meta property="og:image" content={dataImage} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://newlivingdesign.ch/datenschutz" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Datenschutzerklärung | New Living Design GmbH" />
        <meta
          name="twitter:description"
          content="Erfahren Sie mehr über Datenschutz, Datensicherheit und Ihre Rechte bei der New Living Design GmbH."
        />
        <meta name="twitter:image" content={dataImage} />

        {/* PrivacyPolicy Schema.org */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "PrivacyPolicy",
            "name": "Datenschutzerklärung",
            "url": "https://newlivingdesign.ch/datenschutz",
            "publisher": {
              "@type": "Organization",
              "name": "New Living Design GmbH",
              "url": "https://newlivingdesign.ch",
              "logo": "https://newlivingdesign.ch/logo.png"
            },
            "datePublished": "2025-09-15",
            "dateModified": "2026-09-12",
            "description":
              "Informationen zur Verarbeitung personenbezogener Daten bei Nutzung der Website, Kontaktaufnahme und Terminvereinbarung durch die New Living Design GmbH."
          })}
        </script>
      </Helmet>
      
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles['hero-background']}>
          <div className={styles['hero-overlay']} />
          <img
            src={dataImage}
            alt="Hochwertiges Interieur – Datenschutz"
            className={styles['hero-bg-image']}
          />
        </div>

        <div className={styles['hero-container']}>
          <div className={`${styles['hero-content']} ${isVisible ? styles.visible : ''}`}>
            <h1 className={styles['hero-title']}>
              <span className={styles['title-highlight']}>Datenschutz</span>
            </h1>
            <div className={styles['hero-description']}>
              <p>
                Information zur Verarbeitung personenbezogener Daten bei Nutzung unserer Website, Kontaktaufnahme
                und Terminvereinbarung.
              </p>
              <span className={styles.badge}>Stand: 12.09.2026</span>
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
          <article id="verantwortlich" className={styles.card}>
            <h3>1. Verantwortlich</h3>
            <p><strong>New Living Design GmbH</strong><br />
              <span className={styles.placeholder}>Im Römerquartier 4A, 4800 Zofingen</span><br />
              E-Mail: <span className={styles.placeholder}>emanuel.verdile@newlivingdesign.ch</span> · Tel: <span className={styles.placeholder}>062 544 58 54</span>
            </p>
            <p>Bei Fragen zum Datenschutz kontaktieren Sie uns bitte über die oben genannten Angaben oder über unsere <Link to="/kontakt">Kontaktseite</Link>.</p>
          </article>

          <article id="grundlagen" className={styles.card}>
            <h3>2. Geltungsbereich & Rechtsgrundlagen</h3>
            <p>Diese Erklärung gilt für die Website und die damit verbundenen Dienste (z.&nbsp;B. Kontaktformular, Terminbuchung, Showroom-Reservierung).
              Wir verarbeiten personenbezogene Daten gemäss dem schweizerischen Datenschutzrecht (revDSG). Soweit anwendbar,
              berücksichtigen wir zudem die Anforderungen der EU-DSGVO (insb. Art. 6 Abs. 1).</p>
          </article>

          <article id="artenzwecke" className={styles.card}>
            <h3>3. Datenarten & Zwecke</h3>
            <ul className={styles.list}>
              <li><strong>Stammdaten:</strong> Name, Kontaktdaten (E-Mail, Telefon), Adresse – zur Bearbeitung von Anfragen, Offerten, Terminvereinbarungen, Vertragsabwicklung.</li>
              <li><strong>Kommunikationsdaten:</strong> Inhalte aus Formularen/E-Mails – zur Kundenbetreuung und Dokumentation.</li>
              <li><strong>Nutzungsdaten:</strong> IP-Adresse, Geräte-/Browser-Infos, Zeitpunkt, aufgerufene Seiten – zur Bereitstellung, Sicherheit und Optimierung der Website.</li>
            </ul>
          </article>

          <article id="quellen" className={styles.card}>
            <h3>4. Datenquellen</h3>
            <p>Wir erhalten Daten primär von Ihnen (z.&nbsp;B. über Formulare, E-Mail, Telefon). Ergänzend können technische Nutzungsdaten automatisch durch unsere IT-Systeme beim Besuch der Website erfasst werden.</p>
          </article>

          <article id="hosting" className={styles.card}>
            <h3>5. Hosting & Auftragsverarbeiter</h3>
            <p>Unsere Website wird bei <strong>Vercel Inc.</strong> (USA, Server in der EU/weltweit über ein Content Delivery Network) betrieben.
              Die Kontakt- und Anfrageformulare werden über <strong>Formspree Inc.</strong> (USA) übermittelt; die Angaben gehen per E-Mail an uns.
              Mit Dienstleistern, die in unserem Auftrag Daten verarbeiten (Hosting, Formulare, Wartung), bestehen Auftragsverarbeitungsverträge
              bzw. gelten deren Datenschutzbedingungen mit Standardvertragsklauseln.</p>
          </article>

          <article id="serverlogs" className={styles.card}>
            <h3>6. Server-Logfiles</h3>
            <p>Der Provider erhebt und speichert automatisch Informationen in sogenannten Server-Logfiles (z.&nbsp;B. IP-Adresse, Datum/Uhrzeit, Browser-Typ, Referrer-URL). Diese Daten sind für den
              sicheren Betrieb der Website erforderlich und werden regelmässig und spätestens nach <span className={styles.placeholder}>30 Tagen</span> gelöscht.</p>
          </article>

          <article id="cookies" className={styles.card}>
            <h3>7. Cookies & Tracking</h3>
            <p>Wir verwenden Cookies und ähnliche Technologien, um die Website bereitzustellen (notwendig) und, nur mit Ihrer Einwilligung, um die Nutzung
              zu messen (Statistik) und den Erfolg unserer Werbung zu messen (Marketing). Ohne Einwilligung wird keiner der optionalen Dienste geladen.
              Sie können Ihre Wahl jederzeit unten auf dieser Seite ändern.</p>
            <details className={styles.details}>
              <summary>Optionale Dienste</summary>
              <ul className={styles.list}>
                <li><strong>Google Analytics 4</strong> (Google Ireland Ltd., Dublin; Mess-ID G-S2MFTL82PC): pseudonymisierte Nutzungsstatistik, IP-Adresse gekürzt.
                  Cookies _ga, _ga_* (bis 2 Jahre). Speicherdauer der Ereignisdaten bei Google: 14 Monate. Datenübermittlung in die USA möglich
                  (EU-U.S. Data Privacy Framework / Standardvertragsklauseln).</li>
                <li><strong>Meta Pixel</strong> (Meta Platforms Ireland Ltd., Dublin; Pixel-ID 783872098922670): misst, ob Besucher über unsere Anzeigen auf Facebook
                  und Instagram zu uns kommen und eine Anfrage stellen. Cookies _fbp, _fbc (3 Monate). Datenübermittlung in die USA möglich.
                  Widerspruch auch über die Werbeeinstellungen Ihres Meta-Kontos.</li>
                <li><strong>Vercel Analytics / Speed Insights</strong> (Vercel Inc.): cookielose, aggregierte Messung von Aufrufen und Ladezeiten, ohne Identifizierung einzelner Besucher.</li>
              </ul>
            </details>
          </article>

          {/* Cookie Settings Management */}
          <article id="cookie-settings" className={styles.card}>
            <CookieSettings />
          </article>

          <article id="kontakt" className={styles.card}>
            <h3>8. Kontakt & Terminvereinbarung</h3>
            <p>Bei Kontaktaufnahme oder Terminbuchung (z.&nbsp;B. <em>Besichtigungstermin vor Ort</em> oder <em>Showroom-Reservierung</em>) verarbeiten wir die von Ihnen angegebenen Daten
              (Name, Kontaktdaten, Terminwunsch, Nachrichteninhalt) zur Bearbeitung der Anfrage und Organisation des Termins.</p>
            <p>Rechtsgrundlage: Vertragliche Anbahnung/Erfüllung bzw. berechtigtes Interesse an effizienter Kommunikation; bei Einwilligung (z.&nbsp;B. Marketing) basiert die Verarbeitung auf Ihrer Einwilligung.</p>
          </article>

          <article id="badplaner" className={styles.card}>
            <h3>9. Badplaner (Ideenbild mit KI)</h3>
            <p>Mit dem Badplaner auf <Link to="/badplaner">/badplaner</Link> können Sie aus einem Foto Ihres Bads ein Ideenbild mit den gewählten Materialien erstellen lassen.</p>
            <ul className={styles.list}>
              <li><strong>Welche Daten:</strong> Foto des Bads, Name, Telefonnummer, optional E-Mail-Adresse und Wohnort, die gewählte Ausstattung (Paket, Platten, Farben, Armaturen),
                optional ein Grundriss und die Bad-Grösse in m².</li>
              <li><strong>Zweck:</strong> Erstellung des Ideenbilds und Kontaktaufnahme für eine Beratung (Telefon, WhatsApp, Termin in der Ausstellung).</li>
              <li><strong>Bildgenerierung:</strong> Das Foto und die Materialangaben werden an <strong>Google LLC</strong> (Gemini API, USA) übermittelt, um das Ideenbild zu erzeugen.
                Google verwendet Daten aus der bezahlten API gemäss seinen Nutzungsbedingungen nicht zum Training seiner Modelle. Übermittlung in die USA auf Basis
                des Data Privacy Framework bzw. von Standardvertragsklauseln.</li>
              <li><strong>Keine Speicherung auf unseren Servern:</strong> Foto und Ideenbild werden nicht auf unseren Servern gespeichert. Sie werden uns per E-Mail zugestellt,
                sobald das Ideenbild erstellt ist, auch wenn Sie danach keine Kontaktangaben hinterlassen; Ihre Kontaktangaben folgen mit einer zweiten E-Mail; als Versanddienst nutzen wir <strong>Resend Inc.</strong> (USA). Fällt dieser aus, gehen die Angaben ohne Bilder über <strong>Formspree Inc.</strong> (USA) an uns.</li>
              <li><strong>Löschung:</strong> Fotos und Ideenbilder löschen wir spätestens 30 Tage nach Abschluss der Anfrage, sofern kein Auftrag zustande kommt.</li>
              <li><strong>Rechtsgrundlage:</strong> Ihre Einwilligung (Checkbox vor dem Erstellen des Ideenbilds). Sie können die Einwilligung jederzeit mit Wirkung für die Zukunft
                per E-Mail an die oben genannte Adresse widerrufen; wir löschen die Daten dann umgehend.</li>
              <li><strong>Cookie:</strong> Das technisch notwendige Cookie <span className={styles.placeholder}>nldbp</span> zählt die Ideenbilder pro Gerät und Tag (Tageslimit) und wird nach einem Tag gelöscht.
                Es enthält keine persönlichen Daten.</li>
            </ul>
          </article>

          <article id="weitergabe" className={styles.card}>
            <h3>10. Weitergabe & Drittländer</h3>
            <p>Eine Weitergabe erfolgt nur, sofern erforderlich (z.&nbsp;B. an Dienstleister, Montagepartner) oder rechtlich vorgeschrieben. Übermittlungen in Länder ohne angemessenes Datenschutzniveau erfolgen
              nur unter Anwendung geeigneter Garantien (z.&nbsp;B. Standardvertragsklauseln) oder Ihrer ausdrücklichen Einwilligung.</p>
          </article>

          <article id="dauer" className={styles.card}>
            <h3>11. Speicherdauer</h3>
            <p>Wir verarbeiten und speichern personenbezogene Daten nur so lange, wie es für die jeweiligen Zwecke erforderlich ist oder eine gesetzliche Pflicht besteht (z.&nbsp;B. handels-/steuerrechtliche Aufbewahrungspflichten).
              Danach löschen oder anonymisieren wir die Daten.</p>
          </article>

          <article id="sicherheit" className={styles.card}>
            <h3>12. Datensicherheit</h3>
            <p>Wir treffen angemessene technische und organisatorische Massnahmen (TOM), um Ihre Daten gegen Verlust, Missbrauch und unbefugten Zugriff zu schützen (z.&nbsp;B. Zugriffskontrollen, Verschlüsselung, Backups).</p>
          </article>

          <article id="rechte" className={styles.card}>
            <h3>13. Ihre Rechte</h3>
            <ul className={styles.list}>
              <li>Auskunft und Herausgabe Ihrer Daten,</li>
              <li>Berichtigung, Löschung, Einschränkung der Verarbeitung,</li>
              <li>Widerspruch gegen Verarbeitung (insb. Direktmarketing),</li>
              <li>Datenübertragbarkeit (sofern anwendbar),</li>
              <li>Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft.</li>
            </ul>
            <p>Zur Ausübung Ihrer Rechte kontaktieren Sie uns bitte (siehe <a href="#verantwortlich">Verantwortlich</a>). Zudem haben Sie das Recht, sich bei der zuständigen
              Aufsichtsbehörde zu beschweren (in der Schweiz: EDÖB).</p>
          </article>

          <article id="aenderungen" className={styles.card}>
            <h3>14. Änderungen dieser Erklärung</h3>
            <p>Wir können diese Datenschutzerklärung anpassen, wenn sich Technologien, Prozesse oder Rechtsgrundlagen ändern. Es gilt die jeweils auf dieser Seite veröffentlichte Version.</p>
          </article>

          <div className={styles.ctaRow}>
            <Link to="/kontakt" className={styles.cta}>Datenschutzanfrage stellen</Link>
            <Link to="/" className={styles.ctaSecondary}>Zur Startseite</Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default DataSecurity;
