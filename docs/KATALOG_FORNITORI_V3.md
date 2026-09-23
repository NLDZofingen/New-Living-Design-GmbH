# Katalog Lieferanten V3 (Stand 23.09.2026)

Verbindliche Liste aktiver Marken: Angabe von NLD im Chat vom 23.09.2026.
Umgesetzt in `src/data/catalog.json` (einzige Quelle für Startseite, /produkte, Katalogseiten und /partner).

## Entfernt (nicht mehr geführt)

Fima, Naici, Roberto Cavalli Home Interiors, Lavastone, Dosem Ceramiche, Laminam, Tonino Lamborghini.
Nur aus Code und Seiten entfernt; alle Dateien (Logos, `Dosem_Onyx…jpg`) bleiben in `src/assets/`.

## Struktur

Bereich > Fachgebiet > Marke > Serien > Bilder, Daten in `src/data/catalog.json`:

- `/produkte/<bereich>`: Fachgebiete mit ihren Marken (z. B. `/produkte/bad`)
- `/produkte/<bereich>/<marke>`: Serien der Marke mit Galerie (z. B. `/produkte/bad/edone`)
- Megius und Novellini haben je eine Seite in Bad und in Wellness mit getrennten Serien.
- Alle 40 Seiten werden vorgerendert und stehen in der Sitemap (`scripts/routes.mjs`).

## Aktive Marken, Serien und Bilder

Stand: NLD-Medienpaket vom 23.09.2026 (3 Teile: Bad, Platten, Küchen/Wellness) plus Ergänzungspaket
vom 23.09.2026 (Treemme Appia, Mosavit Acquaris, Zenon Sonor SPC Floor, SICIS Crystal in 1200 px) und
zweitem Ergänzungspaket (Gessi Jacqueline, Megius Manolibera, Novellini Kuadra 2.0, SICIS Colibrì),
Nutzung von NLD freigegeben am 23.09.2026. Bilder liegen als WebP unverändert in
`public/images/katalog/<bereich>/<marke>/<serie>-NN-<breite>w.webp` (dazu `-960w.webp`, wenn breiter).
Quellen je Bild: `docs/IMAGE_SOURCES.md`. Zählung je Seite: `docs/KATALOG_INVENTAR.md`
(`npm run check:catalog`).

- 34 Marken, 36 Markenseiten, 40 Katalogseiten vorgerendert.
- 36 von 36 Seiten erfüllen die Anforderung ohne Ausnahme: mindestens 2 Serien mit je 2 Bildern.
  Die zweite Serie aus den Ergänzungspaketen: Treemme Appia, Mosavit Acquaris, Zenon Sonor SPC Floor,
  Gessi Jacqueline, Megius Manolibera, Novellini Kuadra 2.0, SICIS Colibrì (SICIS Crystal: vier
  Musterblätter in 1200 px ersetzen die 384-px-Miniaturen des ersten Pakets).
- Einzelbilder ohne vollständige Serie stehen auf der Markenseite unter «Weitere Bilder» (`"extra": true`
  in `catalog.json`) und zählen nicht für die Anforderung.
- Bereits kuratierte Bilder des Medienpakets vom 22.09.2026 wurden in die passende Paketserie eingeordnet;
  drei Duplikate (Edoné Hexis, Zenon Tempo, Novellini Fun) wurden durch die Paketdatei ersetzt und gelöscht.

### Nicht übernommene Paketbilder (mit Grund)

Innerhalb einer Serie wurde von gleichen Motiven (perzeptiver Hash, Abstand ≤ 6) nur die grösste Datei
übernommen. Ausserdem nicht übernommen:

- treemme: aurelia-01.webp, appia-01.webp – Finish-Muster (Messingscheibe), kein Produktfoto
- treemme: aurelia-02.webp, appia-02.webp – EU-Förderbanner, kein Produktfoto
- treemme: aurelia-03.webp, appia-03.webp – Stockfoto mit Laptop, kein Produktfoto
- gessi: origini-01.webp, origini-02.webp, origini-03.webp, origini-04.webp – Kampagnen-Stillleben ohne Produkt, 420 px
- luce: segno-02.webp, segno-05.webp – identisch mit Zefiro-Bild, Serie nicht eindeutig
- luce: zefiro-02.webp, zefiro-04.webp – identisch mit Segno-Bild, Serie nicht eindeutig
- antrax: hashi-02.webp, tavolina-02.webp – Porträt des Designers, kein Produktfoto
- caleido: infinito-05.webp – Messebanner Cersaie, kein Produktfoto
- caleido: dinamo-05.webp – Hotelzimmer ohne erkennbares Produkt
- megius: classic-01.webp, materia-01.webp – Cover eines Ratgebers, kein Produktfoto
- megius: classic-02.webp, classic-03.webp, classic-04.webp, classic-05.webp – vier fast identische Profildetails, keine Serienansicht
- novellini: riga-04.webp – zeigt einen Whirlpool, nicht die Duschserie Riga
- novellini: brera-01.webp – zeigt einen Whirlpool, nicht die Duschserie Brera
- febal: modula-01.webp, modula-02.webp, modula-03.webp – identisch mit Origina-Bild; laut Medienpaket Origina
- emilgroup: fornace-provenza-01.webp, fornace-provenza-02.webp, fornace-provenza-03.webp, w-circles-01.webp, w-circles-02.webp, w-circles-03.webp – identisch in beiden Emilgroup-Serien, Serie nicht eindeutig
- lafabbrica: venezia-02.webp – identisch mit Wabi-Sabi-Bild, Serie nicht eindeutig
- lafabbrica: wabi-sabi-01.webp – identisch mit Venezia-Bild, Serie nicht eindeutig
- lafabbrica: venezia-03.webp – Smartphone-Mockup, kein Produktfoto
- acquario: calathea-03.webp, calathea-04.webp – nur 204 px breit
- sicis: pixel-01.webp, pixel-03.webp, pixel-04.webp – Katalogcover mit Text
- sicis: pixel-05.webp – Katalogcover mit Text und Model
- mosavit: next-01.webp – Model vor Mosaik, Kampagnenfoto
- mosavit: piedra-java-01.webp, piedra-java-02.webp – Naturtextur, kein Produktfoto
- mosavit: piedra-java-03.webp – Baumrinde, kein Produktfoto
- mosavit: piedra-java-04.webp – Kieselsteine, kein Produktfoto
- mosavit: piedra-java-05.webp – Hand im Wasser, kein Produktfoto
- skema: villa-spina-02.webp, villa-spina-03.webp – identisch mit Palladio-Bild, Serie nicht eindeutig
- skema: palladio-04.webp, palladio-05.webp – identisch mit Villa-Spina-Bild, Serie nicht eindeutig
- deco: clap-real-01.webp – Roboterarm-Motiv, kein Produktfoto
- deco: clap-zer0-05.webp, clap-real-04.webp – identisch mit Clap-3D-Bild, Serie nicht eindeutig
- deco: clap-3d-02.webp, clap-3d-03.webp – identisch mit Clap-Zer0-Bild, Serie nicht eindeutig
- deco: clap-3d-04.webp, clap-3d-05.webp – identisch mit Clap-Real-Bild, Serie nicht eindeutig
- zenon: tempo-spc-floor-01.webp, tempo-spc-floor-02.webp, tempo-spc-floor-03.webp, tempo-spc-floor-04.webp – nur 281 px breit

## Websites

Aus dem Quellenregister; aus der Arbeitsumgebung nicht online prüfbar (Netzwerkrichtlinie).

## Bildregeln

- Katalog und Galerie: `object-fit: contain`, `scale-down` in der Galerie, nichts beschnitten, Quer- und Hochformate wie geliefert.
- Redaktionelle Projektbilder (Hero, Referenzen, Küche): `cover` mit gesetztem Fokuspunkt.
- Keine Vergrösserung über die Originalauflösung (geprüft bei 1440/1024/768/390 px).
