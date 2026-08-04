# CLAUDE.md — Natural Resource / Sage Platform

This file is read at the start of every Claude Code session. These principles
are non-negotiable. Apply them to every task. If you cannot follow a principle
on a given task, say so explicitly before proceeding — do not silently skip it.

**This file must stay current.** If the stack, schema, or principles change,
updating CLAUDE.md is part of the Definition of Done for that change — not a
follow-up task.

---

## Where the rest of this lives

This file holds only broadly-applicable rules — the ones every session needs
regardless of task. Domain and reference material has moved to `System Docs/`,
one file per topic, loaded on demand rather than read every session:

| Looking for... | See |
|---|---|
| DB tables/columns | `System Docs/Database Schema.md` |
| API routes | `System Docs/API Routes.md` |
| Known issues, orphaned code, deferred work | `System Docs/Known Gaps.md` |
| Design tokens, palettes, fonts per brand | `System Docs/Design System.md` |
| `[BOOKING:]`/`[NAME:]`/etc. marker syntax | `System Docs/Marker Syntax.md` |
| Shared admin/UI components | `System Docs/Shared Primitives.md` |
| Admin page routes | `System Docs/Pages.md` |
| Visitor-facing chat components (Sage, Heirloom) | `System Docs/Public Site.md` |
| Middleware, domain routing, multi-tenant admin | `System Docs/App Structure and Routing.md` |
| jefflougheed.ca-only code/assets | `System Docs/jefflougheed Isolation.md` |
| Contact-capture design | `System Docs/Contact Capture Architecture.md` |
| Service internals (`services/*/`) | `System Docs/Utilities/` — one file per service (Auth, Prompt, CRM, Audit, Members, Tenant, Content, Chat Server, Chat UI, Shared) |

If a task touches one of these areas, read the relevant file before starting —
don't assume the summary here (there isn't one) covers it.

---

## Principles

###Marker fallback principle###
Never make a business-critical outcome dependent solely on a marker firing. The marker is the fast path, not the only path. For any marker that triggers a server-side operation, a fallback must exist that completes the operation if the marker is missed. Two valid patterns: (1) server-side — handleSessionFinish detects the missed case via regex and writes the data anyway (NAME, EMAIL, PHONE); (2) client-side UI — a turn-count-gated CTA surfaces the action to the user regardless of marker state (ACCOUNT_CREATE → SaveChatCTA after 4 messages). Every new business-critical marker must have one of these two fallback patterns in place before shipping.

### Mobile-First, Responsive on First Pass
Every component ships responsive. Mobile is not a second pass or a polish task
— it is part of the definition of done. Design and build mobile-first, then
extend to desktop cleanly.

### Design Quality Equals Feature Delivery
Aesthetics and functionality are weighted equally. Zero design debt is the
target. Acceptable debt is work that is functional but not yet polished.
Unacceptable debt is anything inconsistent with the design system — that is a
blocker, not a backlog item. We do not ship visually inconsistent work.

### Flexibility Over Convenience
Every architecture decision gets pressure-tested for lock-in. The test is
whether a decision closes a real door, not whether a future scenario can be
imagined. We do not abstract for hypotheticals. Prefer composable, reversible
decisions over fast ones — but only where a real constraint exists.

### Test Plans Are Part of Every Build
Write the test plan before implementation begins. No component ships without
tests. If the task scope makes this impossible, flag it explicitly before
proceeding — do not silently skip it.

### Highest Data Security
Security is a first-class requirement, not a layer added later. Data is
encrypted at rest and in transit. Access is least-privilege by default.

See `System Docs/Known Gaps.md` for current RLS/security posture.

### Privacy by Design
Collect only what is needed. User data is not stored beyond its purpose.
Privacy obligations are defined before a feature ships, not after. Applies to
visitor chat data, SMS, client threads, and all multi-tenant data.

### API Before Build
Before writing custom logic, check whether an API, library, or platform service
already solves the problem. We do not build what already exists.

### User Experience Over Development Ease
When there is tension between what is easier to build and what is better for
the user, the user wins. Development convenience is never a justification for a
worse experience.

