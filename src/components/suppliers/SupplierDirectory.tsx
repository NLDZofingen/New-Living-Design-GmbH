import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { areas, seriesInArea, supplierHref, suppliers, type AreaId, type Series, type Supplier } from '../../data/suppliers';
import styles from './SupplierDirectory.module.css';

type Filter = 'alle' | AreaId;

const filters: { id: Filter; title: string }[] = [
  { id: 'alle', title: 'Alle' },
  ...areas.map((a) => ({ id: a.id, title: a.title })),
];

const inFilter = (s: Supplier, f: Filter) => f === 'alle' || s.areas.some((a) => a.id === f);

const areaOrder = (s: Supplier) => areas.findIndex((a) => a.id === s.areas[0]?.id);
// Je Bereich zuerst die Marken mit Bildern, damit Bild- und Textkarten ruhige Gruppen bilden.
const ordered = [...suppliers].sort((a, b) => areaOrder(a) - areaOrder(b) || Number(b.images.length > 0) - Number(a.images.length > 0));

const countLabel = (series: Series[]) => {
  const n = series.reduce((sum, x) => sum + x.images.length, 0);
  if (!n) return 'Bilder folgen';
  const k = series.length;
  return `${k} ${k === 1 ? 'Serie' : 'Serien'} · ${n} ${n === 1 ? 'Bild' : 'Bilder'}`;
};

const Visual: React.FC<{ supplier: Supplier; series: Series[] }> = ({ supplier, series }) => {
  const [first, ...rest] = series.flatMap((x) => x.images);
  if (!first) {
    return (
      <span className={styles.typeVisual}>
        <span className={styles.typeName}>{supplier.name}</span>
        <span className={styles.typeSpecs}>{supplier.areas.flatMap((a) => a.specialties).join(' · ')}</span>
      </span>
    );
  }
  return (
    <span className={styles.visual}>
      {rest.slice(0, 2).reverse().map((img) => (
        <img key={img.src} src={img.src} srcSet={img.srcSet} sizes="300px" width={img.width} height={img.height} alt="" className={styles.behind} loading="lazy" decoding="async" />
      ))}
      <img src={first.src} srcSet={first.srcSet} sizes="(max-width: 767px) 100vw, 600px" width={first.width} height={first.height} alt="" className={styles.front} loading="lazy" decoding="async" />
    </span>
  );
};

/** Markenkarte: führt zur Markenseite mit allen Serien. */
export const SupplierCard: React.FC<{ supplier: Supplier; area?: AreaId; hidden?: boolean }> = ({ supplier, area, hidden }) => {
  // Auf Bereichsseiten nur die Serien dieses Bereichs (Megius/Novellini: Bad und Wellness getrennt).
  const series = area ? seriesInArea(supplier, area) : supplier.series;
  const n = series.reduce((sum, x) => sum + x.images.length, 0);
  const variant = n > 1 ? styles.stack : n === 1 ? styles.single : styles.text;
  return (
    <li className={`${styles.card} ${variant}`} hidden={hidden}>
      <Link to={supplierHref(supplier.key, area)} className={styles.summary}>
        <Visual supplier={supplier} series={series} />
        <span className={styles.caption}>
          <span className={styles.name}>{supplier.name}</span>
          <span className={styles.meta}>
            {(area ? supplier.areas.filter((a) => a.id === area).flatMap((a) => a.specialties) : supplier.areas.map((a) => a.title)).join(' · ')}
            <span className={styles.count}>{countLabel(series)}</span>
          </span>
        </span>
      </Link>
    </li>
  );
};

/** Kartenraster für eine Auswahl von Marken, z. B. ein Fachgebiet auf der Bereichsseite. */
export const SupplierList: React.FC<{ items: Supplier[]; area?: AreaId }> = ({ items, area }) => (
  <ul className={styles.grid}>{items.map((s) => <SupplierCard key={s.key} supplier={s} area={area} />)}</ul>
);

/** Markenverzeichnis mit Bereichsfilter; jede Karte führt zur Markenseite. */
const SupplierDirectory: React.FC = () => {
  const [filter, setFilter] = useState<Filter>('alle');
  const { hash } = useLocation();

  // Sprungmarken #bad usw. setzen den Filter.
  useEffect(() => {
    const id = hash.slice(1);
    if (filters.some((f) => f.id === id)) setFilter(id as Filter);
  }, [hash]);

  const visible = suppliers.filter((s) => inFilter(s, filter)).length;
  return (
    <div className={styles.directory}>
      <div className={styles.filterBar} role="group" aria-label="Marken nach Bereich filtern">
        {filters.map((f) => (
          <button key={f.id} id={f.id === 'alle' ? undefined : f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.title}<span>{suppliers.filter((s) => inFilter(s, f.id)).length}</span>
          </button>
        ))}
        <p className={styles.status} aria-live="polite">{visible} Marken</p>
      </div>
      <ul className={styles.grid}>
        {ordered.map((s) => <SupplierCard key={s.key} supplier={s} hidden={!inFilter(s, filter)} />)}
      </ul>
    </div>
  );
};

export default SupplierDirectory;
