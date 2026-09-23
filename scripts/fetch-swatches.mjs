/**
 * Lädt die Swatch-Bilder des Badplaners (Platten, Keramikfarben, Armaturen)
 * von den Lieferanten nach public/badplaner/swatches/, aber nur, wenn die
 * Datei dort noch fehlt. Läuft vor jedem Build (siehe package.json).
 *
 * Quelle der Liste: scripts/swatches.json (gleiche Daten wie `swatchSources`
 * in src/data/badplaner.ts). Fehler werden nur protokolliert: der Build
 * bricht nie ab, im Browser wird ein fehlendes Bild durch eine farbige Fläche
 * mit Beschriftung ersetzt.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const listFile = path.join(root, 'scripts', 'swatches.json')
const outDir = path.join(root, 'public', 'badplaner', 'swatches')

const TIMEOUT_MS = 15000
const PARALLEL = 6
const USER_AGENT = 'Mozilla/5.0 (compatible; NewLivingDesign-Badplaner/1.0; +https://newlivingdesign.ch)'

let list = []
try {
  list = JSON.parse(fs.readFileSync(listFile, 'utf8'))
} catch (err) {
  console.warn('[swatches] Liste nicht lesbar, überspringe:', err && err.message ? err.message : err)
  process.exit(0)
}

fs.mkdirSync(outDir, { recursive: true })

/**
 * Muster zeigen Farbe und Maserung, mehr nicht. Die Originale der Lieferanten sind
 * teils über 2 MB: der Browser lädt sie im Schritt 2 alle, und dasselbe Bild geht
 * bei jeder Anfrage nochmals an Gemini. Darum wird jede Datei über SWATCH_MAX_SIDE
 * einmal verkleinert. Der Schritt ist idempotent (eine bereits kleine Datei bleibt
 * unberührt) und bricht nie ab: ohne sharp oder bei einem Fehler bleibt das Original.
 */
const SWATCH_MAX_SIDE = 768
const SWATCH_QUALITY = 80

let sharp = null
try {
  sharp = (await import('sharp')).default
} catch (err) {
  console.warn('[swatches] sharp nicht verfügbar, Muster bleiben in Originalgrösse:', err && err.message ? err.message : err)
}

