# Badplaner — local synchronous hardening (PR1)

Baseline: `fc1f44c9d5bf9aa497a98314f3b9ae99ad20335f`.
No commit, push, deploy, new dependency, new datastore or new credential is part of this patch.
All automated provider tests use controlled fixtures and fake HTTP/clock/IDs; they send no lead or email.

## Scope and limits

This is a fail-closed **synchronous interim hardening**, not the complete durable lead/job architecture proposed by the audit.

- A rejected image or unavailable/unreadable checker result is never returned or emailed.
- Active selection IDs must be present, known and allowed for the package. UI defaults remain visible choices; the API does not silently pick the first option.
- Existing conditional fields are preserved: fixed chrome outside Atelier; tile-derived format for Atelier; Colore tap series; Atelier look/accent combination. Aliases remain supported, but conflicting explicit selection IDs fail.
- Prices, package data, available catalog entries and the main commercial rendering prompt are unchanged. The retry instruction no longer incorporates free-form provider text.
- Provider acceptance, failure, ambiguity and skipped optional delivery are distinct. HTTP acceptance is **not proof of inbox delivery**.
- There is **no `lead_saved`, durable idempotency key, queue, stored job, automatic resend or persistence guarantee**. The lead notification still follows successful rendering/checking. A rendering failure can still mean no lead reaches the company.
- Browser ref locks prevent accidental concurrent submits in that page instance. Identical API requests, page reloads, retries, separate devices or function instances are **not** deduplicated. Tests explicitly demonstrate this limitation.
- Rate counters remain process-local and cookies remain best-effort; this patch is not a distributed anti-abuse system.

The original full PR1 definition (persist lead before rendering, durable once-only acquisition and retryable notifications) therefore remains **incomplete until the owner chooses and authorizes a datastore/job approach**. Do not describe this patch as solving that requirement.

## Delivery contract

Successful render response:

```json
{
  "ok": true,
  "leadId": "bp-example",
  "image": { "mime": "image/png", "data": "base64" },
  "delivery": {
    "lead": "accepted",
    "leadProvider": "resend",
    "leadAttachments": true,
    "customer": "accepted",
    "newsletter": "skipped"
  }
}
```

`customer` and `newsletter` can be `accepted`, `failed`, `unknown` or `skipped`. Customer email failure preserves the approved on-screen image and shows a download warning. The API only returns render success after the company notification provider confirms acceptance.

| Condition | HTTP / result |
|---|---|
| Missing/unknown/ineligible selection | 400 `INVALID_SELECTION`, with `field` |
| Invalid image/contact/request | 400, no provider calls |
| Request JSON over 4 MiB | 413 `INPUT_TOO_LARGE` |
| Checker disabled or generation key unavailable | 503 `SERVICE_UNAVAILABLE`, no rendering |
| Checked rendering rejected | 502 `RENDER_REJECTED`, no image or mail |
| Checker unavailable/malformed/timed out | 502 `CHECK_UNAVAILABLE`, no image or mail |
| Generation failure | 502, no image or mail |
| Company notification failed/ambiguous | 502 `LEAD_DELIVERY_FAILED`; no customer email |
| Floorplan fallback omitted its requested attachment | 502 `ATTACHMENT_NOT_DELIVERED`; text may already have been forwarded |
| Customer email failed/ambiguous/missing configuration | 200 with approved image and explicit `delivery.customer` |

Resend requires a nonempty string `id` to confirm acceptance. Formspree requires `ok: true`. A 2xx response that cannot be verified is `unknown`, not success. Fallback to Formspree occurs for missing Resend configuration or an HTTP rejection; a network timeout/ambiguous response is not blindly duplicated through the fallback. Distributed exactly-once delivery is not possible here.

## Time and resource budgets

- Whole server request: **105 seconds**, below configured `maxDuration: 120`.
- Swatch lookup: **8 seconds total** across the existing two candidate URLs.
- Generation: up to 50 seconds; checker: up to 20 seconds. Generation/check stages reserve 25 seconds for notification delivery.
- Company Resend/Formspree: up to 8 seconds each; customer mail: 6 seconds; newsletter: 2 seconds. Every stage is also capped by the remaining global deadline.
- A retry requires **95 seconds remaining** (50 + 20 + 25). Thus the first swatch/generation/check must finish within roughly 10 seconds for a second attempt. This conservative condition is intentional; slow rejection returns a recoverable error instead of starting a request that cannot fit.
- Fetch timeouts cover response body consumption, including slow streams. Abort is accompanied by a promise deadline, so an adapter that ignores the signal cannot hold the handler open indefinitely. Streams and timer handles are cleaned up.
- Browser network wait: 115 seconds. Timing out a client cannot guarantee the server/provider did not already accept an operation; the UI does not promise otherwise for plan uploads.
- Incoming JSON: 4 MiB. Photo base64: 2.5 MiB characters. Generated image base64: 3.5 MiB characters. These caps leave response/request overhead margin.
- Current catalog swatches: 5 MiB bytes, preserving measured originals around 4.69 MB. URLs use the configured business origin plus server-owned catalog sources, **never incoming Host headers**; redirects are rejected.
- Raw client images: 20 MiB, 50 million pixels, maximum side 12,000, checked before browser decoding. Canvas output: maximum side 1280 for photos / 1800 for plans. Server checks MIME against signature and bounded PNG/JPEG/WebP dimensions.
- Plan PDFs: client limit 3,000,000 bytes so base64 plus JSON fits. Resized plan images reserve 64 KiB of base64 budget for the JSON envelope.

