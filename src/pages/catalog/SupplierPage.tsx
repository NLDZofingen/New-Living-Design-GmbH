import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { SEOHead } from '../../components';
import Gallery from '../../components/suppliers/Gallery';
import { areaById, areaHref, groupSlug, seriesInArea, supplierByKey, supplierHref, suppliers, type SupplierKey } from '../../data/suppliers';
import styles from './Catalog.module.css';

/** Markenseite: Bereich > Fachgebiet > Marke > Serien mit ihren Bildern. */
const SupplierPage: React.FC = () => {
  const { area: areaId = '', supplier: key = '' } = useParams();
  const area = areaById(areaId);
  const supplier = suppliers.find((s) => s.key === key);
  const inArea = supplier?.areas.find((a) => a.id === area?.id);
  if (!area || !supplier || !inArea) return <Navigate to="/produkte" replace />;
  const all = seriesInArea(supplier, area.id);
  const series = all.filter((s) => !s.extra);
  const extras = all.filter((s) => s.extra);
  const group = area.groups.find((g) => g.brands.includes(supplier.key))!;
  const neighbours = group.brands.filter((b) => b !== supplier.key);
  const otherAreas = supplier.areas.filter((a) => a.id !== area.id);
  return (
    <main id="main-content" className={styles.page}>
      <SEOHead
        title={`${supplier.name}: ${inArea.specialties.join(', ')} | New Living Design Zofingen`}
        description={`${supplier.name} bei New Living Design in Zofingen: ${inArea.specialties.join(', ')}. Auswahl, Beratung und Planung persönlich mit Ihnen.`}
        url={supplierHref(supplier.key, area.id)}
        type="website"
        image={all[0] ? `https://newlivingdesign.ch${all[0].images[0].src}` : undefined}
      />
      <div className={styles.container}>
        <nav aria-label="Brotkrumen" className={styles.crumbs}>
          <ol>
            <li><Link to="/produkte">Produkte</Link></li>
            <li><Link to={areaHref(area.id)}>{area.title}</Link></li>
            <li><Link to={`${areaHref(area.id)}#${groupSlug(group.title)}`}>{group.title}</Link></li>
            <li aria-current="page">{supplier.name}</li>
          </ol>
        </nav>
        <header className={styles.supplierHead}>
          <div>
            <p className={styles.eyebrow}>{inArea.specialties.join(' · ')}</p>
            <h1>{supplier.name}</h1>
            <p className={styles.facts}>{all.length ? `${series.length} ${series.length === 1 ? 'Serie' : 'Serien'} · ${all.reduce((n, s) => n + s.images.length, 0)} Bilder` : 'Bilder folgen'}</p>
          </div>
          <div className={styles.supplierActions}>
            <a href={supplier.url} target="_blank" rel="noopener noreferrer">Offizielle Website<span className={styles.srOnly}> von {supplier.name} (öffnet in neuem Fenster)</span></a>
            <Link to="/kontakt">Beratung anfragen</Link>
            {otherAreas.map((a) => <Link key={a.id} to={supplierHref(supplier.key, a.id)}>{supplier.name} im Bereich {a.title}</Link>)}
          </div>
        </header>
        {series.length ? series.map((s, i) => (
          <section key={s.name} className={styles.series} aria-labelledby={`serie-${i}`}>
            <div className={styles.seriesHead}>
              <h2 id={`serie-${i}`}>{s.name}</h2>
              <span>{s.images.length} {s.images.length === 1 ? 'Bild' : 'Bilder'}</span>
            </div>
            <Gallery images={s.images} label={`${supplier.name} ${s.name}`} eager={i === 0} />
          </section>
        )) : !extras.length && (
          <section className={styles.pending} aria-label="Serien">
            <p>Für diese Marke liegen noch keine freigegebenen Serienbilder vor.</p>
            <p>Welche Serien verfügbar oder in Zofingen zu sehen sind, klären wir persönlich mit Ihnen.</p>
          </section>
        )}
        {extras.length > 0 && (
          <section className={styles.series} aria-labelledby="weitere-bilder">
            <div className={styles.seriesHead}>
              <h2 id="weitere-bilder">Weitere Bilder</h2>
              <span>{extras.map((s) => s.name).join(' · ')}</span>
            </div>
            <Gallery images={extras.flatMap((s) => s.images)} label={`${supplier.name}: weitere Bilder`} eager={!series.length} />
          </section>
        )}
        {neighbours.length > 0 && (
          <nav aria-label={`Weitere Marken: ${group.title}`} className={styles.otherAreas}>
            <p>Weitere Marken: {group.title}</p>
            <ul>{neighbours.map((b: SupplierKey) => <li key={b}><Link to={supplierHref(b, area.id)}>{supplierByKey(b).name}</Link></li>)}</ul>
          </nav>
        )}
      </div>
    </main>
  );
};

export default SupplierPage;
