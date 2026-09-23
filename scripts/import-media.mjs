/**
 * Importiert offizielle Herstellerbilder in den Katalog.
 *
 *   node scripts/import-media.mjs <ordner-oder-csv>
 *
 * Eingabe: ein Ordner mit `serien.csv` (UTF-8, Trennzeichen `;`) und den Bilddateien.
 * Spalten: bereich;marke;serie;datei;alt_de;quelle_url[;bild_url]
 *   - `datei`: Pfad relativ zum Ordner. Fehlt die Datei und ist `bild_url` gesetzt, wird sie
 *     von dort geladen (nur offizielle Herstellerseiten verwenden).
 *
 * Ausgabe je Bild: public/images/katalog/<bereich>/<marke>/<serie>-NN-<breite>w.webp
 * (lange Kante höchstens 2000 px, fertige WebP-Dateien unverändert; dazu eine 960w-Variante, wenn das Bild breiter ist; nie vergrössert),
 * ein Eintrag in src/data/catalog.json und eine Zeile in docs/IMAGE_SOURCES.md.
 * Bereits importierte Bilder (gleicher Inhalt) werden übersprungen.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = path.join(root, 'src', 'data', 'catalog.json')
const sourcesPath = path.join(root, 'docs', 'IMAGE_SOURCES.md')
const MAX = 2000
const SMALL = 960
const AUTH = 'Nutzung von NLD freigegeben am 23.09.2026'

const input = process.argv[2]
if (!input) {
  console.error('Aufruf: node scripts/import-media.mjs <ordner mit serien.csv>')
  process.exit(1)
}
const dir = fs.statSync(input).isDirectory() ? input : path.dirname(input)
const csvPath = fs.statSync(input).isDirectory() ? path.join(input, 'serien.csv') : input

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const rows = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
const head = rows.shift().split(';').map((h) => h.trim())
const records = rows.map((line) => Object.fromEntries(line.split(';').map((v, i) => [head[i], v.trim()])))

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
const today = new Date().toISOString().slice(0, 10)
const known = new Set(
  catalog.areas.flatMap((a) => a.groups.flatMap((g) => g.brands.map((b) => `${a.id}/${b}`))),
)
const hashes = new Set(
  Object.values(catalog.suppliers).flatMap((s) => s.series.flatMap((x) => x.images.map((i) => i.sha1).filter(Boolean))),
)
const sourceLines = []
let added = 0

for (const r of records) {
  const key = `${r.bereich}/${r.marke}`
  if (!known.has(key)) throw new Error(`Unbekannte Kombination Bereich/Marke: ${key}`)
  if (!r.serie || !r.alt_de || !r.quelle_url) throw new Error(`Serie, alt_de und quelle_url sind Pflicht: ${JSON.stringify(r)}`)
  let buf
  const file = r.datei ? path.join(dir, r.datei) : ''
  if (file && fs.existsSync(file)) buf = fs.readFileSync(file)
  else if (r.bild_url) {
    const res = await fetch(r.bild_url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewLivingDesign-Katalog/1.0)' } })
    if (!res.ok) throw new Error(`${r.bild_url}: HTTP ${res.status}`)
    buf = Buffer.from(await res.arrayBuffer())
  } else throw new Error(`Datei fehlt und keine bild_url: ${r.datei}`)

  const sha1 = crypto.createHash('sha1').update(buf).digest('hex')
  if (hashes.has(sha1)) { console.log(`= übersprungen (schon vorhanden): ${r.datei || r.bild_url}`); continue }
  hashes.add(sha1)

  const supplier = catalog.suppliers[r.marke]
  let series = supplier.series.find((s) => s.area === r.bereich && s.name === r.serie)
  if (!series) { series = { area: r.bereich, name: r.serie, images: [] }; supplier.series.push(series) }
  const n = String(series.images.length + 1).padStart(2, '0')
  const base = `katalog/${r.bereich}/${r.marke}/${slug(r.serie)}-${n}`
  const outDir = path.join(root, 'public', 'images', path.dirname(base))
  fs.mkdirSync(outDir, { recursive: true })

  const img = sharp(buf).rotate()
  const meta = await img.metadata()
  const scale = Math.min(1, MAX / Math.max(meta.width, meta.height))
  const width = Math.round(meta.width * scale)
  const height = Math.round(meta.height * scale)
  const target = path.join(root, 'public', 'images', `${base}-${width}w.webp`)
  // Fertig optimiertes WebP unverändert übernehmen (keine zweite Kompression), sonst konvertieren.
  if (meta.format === 'webp' && scale === 1 && !meta.orientation) fs.writeFileSync(target, buf)
  else await sharp(buf).rotate().resize(width, height).webp({ quality: 82 }).toFile(target)
  if (width > SMALL) await sharp(buf).rotate().resize(SMALL).webp({ quality: 80 }).toFile(path.join(root, 'public', 'images', `${base}-${SMALL}w.webp`))

  series.images.push({ pack: base, width, height, alt: r.alt_de, sha1 })
  sourceLines.push(`| \`public/images/${base}-${width}w.webp\` | ${r.bereich} | ${supplier.name} | ${r.serie} | ${r.quelle_url} | ${today} | ${AUTH} |`)
  added++
  console.log(`+ ${base} (${width}x${height})`)
}

fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n')
if (sourceLines.length) fs.appendFileSync(sourcesPath, sourceLines.join('\n') + '\n')
console.log(`${added} Bilder importiert.`)
