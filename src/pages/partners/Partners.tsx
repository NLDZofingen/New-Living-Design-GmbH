import React from "react";
import styles from "./Partners.module.css";
import heroImg from "../../assets/shutterstock_2580645597.webp";
import { Helmet } from "react-helmet-async";
import SupplierDirectory from "../../components/suppliers/SupplierDirectory";
import { suppliers } from "../../data/suppliers";

const withImages = suppliers.filter((s) => s.images.length > 0).length;

const Partners: React.FC = () => {
  return (
    <main id="main-content" className={styles["partners-page"]}>
      <Helmet>
        <title>Marken & Partner | New Living Design Zofingen</title>
        <link rel="canonical" href="https://newlivingdesign.ch/partner" />
        <meta
          name="description"
          content="Ausgewählte Marken für Bad, Armaturen, Platten, Oberflächen und Interior Design. Verfügbarkeit und passende Produkte klären wir persönlich."
        />
        <meta property="og:title" content="Marken & Partner – New Living Design GmbH" />
        <meta property="og:description" content="Marken und Sortimente, aus denen wir eine passende Auswahl für Ihr Projekt zusammenstellen." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://newlivingdesign.ch/partner" />
        <meta property="og:image" content={`https://newlivingdesign.ch${heroImg}`} />
      </Helmet>

      <section className={styles["partners-hero"]} aria-labelledby="partners-title">
        <h1 id="partners-title" className={styles["partners-title"]}>
          <span className={styles["title-line"]}>Marken, aus denen</span>
          <span>eine stimmige Auswahl wird.</span>
        </h1>
        <div className={styles["hero-aside"]}>
          <p className={styles["partners-subtitle"]}>
            Nicht jedes Produkt passt zu jedem Raum. Wir nutzen die Sortimente unserer Partner, um Materialien,
            Funktionen und Oberflächen passend zu Ihrem Projekt zusammenzustellen. Welche Serien verfügbar oder in
            Zofingen zu sehen sind, klären wir persönlich mit Ihnen.
          </p>
          <p className={styles["hero-facts"]}>
            <span><strong>{suppliers.length}</strong> Marken</span>
            <span><strong>{withImages}</strong> mit Bildern</span>
          </p>
          <p className={styles["hero-scroll-indicator"]}>Scrollen Sie nach unten</p>
        </div>
      </section>

      <section className={styles["partners-section"]} aria-label="Marken nach Bereich">
        <SupplierDirectory />
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Partner & Marken von New Living Design",
          "itemListElement": suppliers.map((p, i) => ({
            "@type": "Organization",
            "position": i + 1,
            "name": p.name,
            "url": p.url
          }))
        }) }} />
    </main>
  );
};

export default Partners;