### Plan Before Implementation
Default to planning before writing code. Understand the full scope, the data
model, the edge cases, and the dependencies before touching the repo. Trust the
plan, but verify as you go.

### Accessibility Is Non-Negotiable
Semantic HTML, keyboard navigation, screen reader support, and sufficient color
contrast are part of the definition of done on every component — not a retrofit.

### Error Handling and Graceful Degradation
The app owns its failures. No raw errors surface to users. Every failure state
has an on-brand, user-appropriate response. Fallback behavior is defined before
a component ships.

### Performance Is a Feature
Performance is measured, not assumed. Targets apply to every component:
- LCP under 2 seconds on mobile
- Non-AI API routes under 500ms
- Anthropic streaming: first token under 1 second
- Core Web Vitals pass on mobile — verified via Vercel on every deploy
- Anthropic API cost tracked per session — uncontrolled token usage is an
  architecture problem, not a billing one

### Observability
Logging and monitoring are part of the build. Errors are captured, surfaced in
the admin health panel, and actionable. If something breaks, we know before the
user tells us.

### Documentation Stays Current
PRDs, handoff docs, and architecture decisions are updated as part of shipping.
A feature is not merged until the PRD and any relevant handoff docs reflect the
change. Documentation is a PR gate, not a follow-up task.

### One Change at a Time
Surgical, single-change builds with verification before proceeding. Compound
changes introduce compound risk. Every step is confirmed before the next one
starts.

---

## Stack

- **Framework:** Next.js 15, React 19, TypeScript (strict mode — always)
- **Styling:** Tailwind (public site), Mantine v7 (admin interface)
  — v7 is intentional. v9 requires React canary APIs not in React 19 stable.
  Do not upgrade Mantine without explicit instruction from Jeff.
  Companion packages: `@mantine/notifications@7.17.8` (toast notifications,
  wired into `app/admin/layout.tsx` via `<Notifications />`).
- **Database:** Supabase (Postgres + Row Level Security + Realtime)
- **Auth:** Clerk (`@clerk/nextjs` — currently v7, Core 3), consumed ONLY
  through the provider-agnostic boundary at `services/auth/` (the Golden Rule —
  see `Design Handovers/auth-service-rebuild.md`). `@clerk/*` may be imported only inside
  `services/auth/providers/clerk/**`; everywhere else is an ESLint **error**
  (`no-restricted-imports`). Product code imports `@/services/auth` (server),
  `@/services/auth/client` (hooks), `@/services/auth/ui` (prebuilt UI
  re-exports), or `@/services/auth/middleware` (edge). AI skills for all Clerk
  patterns are in `.agents/skills/clerk-custom-ui/` and
  `.agents/skills/clerk-nextjs-patterns/`. **Before writing any Clerk auth code,
  read `.agents/skills/clerk-custom-ui/core-3/`.**
- **AI:** Anthropic API (`claude-sonnet-4-6`) + Vercel AI SDK (streaming + fallback)
- **Fallback model:** OpenAI via Vercel AI SDK
- **SMS:** Twilio
- **Deployment:** Vercel

---

## Branch Convention

- Every feature gets its own branch
- Always branch from the most current working branch:
  `git checkout [base-branch] && git pull origin [base-branch] && git checkout -b [new-branch]`
- No changes directly to main unless explicitly instructed by Jeff
- Commit messages are descriptive and specific
- Incremental commits with confirmation between steps — do not batch everything
  into one commit at the end

---

## Development Workflow Rules

These rules apply to all future sessions and should be re-read at every
session start.

1. **PUSH CADENCE**: Every commit must be pushed to origin immediately.
   Verification happens on Vercel preview deployments, never on local-only
   branches. Do not batch pushes to end of PR. Do not say "push after all
   commits approved." After each commit: git push, surface the preview URL
   if known, pause for approval.

2. **VERIFICATION SURFACE**: Verification of runtime behavior happens on
   Vercel preview URLs, not local dev. Static checks (build, tsc, tests)
   happen in the sandbox. Manual verification (page renders, query returns
   right rows, UI looks correct) happens against preview. Do not ask Jeff
   to run `npm run dev` locally as a default verification step.

