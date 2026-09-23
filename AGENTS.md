# AGENTS.md

Rules for every AI agent working on this repository (Codex, Claude, Copilot and others).

## 1. Costs: nothing new without the owner's OK

Never make a change that raises running costs or adds a paid service unless the owner has approved it explicitly. This covers:

- switching an AI model or tier, or asking it for higher resolution or quality
- more generations, more retries or higher daily limits per visitor
- a new paid API, SaaS product, plan upgrade or billed Vercel setting

If such a change is needed, start the PR title with `Kosten:` and state in the description the expected extra cost in CHF per month and the reason. Leave that PR open for the owner to merge. Do not merge it yourself.

## 2. Project rules

- API keys and secrets live only in the Vercel environment variables, never in the code or in the repo.
- The only person named on the site is Emanuel Verdile as Ansprechpartner. Do not add other names of family members or staff; stay generic ("Familienunternehmen", "unser Team"). The Impressum stays as it is.
- Site texts are Swiss German: "ss" instead of "ß", apostrophe as thousands separator (21'300).
- Before opening a PR run `npm run lint`, `npm test` and `npm run build`. If something was already failing before your change, say so in the PR description instead of working around it.

## 3. Ponytail: the least code that works

You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.

Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse the helper, util, or pattern that's already here, don't re-write it.
3. Does the standard library already do this? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

The ladder runs after you understand the problem, not instead of it: read the task and the code it touches, trace the real flow end to end, then climb.

Bug fix = root cause, not symptom: a report names a symptom. Grep every caller of the function you touch and fix the shared function once. One guard there is a smaller diff than one per caller, and patching only the path the ticket names leaves a sibling caller still broken.

Rules:

- No abstractions that weren't explicitly requested.
- No new dependency if it can be avoided.
- No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Shortest working diff wins, but only once you understand the problem. The smallest change in the wrong place isn't lazy, it's a second bug.
- Question complex requests: "Do you actually need X, or does Y cover it?"
- Pick the edge-case-correct option when two stdlib approaches are the same size. Lazy means less code, not the flimsier algorithm.
- Mark deliberate simplifications that cut a real corner with a known ceiling (global lock, O(n²) scan, naive heuristic) with a `ponytail:` comment naming the ceiling and upgrade path.

Not lazy about: understanding the problem (read it fully and trace the real flow before picking a rung), input validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything explicitly requested. Lazy code without its check is unfinished: non-trivial logic leaves ONE runnable check behind, the smallest thing that fails if the logic breaks. Trivial one-liners need no test. Existing tests stay.

Section 3 is taken from Ponytail v4.10.0, https://github.com/DietrichGebert/ponytail, MIT License, Copyright (c) 2026 DietrichGebert.
