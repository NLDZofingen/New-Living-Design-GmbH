import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { SEOHead } from '../../components';
import { SupplierList } from '../../components/suppliers/SupplierDirectory';
import { areaById, areaHref, areas, groupSlug, imageOf, supplierByKey, type AreaId, type SupplierKey } from '../../data/suppliers';
import styles from './Catalog.module.css';

// Einstiegsbild je Bereich (Medienpaket, Originalformat 16:9).
const heroOf: Record<AreaId, SupplierKey> = { bad: 'edone', kuechen: 'febal', platten: 'lafabbrica', wellness: 'novellini' };

/** Bereichsseite: Fachgebiete mit ihren Marken, jede Marke führt zu ihren Serien. */
const CategoryPage: React.FC = () => {
  const { area: areaId = '' } = useParams();
  const area = areaById(areaId);
  if (!area) return <Navigate to="/produkte" replace />;
  const hero = imageOf(heroOf[area.id]);
  const brandCount = new Set(area.groups.flatMap((g) => g.brands)).size;
  return (
    <main id="main-content" className={styles.page}>
      <SEOHead
        title={`${area.title}: Marken und Serien | New Living Design Zofingen`}
        description={area.text}
        url={areaHref(area.id)}
        type="website"
      />
      <div className={styles.container}>
        <nav aria-label="Brotkrumen" className={styles.crumbs}>
          <ol><li><Link to="/produkte">Produkte</Link></li><li aria-current="page">{area.title}</li></ol>
        </nav>
        <header className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>{area.label}</p>
            <h1>{area.title}</h1>
            <p className={styles.lead}>{area.text}</p>
            <p className={styles.facts}>{brandCount} Marken · {area.groups.length} {area.groups.length === 1 ? 'Fachgebiet' : 'Fachgebiete'}</p>
          </div>
          <figure className={styles.introFigure}>
            <img {...hero} sizes="(max-width: 900px) 100vw, 640px" fetchPriority="high" />
            <figcaption>Marke: <Link to={`${areaHref(area.id)}/${heroOf[area.id]}`}>{supplierByKey(heroOf[area.id]).name}</Link></figcaption>
          </figure>
        </header>
        <nav aria-label="Fachgebiete" className={styles.groupIndex}>
          <ul>{area.groups.map((g) => <li key={g.title}><a href={`#${groupSlug(g.title)}`}>{g.title}<span>{g.brands.length}</span></a></li>)}</ul>
        </nav>
        {area.groups.map((g) => (
          <section key={g.title} id={groupSlug(g.title)} className={styles.group} aria-labelledby={`${groupSlug(g.title)}-title`}>
            <h2 id={`${groupSlug(g.title)}-title`}>{g.title}</h2>
            <SupplierList items={g.brands.map(supplierByKey)} area={area.id} />
          </section>
        ))}
        <nav aria-label="Weitere Bereiche" className={styles.otherAreas}>
          <p>Weitere Bereiche</p>
          <ul>{areas.filter((a) => a.id !== area.id).map((a) => <li key={a.id}><Link to={areaHref(a.id)}>{a.title}</Link></li>)}</ul>
        </nav>
      </div>
    </main>
  );
};

export default CategoryPage;