async function verkleinern(file) {
  if (!sharp) return null
  try {
    const vorher = fs.statSync(file).size
    const bild = sharp(file, { failOn: 'none' })
    const meta = await bild.metadata()
    if (!meta.width || !meta.height) return null
    if (Math.max(meta.width, meta.height) <= SWATCH_MAX_SIDE) return null
    let pipeline = bild.resize({ width: SWATCH_MAX_SIDE, height: SWATCH_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    if (meta.format === 'png') pipeline = pipeline.png({ compressionLevel: 9 })
    else if (meta.format === 'webp') pipeline = pipeline.webp({ quality: SWATCH_QUALITY })
    else pipeline = pipeline.jpeg({ quality: SWATCH_QUALITY, mozjpeg: true })
    const bytes = await pipeline.toBuffer()
    if (bytes.length < 400 || bytes.length >= vorher) return null
    const tmp = `${file}.small`
    fs.writeFileSync(tmp, bytes)
    fs.renameSync(tmp, file)
    return { vorher, nachher: bytes.length, breite: meta.width, hoehe: meta.height }
  } catch (err) {
    console.warn(`[swatches] Verkleinern übersprungen ${path.basename(file)}: ${err && err.message ? err.message : err}`)
    return null
  }
}

// Erst alles, was schon da ist: Repo-Dateien und alles aus dem Build-Cache.
let verkleinert = 0
let gespart = 0
for (const name of fs.readdirSync(outDir)) {
  if (name.endsWith('.part') || name.endsWith('.small')) continue
  const res = await verkleinern(path.join(outDir, name))
  if (res) {
    verkleinert++
    gespart += res.vorher - res.nachher
    console.log(`[swatches] klein ${name} ${Math.round(res.vorher / 1024)} KB -> ${Math.round(res.nachher / 1024)} KB (${res.breite}×${res.hoehe})`)
  }
}
if (verkleinert > 0) console.log(`[swatches] ${verkleinert} Muster verkleinert, ${Math.round(gespart / 1024)} KB gespart.`)

const missing = list.filter((s) => s.file && s.src && !fs.existsSync(path.join(outDir, s.file)))
if (missing.length === 0) {
  console.log(`[swatches] alle ${list.length} Swatches vorhanden.`)
  process.exit(0)
}
console.log(`[swatches] ${missing.length} von ${list.length} Swatches fehlen, lade herunter …`)

/** Lädt eine Datei; wirft bei HTTP-Fehler, Timeout oder falschem Inhaltstyp. */
async function download(item) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(item.src, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*;q=0.8' },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const type = res.headers.get('content-type') || ''
    if (!type.startsWith('image/')) throw new Error(`kein Bild (${type || 'unbekannter Typ'})`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length < 200) throw new Error('Datei leer')
    // Zuerst in eine temporäre Datei, damit nie eine halbe Datei liegen bleibt.
    const target = path.join(outDir, item.file)
    const tmp = `${target}.part`
    fs.writeFileSync(tmp, bytes)
    fs.renameSync(tmp, target)
    const klein = await verkleinern(target)
    return klein ? klein.nachher : bytes.length
  } finally {
    clearTimeout(timer)
  }
}

let ok = 0
let failed = 0
const queue = [...missing]

async function worker() {
  while (queue.length) {
    const item = queue.shift()
    try {
      const size = await download(item)
      ok++
      console.log(`[swatches] ok   ${item.file} (${Math.round(size / 1024)} KB)`)
    } catch (err) {
      failed++
      const reason = err && err.name === 'AbortError' ? 'Timeout' : err && err.message ? err.message : String(err)
      console.warn(`[swatches] FEHLER ${item.file}: ${reason}`)
    }
  }
}

try {
  await Promise.all(Array.from({ length: Math.min(PARALLEL, missing.length) }, worker))
} catch (err) {
  console.warn('[swatches] unerwarteter Fehler:', err && err.message ? err.message : err)
}
console.log(`[swatches] ${ok} geladen, ${failed} fehlgeschlagen.`)

/**
 * Schlusskontrolle: Jede Datei aus der Liste muss da sein UND wirklich ein Bild
 * sein. Fehlt eine, liefert Vercel für ihren Pfad die index.html mit Status 200
 * aus – im Badplaner sieht das wie ein graues Feld aus, und genau das darf nicht
 * online gehen. Darum bricht der Build hier ab; die Lösung ist, das fehlende
 * Bild in public/badplaner/swatches/ mit ins Repo zu legen.
 */
const magic = {
  jpg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
}
function istBild(file) {
  const head = Buffer.alloc(12)
  const fd = fs.openSync(file, 'r')
  try {
    fs.readSync(fd, head, 0, 12, 0)
  } finally {
    fs.closeSync(fd)
  }
  if (magic.jpg.every((b, i) => head[i] === b)) return true
  if (magic.png.every((b, i) => head[i] === b)) return true
  if (head.slice(0, 4).toString('latin1') === 'RIFF' && head.slice(8, 12).toString('latin1') === 'WEBP') return true
  return false
}

const kaputt = []
for (const item of list) {
  if (!item.file) continue
  const target = path.join(outDir, item.file)
  if (!fs.existsSync(target)) {
    kaputt.push(`${item.file} (fehlt)`)
    continue
  }
  if (fs.statSync(target).size < 400 || !istBild(target)) kaputt.push(`${item.file} (kein Bild)`)
}
if (kaputt.length > 0) {
  console.error(`[swatches] ${kaputt.length} Muster fehlen oder sind kein Bild:`)
  kaputt.slice(0, 40).forEach((f) => console.error(`[swatches]   ${f}`))
  if (process.env.VERCEL) {
    console.error('[swatches] Build abgebrochen: keine Option ohne echtes Bild.')
    process.exit(1)
  }
  console.warn('[swatches] lokaler Build: ohne Netz zu den Lieferanten wird nur gewarnt.')
}

else console.log(`[swatches] alle ${list.length} Muster geprüft, alle sind echte Bilder.`)
process.exit(0)
