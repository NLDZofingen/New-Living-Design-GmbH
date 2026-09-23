import React from "react";
import styles from "./About.module.css";
import heroImg from "../../assets/shutterstock_2600582595.webp";
import { Helmet } from "react-helmet-async";

const cx = (...classes: Array<string | false | undefined>) =>
  classes.filter(Boolean).join(" ");

const About: React.FC = () => {
  return (
    <main id="main-content" className={styles.about}>
      <Helmet>
        <title>Über New Living Design | Ausstellung in Zofingen</title>
        <link rel="canonical" href="https://newlivingdesign.ch/ueber-uns" />
        <meta
          name="description"
          content="New Living Design ist ein familiengeführtes Unternehmen in Zofingen für Bad, Küchen, Platten und Wellness – mit persönlicher Beratung und Ausstellung."
        />
        <meta property="og:title" content="Über uns | New Living Design GmbH" />
        <meta
          property="og:description"
          content="Aus der praktischen Arbeit mit Materialien und Umbauten entstanden: New Living Design und die Ausstellung in Zofingen."
        />
        <meta property="og:image" content={`https://newlivingdesign.ch${heroImg}`} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://newlivingdesign.ch/ueber-uns" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Über uns | New Living Design GmbH" />
        <meta
          name="twitter:description"
          content="Wir denken vom Material bis zum fertigen Raum. Lernen Sie New Living Design in Zofingen kennen."
        />
        <meta name="twitter:image" content={heroImg} />

        {/* Local Business Schema.org */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "New Living Design GmbH",
            "image": "https://newlivingdesign.ch" + heroImg,
            "url": "https://newlivingdesign.ch/ueber-uns",
            "telephone": "+41625445854",
            "email": "emanuel.verdile@newlivingdesign.ch",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "Im Römerquartier 4A",
              "postalCode": "4800",
              "addressLocality": "Zofingen",
              "addressCountry": "CH"
            },
            "openingHoursSpecification": [
              {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday"
                ],
                "opens": "07:00",
                "closes": "19:00"
              },
              {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": "Saturday",
                "opens": "09:00",
                "closes": "13:00"
              }
            ]
          })}
        </script>
      </Helmet>
      
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles["hero-background"]}>
          <div className={styles["hero-overlay"]}></div>
          <img
            src={heroImg}
            alt="Showroom / Innenausstattung"
            className={styles["hero-bg-image"]}
          />
        </div>

        <div className={styles["hero-container"]}>
          <div className={styles["hero-content"]}>
            <h1 className={styles["hero-title"]}>
              <span>Wir denken vom Material bis zum fertigen Raum.</span>
            </h1>
            <p className={styles["hero-subtitle"]}>
              New Living Design ist ein familiengeführtes Unternehmen mit Ausstellung in Zofingen. Wir verbinden
              praktische Erfahrung aus Umbau und Plattenarbeiten mit der Auswahl von Badprodukten, Küchen,
              Oberflächen und Wellnesslösungen.
            </p>
          </div>
          <div className={styles["hero-scroll-indicator"]}>
            <div className={styles["scroll-dot"]}></div>
            <span>Scrollen Sie nach unten</span>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className={cx(styles.section, styles.dark)}>
        <div className={styles.container}>
          <div className={cx(styles["section-header"], styles.centered)}>
            <span className={styles["section-label"]}>Wie New Living Design arbeitet</span>
            <h2 className={styles["section-title"]}>Aus der Praxis entstanden</h2>
          </div>

          <div className={styles.grid}>
            <article className={styles.card}>
              <h3>Der Blick fürs Material</h3>
              <p>
                Unsere Arbeit begann bei Oberflächen, Formaten und ihrer sauberen Verarbeitung.
                Diese Nähe zum Material prägt bis heute, wie wir Produkte beurteilen und miteinander kombinieren.
              </p>
            </article>

            <article className={styles.card}>
              <h3>Die Ausstellung in Zofingen</h3>
              <p>
                Ein Muster auf dem Bildschirm ersetzt nicht den Eindruck vor Ort. Deshalb können Kundinnen und Kunden
                in Zofingen Platten, Möbel, Armaturen und Farben nebeneinander sehen, anfassen und vergleichen.
              </p>
            </article>

            <article className={styles.card}>
              <h3>Der ganze Raum</h3>
              <p>
                Heute beraten wir zu Bad, Küchen, Platten und Wellness. Je nach Projekt kommen 3D-Visualisierung,
                Lieferung, Montage oder die Koordination einer Renovation hinzu.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Fakten */}
      <section className={cx(styles.section, styles.light)}>
        <div className={styles.container}>
          <div className={cx(styles["section-header"], styles.centered)}>
            <span className={styles["section-label"]}>New Living Design in Kürze</span>
            <h2 className={styles["section-title"]}>Was Sie über uns wissen sollten</h2>
          </div>

          <div className={styles.facts}>
            <div className={styles.fact}>
              <div className={styles["fact-badge"]}>2023</div>
              <div className={styles["fact-content"]}>
                <h4>New Living Design GmbH</h4>
                <p>Seit 2023 als GmbH im Kanton Aargau eingetragen.</p>
              </div>
            </div>

            <div className={styles.fact}>
              <div className={styles["fact-badge"]}>Ansprechpartner</div>
              <div className={styles["fact-content"]}>
                <h4>Emanuel Verdile</h4>
                <p>Ihr Ansprechpartner für Beratung, Termine und Projektanfragen.</p>
              </div>
            </div>

            <div className={styles.fact}>
              <div className={styles["fact-badge"]}>Ausstellung</div>
              <div className={styles["fact-content"]}>
                <h4>Zofingen</h4>
                <p>Materialien und Produkte in unserer Ausstellung im Römerquartier vergleichen.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Werte */}
      <section className={cx(styles.section, styles.dark)}>
        <div className={styles.container}>
          <div className={cx(styles["section-header"], styles.centered)}>
            <span className={styles["section-label"]}>Woran Sie unsere Arbeit erkennen</span>
            <h2 className={styles["section-title"]}>Drei Grundsätze</h2>
          </div>

          <div className={styles.values}>
            <div className={styles["value-item"]}>
              <div className={styles["value-icon"]}>
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>
              <h4>Am Material entscheiden</h4>
              <p>Wir zeigen reale Muster und erklären Unterschiede bei Wirkung, Nutzung und Pflege.</p>
            </div>

            <div className={styles["value-item"]}>
              <div className={styles["value-icon"]}>
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>
              <h4>Als Ganzes prüfen</h4>
              <p>
                Wir betrachten nicht nur das einzelne Produkt, sondern auch Proportionen, Anschlüsse, Farben und die
                Produkte daneben.
              </p>
            </div>

            <div className={styles["value-item"]}>
              <div className={styles["value-icon"]}>
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M3 12h6l3 7 3-14 3 7h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h4>Vereinbarungen klar festhalten</h4>
              <p>
                Produkte, Leistungen und Zuständigkeiten werden vor Bestellung oder Ausführung nachvollziehbar
                beschrieben.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Kontakt & Öffnungszeiten */}
      <section className={cx(styles.section, styles.light)}>
        <div className={styles.container}>
          <div className={styles["contact-wrap"]}>
            <div className={styles["contact-block"]}>
              <h3>Ausstellung und Kontakt</h3>
              <p className={styles["contact-lines"]}>
                New Living Design GmbH<br />
                Im Römerquartier 4A<br />
                4800 Zofingen<br />
                <a href="tel:+41625445854">062 544 58 54</a><br />
                <a href="mailto:emanuel.verdile@newlivingdesign.ch">emanuel.verdile@newlivingdesign.ch</a>
              </p>
            </div>

            <div className={styles["hours-block"]}>
              <h3>Öffnungszeiten</h3>
              <ul>
                <li><span>Mo–Fr</span><span>07:00–19:00</span></li>
                <li><span>Samstag</span><span>09:00–13:00</span></li>
                <li><span>Sonntag</span><span>Geschlossen</span></li>
              </ul>
              <p className={styles["contact-note"]}>
                Termin nach Vereinbarung, auch ausserhalb der Öffnungszeiten.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default About;
