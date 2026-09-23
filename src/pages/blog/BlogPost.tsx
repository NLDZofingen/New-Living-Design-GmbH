import React from 'react';
import { Link, useParams } from 'react-router-dom';
import styles from './BlogPost.module.css';
import { SEOHead } from '../../components';
import { business, bathPackages, localBusinessJsonLd } from '../../config/business';
import { getPost, posts, formatDate, BLOG_NAME, BLOG_URL } from '../../lib/blog';
import Markdown from '../../lib/markdown';
import { generateBreadcrumbStructuredData } from '../../utils/structuredData';

const whatsappHref = (title: string) =>
  `https://wa.me/${business.whatsapp.e164.replace('+', '')}?text=${encodeURIComponent(
    `Guten Tag, ich habe Ihren Artikel «${title}» gelesen und habe eine Frage zu meinem Bad.`
  )}`;

/** Wird gezeigt, wenn es zum Slug keinen Artikel gibt (z. B. alter Link). */
const NotFound: React.FC = () => (
  <main id="main-content" className={styles.page}>
    <SEOHead title="Artikel nicht gefunden | New Living Design" description="Diesen Blogartikel gibt es nicht (mehr)." url="/blog" noindex />
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        <h1 className={styles.title}>Diesen Artikel gibt es nicht</h1>
        <p className={styles.lede}>Vielleicht wurde er verschoben. Alle Beiträge finden Sie in der Übersicht.</p>
        <Link to="/blog" className={styles.ctaPrimary}>Zum Blog</Link>
      </div>
    </section>
  </main>
);

const BlogPost: React.FC = () => {
  const { slug = '' } = useParams();
  const post = getPost(slug);
  if (!post) return <NotFound />;

  const imageUrl = `${business.siteUrl}${post.image}`;
  const others = posts.filter((p) => p.slug !== post.slug).slice(0, 3);

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${post.absoluteUrl}#article`,
    headline: post.title,
    description: post.description,
    image: [imageUrl],
    datePublished: post.date,
    dateModified: post.updated,
    inLanguage: 'de-CH',
    wordCount: post.wordCount,
    articleSection: post.category,
    keywords: post.keywords.join(', '),
    url: post.absoluteUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': post.absoluteUrl },
    isPartOf: { '@type': 'Blog', '@id': `${BLOG_URL}#blog`, name: BLOG_NAME, url: BLOG_URL },
    author: { '@type': 'Organization', '@id': `${business.siteUrl}/#organization`, name: business.legalName, url: business.siteUrl },
    publisher: {
      '@type': 'Organization',
      '@id': `${business.siteUrl}/#organization`,
      name: business.legalName,
      url: business.siteUrl,
      logo: { '@type': 'ImageObject', url: `${business.siteUrl}/logo.png` },
    },
  };

  const structuredData = [
    articleJsonLd,
    localBusinessJsonLd,
    generateBreadcrumbStructuredData([
      { name: 'Home', url: '/' },
      { name: 'Blog', url: '/blog' },
      { name: post.title, url: post.url },
    ]),
  ];

  return (
    <main id="main-content" className={styles.page}>
      <SEOHead
        title={`${post.seoTitle} | New Living Design`}
        description={post.description}
        keywords={post.keywords.join(', ')}
        url={post.url}
        type="article"
        image={imageUrl}
        structuredData={structuredData}
      >
        <meta property="article:published_time" content={post.date} />
        <meta property="article:modified_time" content={post.updated} />
        <meta property="article:section" content={post.category} />
        <meta property="article:author" content={business.legalName} />
      </SEOHead>

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link to="/">Home</Link><span aria-hidden="true">/</span>
            <Link to="/blog">Blog</Link><span aria-hidden="true">/</span>
            <span>{post.category}</span>
          </nav>
          <h1 className={styles.title}>{post.title}</h1>
          <p className={styles.lede}>{post.description}</p>
          <p className={styles.meta}>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            {post.updated !== post.date && <span> · aktualisiert am {formatDate(post.updated)}</span>}
            <span> · {post.readingMinutes} Min. Lesezeit</span>
            <span> · {business.name}, Zofingen</span>
          </p>
        </div>
      </section>

      <article className={styles.article}>
        <figure className={styles.cover}>
          <img src={post.image} alt={post.imageAlt} />
          <figcaption>{post.imageAlt}</figcaption>
        </figure>

        <Markdown source={post.body} className={styles.body} />

        <aside className={styles.contact} aria-label="Kontakt">
          <div>
            <h2>Fragen zu Ihrem Bad?</h2>
            <p>
              Rufen Sie an oder schreiben Sie uns auf WhatsApp. Oder kommen Sie in die Ausstellung,{' '}
              {business.address.street}, {business.address.zip} {business.address.city}.
            </p>
          </div>
          <div className={styles.contactActions}>
            <a href={`tel:${business.phone.e164}`} className={styles.ctaPrimary} data-lead="blog-phone">
              {business.phone.display}
            </a>
            <a
              href={whatsappHref(post.title)}
              className={styles.ctaSecondary}
              target="_blank"
              rel="noopener noreferrer"
              data-lead="blog-whatsapp"
            >
              WhatsApp {business.whatsapp.display}
            </a>
          </div>
        </aside>

        <section className={styles.packages} aria-labelledby="pakete-titel">
          <h2 id="pakete-titel">Was ein Badumbau bei uns kostet</h2>
          <p className={styles.packagesIntro}>
            Drei Badpakete mit Fixpreis, Material und Montage inklusive. Farbe der Platten, Möbel und Armaturen kostet nichts extra.
          </p>
          <div className={styles.packageGrid}>
            {bathPackages.map((p) => (
              <Link key={p.id} to={`/badumbau-zofingen#paket-${p.id}`} className={`${styles.package} ${p.highlight ? styles.packageHighlight : ''}`}>
                <span className={styles.packageName}>{p.name}</span>
                <span className={styles.packagePrice}>ab CHF {p.priceLabel}</span>
                <span className={styles.packageClaim}>{p.claim}</span>
                <span className={styles.packageMore}>Paket ansehen</span>
              </Link>
            ))}
          </div>
          <p className={styles.packageNote}>Richtpreise inkl. 8.1 % MwSt. für ein Bad von ca. 6 m². Fixpreis nach der Besichtigung vor Ort.</p>
        </section>

        {others.length > 0 && (
          <section className={styles.more} aria-labelledby="weitere-titel">
            <h2 id="weitere-titel">Weitere Beiträge</h2>
            <div className={styles.moreGrid}>
              {others.map((p) => (
                <Link key={p.slug} to={p.url} className={styles.moreCard}>
                  <img src={p.image} alt="" loading="lazy" width="640" height="427" />
                  <span className={styles.moreCategory}>{p.category}</span>
                  <span className={styles.moreTitle}>{p.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <p className={styles.back}>
          <Link to="/blog">← Alle Beiträge</Link>
        </p>
      </article>
    </main>
  );
};

export default BlogPost;
