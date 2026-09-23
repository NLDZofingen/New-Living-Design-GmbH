/**
 * Prüft den Katalog (src/data/catalog.json) und schreibt docs/KATALOG_INVENTAR.md.
 *
 *   npm run check:catalog
 *
 * Mindestanforderung je Markenseite (/produkte/<bereich>/<marke>), ohne Ausnahmen:
 *   mindestens 2 Serien mit je mindestens 2 Bildern.
 *   Serien mit `"extra": true` («Weitere Bilder», Einzelbilder ohne vollständige Serie) zählen nicht.
 * Ausserdem: jede Bilddatei existiert, kein Bild wird doppelt verwendet.
 * Exit-Code 1, sobald eine Seite die Anforderung nicht erfüllt.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'catalog.json'), 'utf8'))

const fileOf = (img) => (img.pack ? path.join('public', 'images', `${img.pack}-${img.width}w.webp`) : path.join('src', 'assets', img.asset))
const errors = []
const seen = new Map()
const lines = []

for (const area of catalog.areas) {
  const brands = [...new Set(area.groups.flatMap((g) => g.brands))]
  for (const key of brands) {
    const s = catalog.suppliers[key]
    const all = s.series.filter((x) => x.area === area.id)
    const series = all.filter((x) => !x.extra)
    const images = all.reduce((n, x) => n + x.images.length, 0)
    const route = `/produkte/${area.id}/${key}`
    const problems = []
    for (const x of all) {
      for (const img of x.images) {
        const f = fileOf(img)
        if (!fs.existsSync(path.join(root, f))) problems.push(`Datei fehlt: ${f}`)
        const id = img.sha1 || f
        if (seen.has(id)) problems.push(`Bild doppelt (auch bei ${seen.get(id)}): ${f}`)
        else seen.set(id, `${route} ${x.name}`)
      }
    }
    if (!images) problems.push('keine Bilder')
    else if (series.length < 2 || series.some((x) => x.images.length < 2)) {
      const thin = series.filter((x) => x.images.length < 2).map((x) => x.name)
      problems.push(series.length < 2 ? `nur ${series.length} Serie` : `Serien mit weniger als 2 Bildern: ${thin.join(', ')}`)
    }
    if (problems.length) errors.push(`${route}: ${problems.join('; ')}`)
    const detail = all.map((x) => `${x.name} (${x.images.length})${x.extra ? '*' : ''}`).join(', ') || '—'
    lines.push(`| ${area.title} | ${s.name} | \`${route}\` | ${series.length} | ${images} | ${detail} | ${problems.length ? '❌ ' + problems.join('; ') : '✅'} |`)
  }
}

const ok = lines.filter((l) => l.includes('| ✅')).length
const report = `# Katalog-Inventar

Automatisch erzeugt von \`npm run check:catalog\`. Anforderung je Seite, ohne Ausnahmen:
mindestens 2 Serien mit je mindestens 2 Bildern.
Mit * markierte Serien sind Einzelbilder im Abschnitt «Weitere Bilder» und zählen nicht.

**${ok} von ${lines.length} Seiten erfüllt.**

| Bereich | Marke | Seite | Serien | Bilder | Serien (Bilder) | Status |
|---|---|---|---|---|---|---|
${lines.join('\n')}
`
fs.writeFileSync(path.join(root, 'docs', 'KATALOG_INVENTAR.md'), report)
console.log(`${ok}/${lines.length} Markenseiten erfüllen die Anforderung.`)
if (errors.length) {
  console.error(errors.map((e) => `  ✗ ${e}`).join('\n'))
  process.exit(1)
}
