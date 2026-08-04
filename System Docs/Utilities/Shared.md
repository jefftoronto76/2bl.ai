# Shared Utilities

### Shared utilities (`services/shared/`)

Cross-cutting, brand-agnostic helpers with no chat/auth/prompt coupling.
Headless (no JSX). Imported as `@/services/shared/*`.

| Helper | File | Purpose |
|--------|------|---------|
| `formatRelativeTime` | `time.ts` | Pure render-time relative-timestamp formatter (`"just now"`, `"2d ago"`, …) — see brackets in the file's doc comment. SSR-safe (no interval ticking). Consumed by the admin Block cards/rows (`components/admin/content/BlockCard.tsx`, `BlockRow.tsx`). Moved here from `src/lib/time.ts` in centralization Step B. Unit-tested in `time.test.ts`. |
| `formatShortDate` | `time.ts` | Pure absolute-date formatter (`"Jan 5"`) added July 2026 for the Blocks table's Created column, pairing with `formatRelativeTime`'s relative Updated column. Uses the runtime's local zone (no explicit `timeZone`) — same hydration-mismatch risk as `formatRelativeTime`, so callers `suppressHydrationWarning`. Empty/invalid input returns `""`. Consumed by `components/admin/content/BlockRow.tsx`'s Dates cell. Unit-tested in `time.test.ts`. |
| `useReveal` | `useReveal.ts` | Headless scroll-reveal hook (no JSX) — returns a ref; an `IntersectionObserver` (threshold 0.15) adds the `visible` class on first intersection then disconnects. Consumed by the jefflougheed public site (the widget-shell `Chat`, plus `Problem`/`Session` in `app/(jefflougheed)/components/`). Moved here from `src/hooks/useReveal.ts` in centralization Step E (clears the `app→src` warnings on Problem/Session). |

---
