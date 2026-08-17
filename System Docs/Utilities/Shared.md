# Shared Utilities

### Shared utilities (`services/shared/`)

Cross-cutting, brand-agnostic helpers with no chat/auth/prompt coupling.
Headless (no JSX). Imported as `@/services/shared/*`.

| Helper | File | Purpose |
|--------|------|---------|
| `formatRelativeTime` | `time.ts` | Pure render-time relative-timestamp formatter (`"just now"`, `"2d ago"`, …) — see brackets in the file's doc comment. SSR-safe (no interval ticking). Consumed by the admin Block cards/rows (`components/admin/content/BlockCard.tsx`, `BlockRow.tsx`). Moved here from `src/lib/time.ts` in centralization Step B. Unit-tested in `time.test.ts`. |
| `formatShortDate` | `time.ts` | Pure absolute-date formatter (`"Jan 5"`) added July 2026 for the Blocks table's Created column, pairing with `formatRelativeTime`'s relative Updated column. Uses the runtime's local zone (no explicit `timeZone`) — same hydration-mismatch risk as `formatRelativeTime`, so callers `suppressHydrationWarning`. Empty/invalid input returns `""`. Consumed by `components/admin/content/BlockRow.tsx`'s Dates cell. Unit-tested in `time.test.ts`. |
| `formatMessageTime` | `time.ts` | Pure absolute per-message timestamp formatter (`"3:14 PM"`, date-prefixed `"Jan 5, 3:14 PM"` once no longer from today) added 2026-08-17 (PR #443) for the Heirloom chat transcript. Deliberately absolute like `formatShortDate` rather than relative like `formatRelativeTime` — a chat bubble is a fixed one-time event, and a relative caption would go stale every render. Accepts epoch ms (its primary caller, `UIMessage.timestamp`), or a string/Date for parity with the other formatters here. Same local-zone hydration-mismatch risk as the other two — callers `suppressHydrationWarning`. Empty/invalid input returns `""`. Consumed by `components/shells/membership/MessageList.tsx`'s `MessageTimestamp`. Unit-tested in `time.test.ts`. |
| `useReveal` | `useReveal.ts` | Headless scroll-reveal hook (no JSX) — returns a ref; an `IntersectionObserver` (threshold 0.15) adds the `visible` class on first intersection then disconnects. Consumed by the jefflougheed public site (the widget-shell `Chat`, plus `Problem`/`Session` in `app/(jefflougheed)/components/`). Moved here from `src/hooks/useReveal.ts` in centralization Step E (clears the `app→src` warnings on Problem/Session). |

---
