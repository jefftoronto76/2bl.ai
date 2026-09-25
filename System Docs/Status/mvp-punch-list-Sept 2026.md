# MVP Punch List — pilot launch

Everything left to do before pilot codes go out. Built 2026-09-24 from a
full reconciliation of week-plan-2026-09-21.md, bugs-2026-09-23.md,
action-items-2026-09-17-eod.md, the Traffic Cop punch list, and tonight's
own findings — checked item by item, several confirmed or corrected
against live code and real production data. Superseded doc-by-doc history
of this list lives in System Docs/Status/.

---

## Traffic Cop

Real Phase 2 exit criterion (Design Handovers/september_2026/traffic_cop_design_2026-09-05.md
section 9.5): 100% shadow parity, BOTH tenants, 7 days. Not met — Heirloom
has real data, jefflougheed.ca has none yet.

- Shadow-mode test sheet, real status as of tonight: 1 of 7 rows solidly
  confirmed (media-attached). Rows 1 and 2 need a real signed-in-member,
  story-scoped test to confirm precisely. Rows 5-7 need real
  jefflougheed.ca traffic and an invite-holder test.
  (Earlier tracking recorded "3 of 7" — that number is superseded by this
  one, not a separate figure to reconcile.)
- Generate one real jefflougheed.ca conversation — the simplest unblock,
  produces the first Sage-tenant shadow record.
- Sprint 1 — wire member-status (guest vs. member) into rule 4 in
  select-prompt.ts. Currently dormant/empty config. Doesn't block the
  cutover itself, but is the cheapest real item and de-risks the pattern
  used everywhere else.
- Sprint 2 — chip/visible-output shape for the ContextProvider contract.
- Sprint 3 — Memory Review routine (deterministic checklist + prompt-chips).
- Sprint 4 — NPS survey, traffic-cop-gated.
- Sprint 5 — Inbound Chats visibility UI.
- Sprint 6 — prompt caching.
- Sprint 7 — prompt language review (MEMBER CONTEXT etc.).
- Sprint 8 — product knowledge / documentation context. Deliberately
  scoped down from full RAG. pgvector isn't installed, no retrieval
  mechanism exists today. Staged plan: inject landing-page copy as a
  provider, hand-write a real "how this works" doc once, run that
  update process manually for a while, only then consider automating or
  moving to real retrieval. Fully independent of everything else — can
  start anytime, not urgent.
- Admin UI to manage (tenant, situation) -> prompt-slot mappings — real
  scope, currently a hardcoded code change + redeploy, not an admin
  action. Needs sizing.

## Identity / launch readiness

- Sign-up/sign-in identity test sheet, 18 rows (Google Sheet) — 0 filled in.
- Fix Allie's account — two members rows confirmed via direct query: one
  deleted (June 9), one active (Aug 10), same phone, no email split as
  the design doc assumed. Active identity has one real 31-message chat
  session (Aug 10-23), zero saved artifacts. Small fix, not a content
  migration — but that one session needs a decision, not silent deletion.
- Security agent / RLS posture — P0 items (record-level auth,
  cross-user isolation tests) not started; current docs overstate the
  real posture.

## Performance

- Verify getSession() itself is actually fast in practice — the route
  swap (PR #493) is merged and confirmed, but getSession() was never
  itself timing-instrumented, so there's still no real before/after
  number.
- GET /api/stories tenant-resolution phase spikes to several seconds
  intermittently (worst case measured tonight: 4.7s, rowCount 0). Real
  data exists; root cause not yet investigated. This is the first real
  answer to the older "story loading is slow" question.

## Product / UI

- 780px reading-width cap (List view + Deck row text column) — code
  confirmed present on the branch, visual behavior in the browser not
  yet confirmed.
- Media page has no nav actions — mediaPageOpen missing from
  isNavForceCollapsed's condition in ChatHero.tsx. One-line fix, not done.
- Story<->Memory split: divider instead of full collapse (replaces
  DeckRail). Deferred, not started.
- Selecting a session should close an open Story view — bugs-2026-09-23.md
  called this "ready to build" but a direct code search tonight found no
  effect implementing it. Needs an actual on-device test to confirm
  either way before treating as done or redoing the fix.

## Nav / workspace

- Nav shouldn't force-collapse when a panel opens (Stories, Media, memory,
  admin). Currently `isNavForceCollapsed` in ChatHero.tsx includes
  `storyViewId` alongside `openMemory`, `mediaOpen`, `adminStoryId`, and
  `sessionMemoriesOpen` -- any of them force the Nav to its rail
  unconditionally. Wanted instead: everything shifts/compresses left,
  Nav only collapses as a last resort once the workspace is genuinely
  out of room. Found 2026-09-24, not fixed.
- Media Page needs to be adjusted to match how the other panels/pages work (the current media page replaces the   workspace header, whereas the other pages (memory, stories, etc.) all have their own dedicated nav/header, isolated from the main workspace header
- When you click on 'story' in the mobile experience, it should slide and overcome the side menu, a different action from the sessions - this goes for memories also.
- Update the preview to include the page-turning animation/effects

## Mobile

- Nav drawer visible-strip width, 86% to 75% — built on
  claude/mobile-drawer-and-timing, verified clean, never confirmed on a
  real device.
- Bottom-sheet animation timing, 240ms to 320ms — same branch, same status.
- Story-to-memory "pop" animation (hl-animate-slide-right) reads as
  abrupt — identified, no fix attempted, explicitly deprioritized for now.
- Confirm media page is fixed

---

## Confirmed done, dropped from this list

Workspace grows instead of shrinking Chat when Nav expands; session
selection no longer reorders the sidebar list; Preview/Landscape resizes
the workspace; Preview has a real expand-to-100% toggle; Grid view has
uniform card sizes; List view's 780px cap; Deck header's two-child
grouping; PR #492 and PR #493 (both merged, confirmed); the old Nav
default-expanded question (closed, working as intended); billing (parked
by Jeff's call, not being tracked here for now).
