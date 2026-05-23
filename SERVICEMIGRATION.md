# SERVICEMIGRATION.md — Critical Path

> Living document. Updated after every stage.
> CC reads this at the start of every session.

## Current Stage: Stage 2 complete — next up Phase 3 (chat service extraction)

## Completed
- Phase 1: Audit and baseline (MIGRATION.md Part A)
- IDOR fix: app/api/sessions/[id]/route.ts scoped by tenant_id
- Stage 2: Isolate jefflougheed.ca
  - Components moved to app/(jefflougheed)/components/ (Footer,
    SectionOutcomes, SectionWhy, SectionCareer, SectionTestimonials,
    Problem, Session)
  - Public assets namespaced under public/jefflougheed/ and referenced as
    /jefflougheed/… (Next.js serves static only from root public/, so a
    route-group public/ is not possible — namespacing achieves isolation
    while keeping URLs served)
  - CLAUDE.md updated with the "jefflougheed.ca Isolation" section

## In Progress
- (none) — awaiting Vercel preview verification of Stage 2, then Jeff's
  approval to begin Phase 3

## Blocked — Cannot move until Phase 3 (chat service extraction)
The following files are coupled to the Sage chat engine and must
stay in src/components/ until the chat service is extracted into
services/chat:

| File | Reason blocked |
|------|----------------|
| src/components/Hero.tsx | Deeply coupled — imports from src/components/sage/*, src/lib/store, src/lib/sage. Drives streaming, booking cards, session API calls. |
| src/components/Nav.tsx | Imports useSageStore from src/lib/store |
| src/components/SectionProcess.tsx | Imports useSageStore from src/lib/store (expand question mode) |
| src/components/Chat.tsx | IS the platform chat service |
| src/components/sage/* | Platform-level chat primitives |

These files are intentionally left in src/components/ and must not
be moved or deleted without explicit instruction from Jeff.

## Pending Investigation
The following files are not imported by jefflougheed.ca entry points.
Ownership unknown — do not touch until investigated:
- src/components/About.tsx
- src/components/Problems.tsx
- src/components/Process.tsx
- src/components/WhyMe.tsx
- src/components/Work.tsx
- src/components/PromptEditor.tsx
- src/components/QuoteCarouselSection.tsx
