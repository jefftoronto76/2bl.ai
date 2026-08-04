# Handoff: Message Feedback + TTFT in Inbound Chats, Dashboard Collapse/Filter (Members + Inbound Chats)

## Overview
Two feature sets added to the Mantine admin preview:
1. **Message feedback + delivery status + TTFT** surfaced inline in the Inbound Chats session drawer/transcript, plus rollups in the table and dashboard.
2. **Collapsible dashboard + sticky search/filter bar**, matching the existing pattern on the Blocks screen, added to both Inbound Chats and Platform Members.

## About the design files
The files in this bundle are **design references built in HTML** (htm + Mantine web components via CDN, matching the `admin-mantine/` preview layer described in this project's `System Docs/Design System.md`). They are not production code to copy verbatim — recreate this behavior in `Rebuild_admin-tsx_HD/` (the real React/TypeScript + `@mantine/core` app) using its actual data-fetching and component patterns. The HTML here is a 1:1 visual/interaction spec; treat hex values, spacing, and copy as exact.

## Fidelity
High-fidelity. Colors, typography, spacing, and copy shown are final — implement pixel-for-pixel using the app's real `buildAdminTheme` tokens (cream `#FAF6EE`, terracotta `#C8542E`, Newsreader/Manrope/DM Mono) rather than the hardcoded hex fallbacks used for chip colors below.

## Data model additions

### `message_feedback` table (already exists per CD brief)
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
session_id uuid NOT NULL REFERENCES chat_sessions(id),
tenant_id uuid NOT NULL REFERENCES tenants(id),
member_id uuid REFERENCES members(id),
message_index integer NOT NULL,
rating text NOT NULL CHECK (rating IN ('up', 'down')),
tags text[] DEFAULT '{}',
detail text,
created_at timestamptz DEFAULT now(),
updated_at timestamptz DEFAULT now()
```
`message_index` locates the row inside that session's message array (0-indexed, counting both user and assistant turns).

### `chat_sessions.ttft_ms`
New nullable integer column — time to first token in ms, measured send → first streamed token. One value per assistant turn (mocked in `SESSION_MESSAGES[...].ttft_ms`; production likely wants this on the message row, not just the session, if per-turn granularity is needed — confirm with backend since the brief named the column on `chat_sessions`).

### Delivery status (per user message)
Already-existing concept from the CD `DeliveryStatus.tsx` handoff — `'sending' | 'sent' | 'failed'` on each user message. Not a new table; whatever real transport layer sets message state should map here.

## Screens

### Inbound Chats — session drawer (`SessionDrawer` / `Transcript` / `MessageRow`)
- Drawer width 460px, right-anchored, no default close button (custom X `ActionIcon`).
- Session summary grid (2-col): Status badge, Messages count, Tokens, Cost, **Response time** (`avg TTFT session>ms avg` or `—`), Last active.
- Transcript header row: "TRANSCRIPT" label (uppercase, dimmed, xs, letter-spacing 0.08em) + a 👍/👎 count rollup (`FeedbackCounts`) shown only if the session has any rated messages.
- Each message renders as a `Paper` bubble: user messages white + bordered, left-aligned, max-width 92%; assistant messages `gray.0` background, right-aligned, no border.
  - User messages: delivery row below the bubble if status isn't `'sent'` — a spinning loader + "Sending…" (12px icon, xs dimmed monospace) or a warning triangle + "Not delivered" (orange `#d9480f`).
  - Assistant messages: a trailing row (right-justified) that can carry, in order: **TTFT** (`↩ 420ms`, xs dimmed monospace) → **"Stopped"** tag if the reply was interrupted → **version indicator** (`v2/2 shown`) if regenerated → a clickable thumb icon (`ActionIcon`, filled thumb-up/down, green/orange) if the message has feedback.
  - Clicking the thumb icon toggles a detail panel below the message: tinted background (green/orange at 7% opacity), reason chips (`Badge`, light variant, no uppercase), and an italic quoted note if present.

### Inbound Chats — table
Columns, in order: Visitor, Messages, Tokens, Cost, **Avg TTFT**, **Feedback**, Status, Last Active.
- Avg TTFT cell: monospace, colored `#d9480f` if the session average exceeds 1000ms, else default text color; `—` if no TTFT data.
- Feedback cell: reuses `FeedbackCounts` (thumb-up/down icon + count pairs, only rendering populated sides; `—` if session has no feedback at all).

### Inbound Chats — dashboard (`Dashboard`)
- Existing stat tiles (Sessions, Tokens, Cost, Converted) plus two new tiles:
  - **Negative feedback**: raw count across all sessions, orange accent (`#d9480f`) when > 0.
  - **Response time**: monospace 26px value (`avgMS` or `—`), an "Over 1s" red light-variant badge when the 7-day average exceeds 1000ms (`TTFT_FLAG_MS`), and a small SVG sparkline (single `polyline`, 64×24, red if the latest point is over threshold else brand color) showing the daily trend. Caption: "avg TTFT · last 7 days".

### Inbound Chats + Platform Members — collapsible dashboard / sticky filter bar
Mirrors the existing Blocks-screen pattern:
- A "Hide dashboard" subtle gray button (chevrons-up icon) sits right-aligned above the full dashboard.
- Once hidden, the dashboard collapses to a single-line summary strip: `Paper` with `gray.0` background, "Dashboard summary" label + a handful of inline `<b>count</b> label` stats (Inbound Chats: sessions / converted / negative feedback / avg TTFT; Members: total / active / invited / suspended), and a "Show dashboard" button (chevrons-down) to restore it.
- Below the dashboard (collapsed or not), a search + filter row becomes `position: sticky; top: 0` with the cream (`#FAF6EE`) background and a bottom border, so it locks to the top of the scroll area once the dashboard scrolls past.
  - Inbound Chats filter row: search input (visitor name/email), status `SegmentedControl` (All/In progress/Active/Abandoned with live counts), then a second row with "Negative feedback" and "TTFT over 1s" `Chip` toggles, a from/to date range (native date inputs), a "Clear filters" button when any filter is active, and a live `N / total` counter.
  - Members filter row: unchanged search + status `SegmentedControl` + "Invite member" button, now sticky.
- An empty state ("No sessions found" / adapt copy for Members) renders in place of the table when filters produce zero rows.

## Design tokens used
- Negative/error accent: `#d9480f` (orange-700-ish, used for feedback-down, TTFT-over-threshold, "Not delivered").
- Positive accent: `#2d6a4f` (feedback-up, converted stat).
- Sticky bar background: `#FAF6EE` (cream, matches app background so it doesn't look like a floating overlay).
- Dashboard-collapsed strip background: `var(--mantine-color-gray-0)`.
- All typography/spacing otherwise inherits Mantine defaults already in use across `admin-mantine/`.

## Files
- `admin-mantine/data.js` — `MESSAGE_FEEDBACK`, `feedbackFor`, `feedbackCounts`, `SESSION_MESSAGES` (with `ttft_ms` per assistant turn, `status` per user turn, `stopped`/`versions`/`versionIdx` for regenerated replies), `TTFT_FLAG_MS`, `avgTtft`, `overallAvgTtft`, `ttftTrend`.
- `admin-mantine/Inbound Chats.html` — standalone screen with all of the above wired in.
- `admin-mantine/Platform Members.html` — standalone screen with the collapsible-dashboard/sticky-filter pattern.
- `admin-mantine/Combined Admin.html` — canonical combined shell, both screens wired inline, kept in sync with the two files above.
- Root `Combined Admin July 2026.html` — a working copy of the combined shell (same screens, imports the same `admin-mantine/harness.js` + `data.js`).

Mock data (`SESSION_MESSAGES`, `MESSAGE_FEEDBACK`) is representative excerpts, not full logs — swap in real rows from `chat_messages` / `message_feedback` / `chat_sessions.ttft_ms` when wiring to production.
