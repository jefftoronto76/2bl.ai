# Documentation-Sync Agent — Scoped, Never Built

**Status:** Open. No implementation exists. System Docs drift is currently
caught manually, per-PR, when someone happens to notice — which has missed
real gaps repeatedly (e.g. #409/#411 shipped with no doc updates at all,
caught later in an unrelated audit pass; three of four features merged on
2026-08-17 had zero doc coverage until a separate consolidated catch-up pass).

**Date raised:** 2026-08-05, in a prior planning session. Not documented in
the repo until now — this file exists only to persist that plan, not to add
new scope to it.

---

## The problem

PRs merge without their System Docs entries being updated. Nothing catches
this automatically. Drift is currently found by chance — a later audit, a
person happening to read the stale section, or a docs catch-up pass run
manually after the fact.

## The plan, as scoped

1. **Every PR declares what it changes** — the specific tables, file paths,
   or route paths it touches, in a form that can be matched against docs'
   tracked targets. **Open question, not decided:** free-text description
   vs. a structured/checklist format. Structured is more reliably
   machine-actionable but wasn't chosen over free-text at the time.

2. **Trigger: confirmed merge only.** GitHub's `pull_request: closed` event
   with `merged == true`. Nothing fires on open, draft, or closed-without-
   merge PRs.

3. **Match against subscriptions.** Each System Docs file has its own
   "subscription list" — the specific tables, file paths, or route paths
   *that doc* tracks, not a blanket "something changed" trigger. The merged
   PR's declared changes are checked against every doc's list; only docs
   whose tracked items were actually touched get flagged.

4. **Distribution / action.** For flagged docs, two modes were meant to
   exist:
   - (a) An automated update pass — an AI agent checks the doc against the
     new reality and proposes or applies a fix.
   - (b) It surfaces on an admin dashboard with a notification for a human
     to review and act on.

5. **Summary to admin.** A rolled-up digest, not a raw event firehose —
   likely daily or weekly cadence (not settled).

## Where this lives

Originally scoped as CI/CD tooling. The actual decision made at the time:
this should be a first-class **Platform Admin** feature, not just a CI step
— subscribers, subscriptions, and notifications as real data with a real
admin UI screen, not a script running in a pipeline.

Rough shape, **not designed in detail:**
- A subscriptions table: doc identity, description, and its list of tracked
  targets (tables, file paths, route paths, etc.)
- An admin UI screen (likely alongside existing Platform admin nav) showing
  subscription status, flagged drift, and history
- API routes backing the dashboard and the GitHub-merge-triggered ingestion
- A notification layer (dashboard alerts at minimum; Slack push was raised
  as a candidate once plan/tooling prerequisites are confirmed)

## Relationship to other automation ideas raised in the same discussion

- **PR-time check** (verify a PR's changes against docs *before* merge) —
  narrower, CI-only. Might end up as a lightweight front-end to the system
  above, or stay separate. Not decided.
- **Weekly full sweep** (verify every System Docs file against the real repo
  on a schedule, not sampled — full coverage) — could feed the "summary to
  admin" step above. Not decided how these interact.

## Explicitly not decided — needs a real planning pass before build

- Exact subscription data model and schema
- Free-text vs. structured PR-declaration format
- Which drift is safe to auto-fix vs. requires human review
- Whether "subscribers" ever extends beyond internal docs to something
  tenant-facing
- Admin UI design/placement
- Notification channel(s) and cadence
- How this interacts with the PR-time check and weekly-sweep ideas above

**Do not start implementation from this document alone** — it records what
was scoped, not a build-ready spec. The open questions above need a real
decision pass first.
