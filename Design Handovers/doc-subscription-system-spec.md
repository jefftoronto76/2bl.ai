# Documentation Subscription System — Platform Admin Feature

**Status:** Proposed. Not scoped for implementation. No code written, no schema
changes made. Captured here for future planning — do not build against this
without a fresh planning pass first.

**Date:** 2026-08-04

---

## The problem this solves

`CLAUDE.md` grew to ~258,000 characters before today's cleanup, and large parts
of it went stale without anyone noticing — not because of carelessness, but
because nothing in the system tracked *which specific facts each piece of
documentation depended on*. A schema change could land, and nothing would ever
flag that `Database Schema.md` (or its predecessor, the old `CLAUDE.md`) now
described something that no longer existed. Staleness was only ever caught by
accident, or by a full manual audit like the one that produced today's
`System Docs/` restructure.

The goal: make documentation drift a **tracked, first-class thing the platform
knows about** — not something that requires a human to remember to go check.

## The core model: documents are subscribers, not people

The prior instinct was "notify the team in Slack when something changes." That's
too coarse — it either fires on everything (noise) or requires a human to
manually judge relevance every time.

Instead: **each `System Docs/*.md` file (and potentially other repo docs) is a
first-class subscriber**, with two properties:

1. **A description** — what topic/scope the doc owns. E.g. `Database Schema.md`
   → "documents `public` schema tables, columns, and constraints."
2. **Hard data subscriptions** — an explicit, specific list of the real-world
   things it's tracking. Not "the database" broadly — the actual table names,
   file paths, or route paths it currently documents. E.g. `Database Schema.md`
   subscribes to a defined list of tables; `Utilities/Auth.md` subscribes to a
   defined list of files/exports in `services/auth/`.

When a merged PR touches something on a doc's subscription list, *that specific
doc* gets flagged — not a blanket "something changed" notification. This
targets the actual root cause found today: documentation staleness has always
been undetectable because nothing tracked the dependency between a doc and the
specific things it describes.

## The workflow, end to end

1. **Defined info required in every PR** (a CLAUDE.md rule, already partially
   in place via the existing PR description format) — every PR must declare
   what it changes, in a way that can be matched against docs' subscription
   lists. Open question: free-text description vs. a structured/checklist
   format matched against the known `System Docs/` file list — structured is
   more reliably machine-actionable, worth deciding before build.
2. **Trigger: confirmed merge only.** GitHub's `pull_request: closed` event
   with `merged == true`. Nothing fires on open, draft, or closed-without-merge
   PRs — no partial/speculative updates ever go out.
3. **Match against subscriptions.** The merged PR's declared changes are
   checked against every doc's hard subscription list. Any doc whose tracked
   items were touched gets flagged.
4. **Distribution / action.** For flagged docs: either (a) an automated update
   pass (CC checks the doc against the new reality and proposes/applies a fix),
   or (b) it surfaces on an admin dashboard with a notification, for a human to
   review and act on. Both modes should probably exist — some classes of drift
   are safe to auto-fix, others need judgment.
5. **Summary sent to admin.** A rolled-up digest, not a raw event firehose —
   likely daily or weekly, not per-PR, to avoid alert fatigue.

## Where this lives — Platform Admin, not just CI

This was originally scoped as CI/CD tooling (a GitHub Action). The real
decision: it should be a first-class feature of the 2BL platform itself —
subscribers, subscriptions, and notifications as real data and a real admin UI
screen, not something living only in `.github/workflows/`.

Rough shape, **not yet designed in detail:**
- A `doc_subscriptions` (or similarly named) table: doc identity, description,
  and its list of tracked targets (tables, file paths, route paths, etc.)
- An admin UI screen (likely alongside the existing Platform admin
  Tenants/Members/Settings nav) showing subscription status, flagged drift, and
  history
- API routes backing the dashboard and the GitHub-merge-triggered ingestion
- A notification layer (dashboard alerts at minimum; Slack via Claude Tag's
  ambient mode is a strong candidate for push notifications, once Team/
  Enterprise plan status is confirmed)

## Relationship to today's other automation ideas

Two adjacent ideas came up in the same conversation, both still relevant but
distinct from this:

- **PR-time check** (verify a PR's changes against docs *before* merge) — a
  narrower, CI-only concept. May end up as a lightweight front-end to this
  system (using the same subscription data to know what to check), or may stay
  separate. Not yet decided.
- **Weekly full sweep** (verify every `System Docs/` file against the real repo
  on a schedule, not sampled — full coverage, not partial) — this could
  reasonably be the mechanism that also feeds the "summary sent to admin" step
  above, reusing the same subscription/target data to know what to check.

## Explicitly not decided yet — needs a real planning pass before build

- Exact subscription data model and schema
- Free-text vs. structured PR-declaration format
- Which drift is safe to auto-fix vs. requires human review
- Whether "subscribers" ever extends beyond internal `System Docs/` files to
  something tenant-facing
- Admin UI design/placement
- Notification channel(s) and cadence
- How this interacts with the PR-time check and weekly-sweep ideas above —
  one system or several coordinating pieces

**Do not start implementation from this document alone.** This captures the
shape of the idea as discussed; it needs a fresh scoping/planning session
(per this project's own "Plan Before Implementation" principle) before any
code or schema work begins.
