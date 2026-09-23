import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './Referenzen.module.css';
import { SEOHead } from '../../components';
import { business, localBusinessJsonLd } from '../../config/business';
import { references, categoryLabels, photoUrl } from '../../data/references';
import type { ReferenceCategory } from '../../data/references';
import { generateBreadcrumbStructuredData } from '../../utils/structuredData';

type Filter = 'alle' | ReferenceCategory;

interface LightboxState {
  refIndex: number;
  photoIndex: number;
}

const filters: { key: Filter; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'bad', label: categoryLabels.bad },
  { key: 'kueche', label: categoryLabels.kueche },
  { key: 'gaeste-wc', label: categoryLabels['gaeste-wc'] },
  { key: 'wohnraum', label: categoryLabels.wohnraum },
  { key: 'ausstellung', label: categoryLabels.ausstellung },
];

const Referenzen: React.FC = () => {
  const [filter, setFilter] = useState<Filter>('alle');
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const location = useLocation();

  // Anker wie /referenzen#bad-marmoroptik-grau-schwarz anspringen (SPA)
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      const t = setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [location.hash]);

  const visible = references
    .map((r, index) => ({ r, index }))
    .filter(({ r }) => filter === 'alle' || r.category === filter);

  const close = useCallback(() => setLightbox(null), []);

  const move = useCallback((dir: 1 | -1) => {
    setLightbox((cur) => {
      if (!cur) return cur;
      const photos = references[cur.refIndex].photos;
      const next = (cur.photoIndex + dir + photos.length) % photos.length;
      return { ...cur, photoIndex: next };
    });
  }, []);

  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowLeft') move(-1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox, close, move]);

  const galleryJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Referenzen: Bäder, Küchen & Wohnräume | New Living Design',
    url: `${business.siteUrl}/referenzen`,
    hasPart: references.map((r) => ({
      '@type': 'ImageGallery',
      name: r.title,
      description: r.summary,
      url: `${business.siteUrl}/referenzen#${r.id}`,
      image: r.photos.map((p) => `${business.siteUrl}${photoUrl(p.file)}`),
      ...(r.location ? { contentLocation: { '@type': 'Place', name: r.location } } : {}),
    })),
  };

  const structuredData = [
    localBusinessJsonLd,
    galleryJsonLd,
    generateBreadcrumbStructuredData([
      { name: 'Home', url: '/' },
      { name: 'Referenzen', url: '/referenzen' },
    ]),
  ];

  const current = lightbox ? references[lightbox.refIndex] : null;
  const currentPhoto = current && lightbox ? current.photos[lightbox.photoIndex] : null;

  return (
    <main id="main-content" className={styles.page}>
      <SEOHead
        title="Referenzen: Bäder, Küchen & Wohnräume | New Living Design"
        description="Realisierte Bäder, Küchen, Gäste-WCs und Wohnräume von New Living Design in Zofingen und Umgebung – mit Materialien und Details im Überblick."
        keywords="Referenzen Badumbau, Badezimmer Fotos, Küche Referenz Zofingen, Bad Marmoroptik, Badumbau Aargau Beispiele"
        url="/referenzen"
        type="website"
        structuredData={structuredData}
        image={`${business.siteUrl}${photoUrl('bad-marmor-grau-01.webp')}`}
      />

      <section className={styles.intro}>
        <div className={styles.container}>
          <span className={styles.sectionLabel}>Realisierte Projekte</span>
          <h1 className={styles.title}>Räume, die aus guten Entscheidungen entstanden sind.</h1>
          <p className={styles.lede}>
            Diese Bilder zeigen keine Musterwohnungen, sondern ausgeführte Projekte aus unserer Arbeit. Zu jedem Raum
            sehen Sie, welche Platten, Farben, Produkte und Details zusammengebracht wurden.
          </p>
          <div className={styles.filters} role="tablist" aria-label="Kategorie">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={`${styles.filter} ${filter === f.key ? styles.filterActive : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.list}>
        <div className={styles.container}>
          {visible.map(({ r, index }) => (
            <article key={r.id} id={r.id} className={styles.project}>
              <div className={styles.projectText}>
                <span className={styles.category}>{categoryLabels[r.category]}</span>
                <h2>{r.title}</h2>
                {(r.location || r.year) && (
                  <p className={styles.meta}>{[r.location, r.year].filter(Boolean).join(' · ')}</p>
                )}
                <p className={styles.summary}>{r.summary}</p>
                <ul className={styles.details}>
                  {r.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
              <div className={`${styles.gallery} ${r.photos.length === 1 ? styles.gallerySingle : ''}`}>
                {r.photos.map((p, photoIndex) => (
                  <button
                    key={p.file}
                    type="button"
                    className={styles.thumb}
                    onClick={() => setLightbox({ refIndex: index, photoIndex })}
                    aria-label={`${p.alt} – Foto vergrössern`}
                  >
                    <img src={photoUrl(p.file, true)} alt={p.alt} loading="lazy" width="640" height="853" />
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.cta}>
        <div className={styles.container}>
          <h2>Welche Entscheidungen passen zu Ihrem Raum?</h2>
          <p>
            Zeigen Sie uns, welches Projekt oder welches Detail Ihnen gefällt. In der Ausstellung vergleichen wir
            passende Materialien und klären, wie sich die Idee auf Ihren Raum übertragen lässt.
          </p>
          <div className={styles.ctaRow}>
            <Link to="/kontakt" className={styles.ctaPrimary}>Beratung anfragen</Link>
            <Link to="/badumbau-zofingen" className={styles.ctaSecondary}>Badumbau und Preise ansehen</Link>
          </div>
        </div>
      </section>

      {current && currentPhoto && lightbox && (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={current.title} onClick={close}>
          <button type="button" className={styles.lbClose} onClick={close} aria-label="Schliessen">×</button>
          {current.photos.length > 1 && (
            <>
              <button type="button" className={`${styles.lbNav} ${styles.lbPrev}`} onClick={(e) => { e.stopPropagation(); move(-1); }} aria-label="Vorheriges Foto">‹</button>
              <button type="button" className={`${styles.lbNav} ${styles.lbNext}`} onClick={(e) => { e.stopPropagation(); move(1); }} aria-label="Nächstes Foto">›</button>
            </>
          )}
          <figure className={styles.lbFigure} onClick={(e) => e.stopPropagation()}>
            <img src={photoUrl(currentPhoto.file)} alt={currentPhoto.alt} />
            <figcaption>
              {current.title} · {lightbox.photoIndex + 1}/{current.photos.length}
            </figcaption>
          </figure>
        </div>
      )}
    </main>
  );
};

export default Referenzen;
