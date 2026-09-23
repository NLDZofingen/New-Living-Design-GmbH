import React, { useRef, useState } from 'react';
import type { SupplierImage } from '../../data/suppliers';
import styles from './Gallery.module.css';

/**
 * Bildergalerie einer Serie: Wischen, Pfeile, Pfeiltasten, Zähler; ohne sichtbare Scrollleiste.
 * Bilder vollständig (contain), nie beschnitten.
 */
const Gallery: React.FC<{ images: SupplierImage[]; label: string; eager?: boolean }> = ({ images, label, eager }) => {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const n = images.length;
  // Blättert im Kreis: die Knöpfe werden nie deaktiviert, damit der Tastaturfokus nicht verloren geht.
  const step = (dir: number) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: ((index + dir + n) % n) * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
  };
  return (
    <div className={styles.gallery}>
      <div
        ref={track}
        className={styles.track}
        tabIndex={0}
        role="region"
        aria-label={n > 1 ? `${label}, ${n} Bilder, mit Pfeiltasten blättern` : label}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        onKeyDown={(e) => {
          if (n > 1 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); }
        }}
      >
        {images.map((img, i) => (
          <figure key={img.src} className={styles.slide}>
            <img {...img} sizes="(max-width: 1280px) calc(100vw - 2.5rem), 1152px" loading={eager && i === 0 ? 'eager' : 'lazy'} decoding="async" />
            <figcaption>{img.alt}</figcaption>
          </figure>
        ))}
      </div>
      {n > 1 && (
        <div className={styles.controls}>
          <button type="button" onClick={() => step(-1)} aria-label="Vorheriges Bild">←</button>
          <span aria-live="polite">{index + 1} / {n}</span>
          <button type="button" onClick={() => step(1)} aria-label="Nächstes Bild">→</button>
        </div>
      )}
    </div>
  );
};

export default Gallery;
