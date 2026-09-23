# PR2 — sales-first home and navigation

Authorized direction: **Bad, Platten and Wellness**, with product selection and the Zofingen showroom first. Renovation/packages remain available as a secondary offer; no service route, package, price or commercial condition was removed.

## Changes

- Home: split editorial hero with a real showroom photograph; three equally prominent product categories; showroom address/advice; three existing references; Badplaner; compact secondary renovation offer; final contact invitation.
- Removed the long generic/stock sections, home blog and renovation FAQ. Removed the unverified hardcoded 5.0/23 Google rating; retained a direct link to customer reviews. No replacement statistics or testimonials were invented.
- Wellness uses the existing product-catalog visual, identified alongside the other category images as supplier imagery. No technical capability, availability or installed-project claim was added.
- Main navigation: Bad, Platten, Wellness, Badplaner, Referenzen, Über uns, plus **Beratung anfragen** → `/kontakt`. `/booking` remains reachable in the footer as **Beratung & Ausstellung**, not a live booking promise.
- Mobile disclosure below 1100px, explicit ARIA, focus styles, Escape/focus return, navigation/desktop-resize cleanup. No new navigation dependency.
- Product anchors `#bad`, `#platten`, `#wellness` and hash-aware scroll behavior make category destinations concrete. Other existing anchor links benefit without changing their routes.
- Footer and global Organization/WebSite description now focus on Bad/Platten/Wellness and personal showroom advice, without claiming an in-house renovation team.
- Existing prices and `business.ts` are unchanged. The three home references are the grey-marble bathroom, petrol-tile bathroom and marble-look living-room floor; the full reference collection remains unchanged.

## Separability

PR2 source files:

- `src/pages/home/Home.tsx`, `Home.module.css`
- `src/components/header/Header.tsx`, `Header.css`
- `src/components/footer/Footer.tsx`
- `src/data/references.ts` (home-only featured selection)
- `src/pages/products/Products.tsx`, `Products.module.css` (anchors/scroll offset only)
- `src/components/scroll-helper/ScrollToTop.tsx`
- `src/utils/structuredData.ts` (two descriptive strings only)
- `scripts/check-pr2.mjs` and this document

These files are disjoint from the Badplaner/PR1 files and the four mechanical Patch-0 lint repairs. No commit, push or deployment was performed.

## Verification and limits

Run after local build/prerender:

```sh
npm test
npm run lint
npm run typecheck:api
npm run build:spa
npm run prerender
node scripts/check-pr2.mjs
git diff --check
```

The static checker verifies home hierarchy, category and reference destinations, existing price labels, seven locally available images, six-link navigation, retained secondary routes, CSS-module names and sales-first SEO. Pure/SSR navigation checks are not browser rendering tests.

**Browser layout, viewport overflow, keyboard interaction and screenshots remain unverified**: the available cloud browser blocked the local preview (`ERR_BLOCKED_BY_CLIENT`). Do not describe the redesign as visually signed off or production-ready. Before deployment, inspect 320/390/768/1100/1440px and 200% zoom, open/close the mobile menu with keyboard, follow all three category links and check real photo cropping/contrast.

`public/referenzen` was materialized from the same existing git commit for local asset verification; no new images or imagery providers were introduced. No external provider request, lead, email, booking or business data mutation was made during tests.
