/**
 * Alle Routen der Website, an einer Stelle:
 *
 *   - feste Seiten aus routes.json
 *   - Katalog aus src/data/catalog.json: /produkte/<bereich> und /produkte/<bereich>/<marke>
 *   - Blogartikel aus src/content/blog/<slug>.md (ein Artikel = eine Datei,
 *     die Route /blog/<slug> entsteht aus dem Dateinamen)
 *
 * Wird von vite.config.ts (Sitemap) und scripts/prerender.mjs (statisches HTML)
 * gelesen. Ein neuer Artikel braucht deshalb keinen Eintrag in routes.json.
 * Artikel mit `draft: true` im Frontmatter bleiben überall aussen vor.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const blogDir = path.join(root, 'src', 'content', 'blog')

/** Liest einen einzelnen Frontmatter-Wert (z. B. `date: 2026-09-14`). */
function frontmatterValue(text, key) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) return undefined
  const m = fm[1].match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'))
  return m ? m[1].replace(/^["']|["']$/g, '') : undefined
}

/** Veröffentlichte Artikel: slug, Route, Datum, letzte Änderung. */
export function getBlogPosts() {
  if (!fs.existsSync(blogDir)) return []
  return fs
    .readdirSync(blogDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const text = fs.readFileSync(path.join(blogDir, f), 'utf8')
      const slug = f.replace(/\.md$/, '')
      const date = frontmatterValue(text, 'date')
      return {
        slug,
        route: `/blog/${slug}`,
        date,
        updated: frontmatterValue(text, 'updated') || date,
        draft: frontmatterValue(text, 'draft') === 'true',
      }
    })
    .filter((p) => !p.draft)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

/** Katalogseiten: jeder Bereich und jede Marke in jedem ihrer Bereiche. */
export function getCatalogRoutes() {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'catalog.json'), 'utf8'))
  return catalog.areas.flatMap((area) => {
    const brands = [...new Set(area.groups.flatMap((g) => g.brands))]
    return [`/produkte/${area.id}`, ...brands.map((b) => `/produkte/${area.id}/${b}`)]
  })
}

/** Feste Seiten plus Katalog plus Blogübersicht plus Artikel. */
export function getRoutes() {
  const fixed = JSON.parse(fs.readFileSync(path.join(root, 'routes.json'), 'utf8'))
  const blog = getBlogPosts().map((p) => p.route)
  return [...fixed, ...getCatalogRoutes(), ...blog.filter((r) => !fixed.includes(r))]
}