Image checks validate headers and resource bounds, **not complete compressed-pixel integrity, PNG CRC, semantic suitability or aggregate animated-WebP frame resources**. PDF checking is size/base64 plus `%PDF-` signature, not malware scanning. The existing geometric checker still only assesses added openings, not complete room geometry or material fidelity.

The optional swatch can still be unavailable (including a redirecting/mislabelled/oversized source); it then follows the existing no-swatch rendering path. Full deterministic assets/reference-board coverage remains a later task. The 5 MiB regression test prevents the new byte cap from dropping known-size current originals.

## Testability and verification

`createHandler({ fetch, env, clock, newId })` injects transport, environment, timers and IDs without changing production providers. The default export still serves `/api/badplaner`. Pure selection/image validation and deadline logic are separate modules outside `api/`, so they do not become extra Vercel routes.

`npm test` uses the already installed TypeScript compiler plus built-in `node:test`. It compiles into a temporary directory, runs fixtures, then removes only that directory. No network library or test dependency is installed. The integration suite replaces global fetch with a rejecting guard and injects a URL-checked fake transport.

Verified commands:

```sh
npm test
npm run lint
npm run typecheck:api
node node_modules/typescript/bin/tsc --noEmit -p api/tsconfig.json
npm run build:spa
npm run prerender
git diff --check
```

Automated coverage includes current UI payloads for all packages, missing/ineligible IDs, alias conflicts, conditional fields, wet-area accents, input type/signature/pixel limits, corrupt base64, first/second rejected rendering, generation/check failures, disabled checker, mail failures/ambiguity/fallback, attachment loss, body limits, hostile Host headers, malformed cookies, expired deadlines, slow response bodies and cleanup. All examples are fixture-only.

`npm run build` is intentionally not used here because its asset-fetch step can contact suppliers. Build/prerender success alone does not prove photo availability in a sparse checkout or actual provider quality. Browser/UI QA is a separate recorded check. No real Gemini golden-image assessment or real mail delivery has been performed.

Recorded local result: 129/129 automated tests passed; lint, both API typechecks, SPA build and `git diff --check` passed; prerender completed 15/15 routes. Browser UI/layout QA was **not executed**: the available cloud browser blocked access to the local preview (`ERR_BLOCKED_BY_CLIENT`). No screenshot or browser interaction result is claimed.

## Separable patches

Patch 0 (pre-existing lint repairs only):

- `api/og.tsx`: typed catch access without `any`.
- `src/pages/contact/Contact.tsx`: redundant cast removed.
- `src/utils/tracking.ts`: spread preserving method receiver; explicit consumption of existing unused argument.
- `vite.config.prerender.ts`: typed `import.meta.env` access.

PR1:

- `api/badplaner.ts`: injectable handler, strict contract, deadline-bound providers, fail-closed checker, honest notification outcomes.
- `server/badplaner/validation.ts`, `server/badplaner/budget.ts`: pure selection contract and deadline abstraction.
- `src/pages/badplaner/imageValidation.ts`, `resizeImage.ts`: shared image preflight and bounded browser resizing.
- `src/pages/badplaner/Badplaner.tsx`: unified step-4 gate, per-submit locks/timeouts, delivery warnings and honest upload/progress copy.
- `tests/badplaner/*.test.mjs`, `scripts/test-badplaner.mjs`, `tsconfig.badplaner.json`, `package.json`: dependency-free deterministic tests and explicit API typecheck.
- This document.

Home, navigation and the proposed sales-first Bad/Platten/Wellness redesign are a separate PR2. They are not part of this patch.

## Decisions still required

Do not silently add a database, queue, storage account, provider, retention policy, newsletter consent registry or CRM. The owner must choose retention/access/cost and deployment arrangements before durable lead acquisition/job retries can be implemented. Likewise, resolve contradictory commercial catalog rules (for example Essenza finishes, shower/bath replacement, double washbasins and the meaning of 3+ windows) with the owner; this patch deliberately does not invent new business rules.
