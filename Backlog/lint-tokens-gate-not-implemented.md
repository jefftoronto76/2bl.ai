# `scripts/lint-tokens.ts` — Specified, Never Implemented

**Status:** Open. The no-tenant-prefix CSS token rule is enforced by convention
only. Nothing fails a build, a PR, or a deploy when it is broken.

**Date raised:** 2026-08-17 (found during a System Docs verification pass, PR #419)

**Authority for the rule itself:** `Backlog/css-token-unification-spec.md`

---

## What the spec claims

`Backlog/css-token-unification-spec.md` describes a build gate as if it were
live:

> `scripts/lint-tokens.ts` runs as part of every build
> (`tsx scripts/lint-tokens.ts && next build`).

and, in its new-tenant checklist:

> 4. Run `tsx scripts/lint-tokens.ts` — must pass before opening a PR

Per the spec, the script reads every `globals.css` under `app/` and validates
three things:

1. All 18 canonical tokens are defined
2. No tenant-scoped prefixes exist (`--hl-*`, `--lg-*`, or any
   `--[two-letter-prefix]-*` pattern)
3. Color token values are raw RGB triplets (not hex, not `rgb()`-wrapped)

Exit 1 with a clear message on any failure.

## What is actually true

- **The file does not exist.** `scripts/` contains exactly one file:
  `sync-branding.ts`.
- **The build does not reference it.** `package.json`'s build script is
  `tsx scripts/sync-branding.ts && next build`.
- **Nothing else enforces it either** — no ESLint rule, no CI step, no
  pre-commit hook covers `--hl-*`/`--lg-*`.

So a stray tenant-prefixed token ships silently, and the "must pass before
opening a PR" checklist item is not something a reviewer can actually run.

## Why this went unnoticed

It was caught once, at handover level, and never propagated upward. Both
`Design Handovers/Heirloom-Legacy Lander Update V3 July 2026/pass-1-foundations.md`
and its `implementation-plan.md` carry an explicit warning — *"that file isn't
present in the repo on this branch, so it isn't enforced automatically — follow
the spec anyway"* — while `System Docs/Design System.md` continued to describe
the gate as live until PR #419 corrected it.

The failure mode is worth noting for its own sake: a doc asserting a safety net
that does not exist is worse than a doc that says nothing, because it stops
people from checking by hand.

## Options

1. **Implement the script as specified.** Roughly: walk `app/**/globals.css`,
   parse custom-property declarations, assert the three rules above, exit 1 with
   the offending file, line, and token. Wire it into `build` ahead of
   `sync-branding.ts`, or into `lint`. Smallest useful version is rule 2 alone
   (the prefix ban) — that is the one with live drift risk.
2. **Enforce the prefix ban through ESLint/CI instead**, which puts the failure
   on the PR rather than at build time, and avoids adding a second thing to the
   build chain.
3. **Drop the gate from the spec** and keep the rule as documented convention,
   removing the "must pass before opening a PR" step so the checklist matches
   reality.

Not recommended: leaving the spec asserting a gate that does not exist. Whatever
is decided, `Backlog/css-token-unification-spec.md` should be amended to match —
it is still the document people are pointed at, and it still reads as though the
gate runs today.

## Current state of the rule in practice

`System Docs/Design System.md` now carries a note stating the rule is convention
only and telling readers to grep for `--hl-`/`--lg-` by hand when touching token
files. That note should be revised or removed if this item is actioned.
