import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from './Services.module.css';
import heroImage from '../../assets/shutterstock_2583534585.webp';
import beratungImage from '../../assets/shutterstock_2479065515.webp';
import visualisierungImage from '../../assets/shutterstock_2600181185.webp';
import lieferungImage from '../../assets/shutterstock_236748076.webp';
import { Helmet } from 'react-helmet-async';

const Services: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);

    // CSS-Module-kompatible Reveal-Animation
    const timer = setTimeout(() => {
      const allElements = document.querySelectorAll('.' + styles['scroll-reveal']);
      allElements.forEach((el, index) => {
        setTimeout(() => {
          el.classList.add(styles.visible);
        }, index * 200);
      });
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <main id="main-content" className={styles['services-page']}>
      <Helmet>
        <title>Beratung, 3D-Planung & Montage | New Living Design</title>
        <link rel="canonical" href="https://newlivingdesign.ch/dienstleistungen" />
        <meta
          name="description"
          content="Persönliche Auswahlberatung in Zofingen, 3D-Visualisierung für Bad und Küche sowie koordinierte Lieferung, Montage und Renovation."
        />
        <meta property="og:title" content="Dienstleistungen – New Living Design GmbH" />
        <meta property="og:description" content="Auswahlberatung, 3D-Visualisierung sowie koordinierte Lieferung und Montage für Ihr Projekt." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://newlivingdesign.ch/dienstleistungen" />
        <meta property="og:image" content={`https://newlivingdesign.ch${heroImage}`} />
      </Helmet>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles['hero-background']}>
          <div className={styles['hero-overlay']}></div>
          <img
            src={heroImage}
            alt="Dienstleistungen"
            className={styles['hero-bg-image']}
          />
        </div>
        <div className={styles['hero-container']}>
          <div className={`${styles['hero-content']} ${isVisible ? styles.visible : ''}`}>
            <h1 className={styles['hero-title']}>
              <span className={styles['title-line']}>Von der Auswahl</span>
              <span>bis zur Umsetzung.</span>
            </h1>
            <div className={styles['hero-description']}>
              <p>
                Wir beginnen mit Ihrem Raum, nicht mit einem Katalog. Wir klären, was zu Ihren Massen, Ihrem Alltag
                und Ihrem Budget passt. Danach stellen wir Produkte und Materialien zusammen und begleiten die
                vereinbarten Schritte bis zur Lieferung und Montage.
              </p>
            </div>
          </div>
          <div className={styles['hero-scroll-indicator']}>
            <div className={styles['scroll-dot']}></div>
            <span>Scrollen Sie nach unten</span>
          </div>
        </div>
      </section>

      {/* Introduction Section */}
      <section className={`${styles.introduction} ${styles['scroll-reveal']}`}>
        <div className={styles['introduction-container']}>
          <div className={styles['section-header']}>
            <span className={styles['section-label']}>Was wir für Sie übernehmen</span>
            <h2 className={styles['section-title']}>So viel Begleitung, wie Ihr Projekt braucht</h2>
          </div>
          <div className={styles['introduction-content']}>
            <p>
              Manche Kundinnen und Kunden suchen eine einzelne Platte oder Armatur. Andere möchten Bad oder Küche
              vollständig planen und umsetzen. Wir beginnen dort, wo Ihr Projekt steht, und legen gemeinsam fest,
              welche Unterstützung sinnvoll ist.
            </p>
            <p>
              Sie erhalten klare nächste Schritte statt eines pauschalen Leistungspakets: Auswahlberatung, Offerte,
              3D-Visualisierung sowie Lieferung, Montage oder Renovation nach vereinbartem Umfang.
            </p>
          </div>
        </div>
      </section>

      {/* Services Sections */}
      <section className={styles['services-categories']}>
        <div className={styles['categories-container']}>

          {/* Beratung */}
          <div className={`${styles['service-section']} ${styles.light} ${styles['scroll-reveal']}`}>
            <div className={styles['service-content']}>
              <div className={styles['service-text']}>
                <h3 className={styles['service-title']}>Auswahlberatung in der Ausstellung</h3>
                <div className={styles['service-description']}>
                  <p>
                    Bringen Sie Fotos, Grundriss, Masse oder vorhandene Muster mit. In unserer Ausstellung vergleichen
                    wir Platten, Möbel, Armaturen und Farben direkt miteinander und stellen eine Kombination zusammen,
                    die im Raum funktioniert.
                  </p>
                  <p>
                    Wenn technische Fragen oder ein Umbau im Vordergrund stehen, vereinbaren wir anschliessend eine
                    Besichtigung vor Ort.
                  </p>
                  <div className={styles['service-highlight']}>
                    <strong>Das erste Gespräch in der Ausstellung</strong> ist kostenlos und unverbindlich.
                  </div>
                </div>
              </div>
              <div className={styles['service-image']}>
                <img src={beratungImage} alt="Beratungsgespräch mit Unterlagen am Tisch" />
              </div>
            </div>
          </div>

          {/* Offerte und 3D-Visualisierung */}
          <div className={`${styles['service-section']} ${styles.dark} ${styles.reverse} ${styles['scroll-reveal']}`}>
            <div className={styles['service-content']}>
              <div className={styles['service-text']}>
                <h3 className={styles['service-title']}>Entscheiden, bevor bestellt wird</h3>
                <div className={styles['service-description']}>
                  <p>
                    Sobald Produkte, Masse und Leistungsumfang geklärt sind, erhalten Sie eine nachvollziehbare Offerte.
                    Für Bad und Küche zeigen wir Ihnen auf Wunsch in einer 3D-Visualisierung, wie Proportionen, Farben
                    und Materialwechsel zusammenwirken.
                  </p>
                  <p>
                    Die Visualisierung ist eine Entscheidungshilfe. Verbindlich bleiben die bestätigten Produkte,
                    Masse und Positionen der Offerte.
                  </p>
                  <div className={styles['service-highlight']}>
                    <strong>3D</strong> dort, wo es eine Entscheidung wirklich erleichtert.
                  </div>
                </div>
              </div>
              <div className={styles['service-image']}>
                <img src={visualisierungImage} alt="3D-Visualisierung" />
              </div>
            </div>
          </div>

          {/* Lieferung und Montage */}
          <div className={`${styles['service-section']} ${styles.light} ${styles['scroll-reveal']}`}>
            <div className={styles['service-content']}>
              <div className={styles['service-text']}>
                <h3 className={styles['service-title']}>Abgestimmt statt einzeln organisiert</h3>
                <div className={styles['service-description']}>
                  <p>
                    Wir stimmen Liefertermine, Zugang und Montage auf Ihr Projekt ab. Benötigt die Umsetzung weitere
                    Facharbeiten, koordinieren wir die vereinbarten Beteiligten und halten die Zuständigkeiten in der
                    Offerte fest.
                  </p>
                  <p>
                    So wissen Sie vor dem Start, welche Leistungen New Living Design übernimmt, welche Partner beteiligt
                    sind und welche Vorarbeiten erforderlich sind.
                  </p>
                  <div className={styles['service-highlight']}>
                    <strong>Ein klarer Ablauf</strong> und ein Ansprechpartner für die vereinbarten Leistungen.
                  </div>
                </div>
              </div>
              <div className={styles['service-image']}>
                <img src={lieferungImage} alt="Montage von Wandplatten auf der Baustelle" />
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Process Section */}
      <section className={`${styles['process-section']} ${styles['scroll-reveal']}`}>
        <div className={styles['process-container']}>
          <div className={styles['section-header']}>
            <span className={styles['section-label']}>Der Ablauf</span>
            <h2 className={styles['section-title']}>Drei Schritte bis zur Umsetzung</h2>
          </div>
          <div className={styles['process-steps']}>
            <div className={styles['process-step']}>
              <div className={styles['step-number']}>01</div>
              <h4 className={styles['step-title']}>Projekt klären</h4>
              <p className={styles['step-description']}>
                Wir besprechen Raum, Nutzung, Wünsche und Budget in der Ausstellung oder – wenn erforderlich –
                bei Ihnen vor Ort.
              </p>
            </div>
            <div className={styles['process-step']}>
              <div className={styles['step-number']}>02</div>
              <h4 className={styles['step-title']}>Auswahl und Offerte</h4>
              <p className={styles['step-description']}>
                Wir kombinieren Produkte und Materialien, prüfen Masse und Anschlüsse und erstellen die Offerte.
                Bei Bad und Küche ergänzt eine 3D-Visualisierung die Planung, wenn sie für die Entscheidung sinnvoll ist.
              </p>
            </div>
            <div className={styles['process-step']}>
              <div className={styles['step-number']}>03</div>
              <h4 className={styles['step-title']}>Lieferung und Umsetzung</h4>
              <p className={styles['step-description']}>
                Nach Ihrer Freigabe bestellen wir die Produkte, stimmen die Termine ab und koordinieren Lieferung,
                Montage und die vereinbarten Arbeiten.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={`${styles['cta-section']} ${styles['scroll-reveal']}`}>
        <div className={styles['cta-container']}>
          <div className={styles['cta-content']}>
            <h2 className={styles['cta-title']}>Womit sollen wir beginnen?</h2>
            <p className={styles['cta-description']}>
              Ein Foto, ein Grundriss oder eine erste Idee genügt. Sagen Sie uns, was Sie verändern möchten,
              und wir schlagen den passenden ersten Termin vor.
            </p>
            <div className={styles['cta-buttons']}>
              <Link to="/kontakt" className={`${styles['cta-button']} ${styles.primary}`}>
                <span>Beratung anfragen</span>
                <svg className={styles['cta-arrow']} viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <Link to="/produkte" className={`${styles['cta-button']} ${styles.secondary}`}>
                <span>Produkte ansehen</span>
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
          "@type": "Service",
          "provider": {
            "@type": "Organization",
            "name": "New Living Design GmbH",
            "url": "https://newlivingdesign.ch"
          },
          "serviceType": "Innenausbau & Design Services",
          "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Dienstleistungen von New Living Design",
            "itemListElement": [
              {
                "@type": "Offer",
                "itemOffered": {
                  "@type": "Service",
                  "name": "Auswahlberatung",
                  "description": "Auswahlberatung in der Ausstellung in Zofingen. Das erste Gespräch ist kostenlos und unverbindlich."
                }
              },
              {
                "@type": "Offer",
                "itemOffered": {
                  "@type": "Service",
                  "name": "3D-Visualisierung",
                  "description": "3D-Visualisierung als Entscheidungshilfe für Bad und Küche."
                }
              },
              {
                "@type": "Offer",
                "itemOffered": {
                  "@type": "Service",
                  "name": "Lieferung & Montage",
                  "description": "Koordinierte Lieferung, Montage und vereinbarte Facharbeiten."
                }
              }
            ]
          }
        }) }} />
    </main>
  );
};

export default Services;