3. **SCHEMA MIGRATIONS**: All Supabase schema changes are done by Jeff in
   Supabase Studio, not by CC. CC does not write migration files, does not
   run `ALTER TABLE` statements, does not modify database schema directly.
   When a sprint requires schema changes, those happen first (Jeff in
   Studio), then CC's code work proceeds against the already-migrated
   schema. If CC encounters a missing column or table during code work,
   stop and flag — do not attempt to add it.

4. **PR DESCRIPTIONS ARE MANDATORY**: Every PR must have a description
   written when the PR is opened. Descriptions follow a three-section
   format:

   - **What & Why**: What changed and why — not how. The diff shows how.
     Plain language summary of the change and the reason for it.
   - **Reference**: Link to the relevant ticket, spec, design doc, or
     session notes. If none exists, note "no spec, ad-hoc".
   - **Reviewer attention**: Anything specific the reviewer should pay
     attention to — tricky decisions, gotchas, deferred items, manual
     verification steps needed.

   Descriptions are concise. Do not duplicate what the diff shows. Do not
   list every commit (the commit history shows that). Focus on the human
   context the diff cannot convey.

5. **DIVISION OF LABOR**: Jeff is responsible exclusively for Supabase
   Studio work — schema migrations, data backfills, direct database
   inspection. CC is responsible for everything else — code changes,
   opening PRs, writing PR descriptions, merging, deployment configuration,
   GitHub workflow operations. CC does not ask Jeff to perform git
   operations, GitHub UI operations, or deployment management. CC drives
   the workflow end to end with Jeff's approval gates.

6. **LOGGING CONVENTION**: Use `audit_events` (via the `AuditAction` enum in
   `services/audit/types.ts`) for anything worth persisting or debugging
   later — not `console.log`. `console.log` output is ephemeral (Vercel's
   log retention is limited) and unqueryable; `audit_events` is permanent,
   structured, and consistent with how every other event in this system is
   already recorded. Add a new `AuditAction` value following the existing
   naming convention (dot-separated, lowercase) rather than reusing an
   unrelated one. Never log raw PII or extracted file content in metadata —
   category/length/presence only, following the pattern in
   `resolveMediaContext`'s `sanitizeFailureReason`.

---

## Dependency & API Rules

Before writing any code that depends on a third-party SDK or API, read
`package.json` to confirm the exact installed version. Write only to the
stable, documented API for that version. Never use experimental, future,
beta, or preview API shapes unless explicitly instructed. If a stable and
unstable path exist for the same thing, always take the stable path.

**Clerk auth code:** Before writing or modifying any Clerk auth code, read
`.agents/skills/clerk-custom-ui/core-3/` — the Core 3 API shape differs
substantially from Core 2. The sign-up OTP methods are namespaced under
`signUp.verifications.*`, not directly on `signUp`. The skills are the
authoritative reference; do not infer API shapes from training data or autocomplete.

**Next.js App Router `route.ts` files export ONLY HTTP method handlers**
(`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD`) plus the small
set of reserved config exports (`dynamic`, `revalidate`, `runtime`,
`maxDuration`, etc.). No other named export is allowed — Next's route-type
validator rejects it at `next build` time with "`X` is not a valid Route
export field," which fails the production build outright, not just a lint
warning. `tsc --noEmit` alone does not catch this (it's a Next-specific
build step beyond plain type-checking) — **run a real `next build` before
trusting a route file is safe to ship**, not just `tsc`. Any helper function
or type that a route handler needs internally belongs in a plain module
(e.g. `services/<domain>/*.ts`), imported into the route file, never
exported alongside the handler. See `System Docs/Known Gaps.md` for the
incident this rule is written from.

---

## Definition of Done

A task is complete when all of the following are true:

- [ ] Feature works as specified
- [ ] Mobile responsive verified
- [ ] Test plan written before implementation and passing
- [ ] No design system inconsistencies (Mantine admin / Tailwind public)
- [ ] Accessibility checked — semantic HTML, keyboard nav, color contrast
- [ ] Error states handled with on-brand messaging
- [ ] Performance targets not regressed
- [ ] No TypeScript errors (strict mode)
- [ ] Documentation updated — README and/or PRD reflect the change
- [ ] Branch pushed and ready for review

