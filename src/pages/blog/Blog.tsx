import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Blog.module.css';
import { SEOHead } from '../../components';
import { business, localBusinessJsonLd } from '../../config/business';
import { posts, formatDate, BLOG_NAME, BLOG_URL } from '../../lib/blog';
import { generateBreadcrumbStructuredData } from '../../utils/structuredData';

const Blog: React.FC = () => {
  const [latest, ...rest] = posts;

  const blogJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${BLOG_URL}#blog`,
    name: BLOG_NAME,
    url: BLOG_URL,
    inLanguage: 'de-CH',
    description: 'Praxiswissen von New Living Design zu Badumbau, Materialien, Kosten und Planung – verständlich erklärt für Eigentümerinnen und Eigentümer.',
    publisher: { '@id': `${business.siteUrl}/#organization` },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      '@id': `${p.absoluteUrl}#article`,
      headline: p.title,
      description: p.description,
      url: p.absoluteUrl,
      datePublished: p.date,
      dateModified: p.updated,
      image: `${business.siteUrl}${p.image}`,
      author: { '@type': 'Organization', name: business.legalName },
    })),
  };

  const structuredData = [
    blogJsonLd,
    localBusinessJsonLd,
    generateBreadcrumbStructuredData([
      { name: 'Home', url: '/' },
      { name: 'Blog', url: '/blog' },
    ]),
  ];

  return (
    <main id="main-content" className={styles.page}>
      <SEOHead
        title="Ratgeber zu Badumbau, Materialien & Kosten | NLD"
        description="Praxiswissen von New Living Design zu Badumbau, Materialien, Kosten und Planung – verständlich erklärt für Eigentümerinnen und Eigentümer."
        keywords="Badumbau Blog, Badumbau Kosten Aargau, Badezimmer Tipps, Platten Bad, Steuerabzug Badumbau, New Living Design Zofingen"
        url="/blog"
        type="website"
        structuredData={structuredData}
        image={latest ? `${business.siteUrl}${latest.image}` : undefined}
      />

      <section className={styles.intro}>
        <div className={styles.container}>
          <span className={styles.sectionLabel}>Aus der Praxis</span>
          <h1 className={styles.title}>Wissen, das Entscheidungen vor dem Umbau erleichtert.</h1>
          <p className={styles.lede}>
            Was kostet eine Lösung wirklich? Welche Oberfläche passt zur Nutzung? Und was muss vor der Bestellung
            geklärt sein? Hier teilen wir Erfahrungen aus Beratung, Planung und Ausführung – konkret und mit klarer
            Datumsangabe, wenn Preise oder Regeln eine Rolle spielen.
          </p>
        </div>
      </section>

      <section className={styles.list}>
        <div className={styles.container}>
          {!latest && <p className={styles.empty}>Noch keine Beiträge vorhanden. Bis der erste Artikel erscheint, beraten wir Sie gerne persönlich in Zofingen.</p>}

          {latest && (
            <Link to={latest.url} className={styles.featured}>
              <img src={latest.image} alt={latest.imageAlt} width="1600" height="1067" />
              <div className={styles.featuredText}>
                <span className={styles.category}>{latest.category}</span>
                <h2>{latest.title}</h2>
                <p>{latest.description}</p>
                <span className={styles.meta}>
                  <time dateTime={latest.date}>{formatDate(latest.date)}</time> · {latest.readingMinutes} Min. Lesezeit
                </span>
                <span className={styles.readMore}>Weiterlesen</span>
              </div>
            </Link>
          )}

          {rest.length > 0 && (
            <div className={styles.grid}>
              {rest.map((p) => (
                <Link key={p.slug} to={p.url} className={styles.card}>
                  <img src={p.image} alt={p.imageAlt} loading="lazy" width="800" height="533" />
                  <div className={styles.cardText}>
                    <span className={styles.category}>{p.category}</span>
                    <h2>{p.title}</h2>
                    <p>{p.description}</p>
                    <span className={styles.meta}>
                      <time dateTime={p.date}>{formatDate(p.date)}</time> · {p.readingMinutes} Min. Lesezeit
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={styles.cta}>
        <div className={styles.container}>
          <h2>Ihre Frage betrifft schon ein konkretes Projekt?</h2>
          <p>Bringen Sie Fotos, Masse oder einen Grundriss mit. In der Ausstellung lässt sich oft schneller klären, welche Information für Ihre Entscheidung fehlt.</p>
          <div className={styles.ctaRow}>
            <Link to="/kontakt" className={styles.ctaPrimary}>Beratung anfragen</Link>
            <Link to="/badumbau-zofingen" className={styles.ctaSecondary}>Badumbau und Preise ansehen</Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Blog;
