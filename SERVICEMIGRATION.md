# SERVICEMIGRATION.md — Critical Path

> Living document. Updated after every stage.
> CC reads this at the start of every session.

## Current Stage: Stage 2 — Isolate jefflougheed.ca

## Completed
- Phase 1: Audit and baseline (MIGRATION.md Part A)
- IDOR fix: app/api/sessions/[id]/route.ts scoped by tenant_id

## In Progress
- Stage 2: Moving jefflougheed.ca components and assets into
  app/(jefflougheed)/

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
