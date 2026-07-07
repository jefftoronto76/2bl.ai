# Handoff: Guardrail Counter — Blocks screen

## Overview
Adds a compact, colour-coded meter to the **Blocks** screen (Prompt Studio) that shows how many
**active guardrail blocks** the current prompt set has, against a best-practice ceiling of **5**.
Past five, guardrails tend to contradict each other and reduce reliability — the meter surfaces
that one number where admins already read counts and nudges them back under the line. It informs
and warns; it never blocks saving or publishing.

## About the design files
The files in this bundle are **design references created in HTML/JS** — a working prototype of the
intended look and behavior, not production code to paste in. The task is to **recreate this in your
target codebase** (React/TypeScript + Mantine, in the SBL admin) using its established components and
tokens. The prototype already happens to be Mantine, so the mapping is nearly 1:1 — but treat it as a
spec, not a drop-in.

## Fidelity
**High-fidelity.** Final colours, typography, iconography, thresholds, copy, and placement are all
decided. Recreate pixel-for-pixel using the codebase's existing Mantine primitives and theme tokens.

## The feature in one screen

### Screen: Prompt Studio · Blocks (`app/admin/prompt-studio/blocks`)
- **Purpose:** Admins curate the blocks that compile into a prompt set. The guardrail meter is a
  passive status indicator in the set summary at the top of the page.
- **Where it renders (two instances):**
  1. **Summary card (expanded):** in the left card's stat area, on its own row directly below
     "Active blocks", above the New block / Compile & Publish buttons.
  2. **Summary bar (collapsed):** inline in the one-line summary, after the "N tokens" stat.
  - Both are above the fold — visible without scrolling in either summary state.

## Component: `GuardrailMeter`

A single pill built on the Mantine `Badge` primitive (the same one the block-type badges use).

**Anatomy**
- Leading icon → label "Guardrails" → count `N / 5` (count in monospace).
- Optional helper text sits **beside** the pill (never inside it) so the pill never resizes.

**Props**
- `count: number` — active guardrail count for the current set.
- `showHint?: boolean` (default `true`) — the collapsed-bar instance passes `false`.

**Tone logic** (threshold → visual)

| Active guardrails | Tone    | Badge `color` | Icon                 | Helper text (card only)          |
|-------------------|---------|---------------|----------------------|----------------------------------|
| 0–4               | neutral | `gray`        | `IconShieldHalf`     | — (none)                         |
| 5                 | warning | `yellow`      | `IconShieldHalf`     | "At the recommended limit"       |
| 6+                | error   | `red`         | `IconAlertTriangle`  | "Reduce to improve reliability"  |

Helper `Text` colour: `dimmed` for warning, `red.7` for error.

**Reference implementation (htm + Mantine, from the prototype):**
```js
const GUARDRAIL_LIMIT = 5
const guardrailToneFor = (n) =>
  (n > GUARDRAIL_LIMIT ? 'error' : n === GUARDRAIL_LIMIT ? 'warning' : 'neutral')
const GR_META = {
  neutral: { color: 'gray',   hint: null },
  warning: { color: 'yellow', hint: 'At the recommended limit' },
  error:   { color: 'red',    hint: 'Reduce to improve reliability' },
}
function GuardrailMeter({ count, showHint = true }) {
  const tone = guardrailToneFor(count)
  const { color, hint } = GR_META[tone]
  const Icon = tone === 'error' ? IconAlertTriangle : IconShieldHalf
  return (
    <Group gap="xs" align="center" wrap="nowrap">
      <Badge color={color} variant="light" radius="xl" size="lg"
        leftSection={<Icon size={13} style={{ display: 'block' }} />}
        styles={{ root: { textTransform: 'none', fontWeight: 600 } }}>
        Guardrails <span style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontWeight: 500 }}>{count} / {GUARDRAIL_LIMIT}</span>
      </Badge>
      {showHint && hint && <Text size="xs" c={tone === 'error' ? 'red.7' : 'dimmed'}>{hint}</Text>}
    </Group>
  )
}
```
> Note: Mantine `Badge` uppercases its label by default — `textTransform: 'none'` in `styles.root`
> is required to keep the mixed-case "Guardrails" and the mono count readable.

## Data / state
No new endpoints, fixtures, or data model. Derived from state already on the screen:
```js
// active guardrails scoped to the prompt set currently in view
const guardrailActiveCount = activeBlocks.filter(b => b.type === 'guardrail').length
```
- Recomputes on every render → reacts live to: toggling a block's Active switch, deleting a block,
  and switching prompt sets.
- In production, resolve blocks for the current set server-side as you already do; `guardrail` is the
  existing block `type`, `active` the existing `status`.

## Tweak / feature flag
In the prototype the meter is gated behind a boolean (`showGuardrail`, default `true`) exposed as a
"Guardrail counter" switch in the Blocks Tweaks panel. In production this is optional — either ship it
always-on, or keep it behind a settings/flag if you want a kill switch.

## Interactions & behavior
- Passive indicator: not clickable, not a filter (a click-to-filter-guardrails enhancement is a
  documented follow-up, out of scope here).
- No animation beyond the badge's default; colour/icon/hint swap instantly with the count.
- Contrast holds at all three tones; the pill does not wrap or change size between states.

## Design tokens
- **Ceiling:** `GUARDRAIL_LIMIT = 5` (UI constant; make per-tenant configurable only if requested).
- **Colours:** Mantine theme scales `gray` / `yellow` / `red`, `variant="light"`. The error red
  matches the token donut's existing over-limit red (`--mantine-color-red-7`). No new hex values.
- **Icons:** `@tabler/icons-react` — `IconShieldHalf`, `IconAlertTriangle` (size 13 in the badge).
- **Typography:** count uses `var(--mantine-font-family-monospace)` (DM Mono), matching every other
  count on the page (token totals, filter counts, `filtered / total`).
- **Badge:** `radius="xl"`, `size="lg"`, `styles.root.textTransform: 'none'`, `fontWeight: 600`.
- **Admin theme (context):** cream `#FAF6EE`, terracotta accent `#C8542E`, Newsreader headings,
  Manrope body, DM Mono labels — via `buildAdminTheme`.

## Assets
None. Icons come from `@tabler/icons-react` (already a dependency).

## Files in this bundle
- `Guardrail Counter - Spec.html` — the design spec (rationale, states, placement, anatomy).
- `Guardrail Counter - Diff Handover.html` — the exact unified diff applied to the prototype.
- `blocks-screen.js` — the full prototype source **with the change already applied**; the meter is
  `GuardrailMeter` and the six insertion points are visible in context. Best single reference.

## Where it lives in the prototype project
- Source of the change: `admin-mantine/blocks-screen.js` (shared Blocks screen).
- Rendered by: `Combined Admin July 2026.html`, `admin-mantine/Combined Admin.html`,
  `admin-mantine/Blocks.html` (all import the shared screen).

## Production port checklist
- [ ] Add `GuardrailMeter` as a presentational component in the admin component layer.
- [ ] Render it in the Blocks set-summary (both expanded card and collapsed bar), matching placement.
- [ ] Derive `count` from active guardrail blocks of the current set.
- [ ] Keep `GUARDRAIL_LIMIT = 5` as a constant; document it.
- [ ] Verify tones: gray 0–4, yellow at 5 (+ "At the recommended limit"), red at 6+ (alert triangle
      + "Reduce to improve reliability").
- [ ] Confirm the count updates on enable/disable, delete, and set switch.

> Current sample data tops out at 1 active guardrail per set, so only the neutral tone shows on
> today's fixtures. The warning/error tones are fully wired — they trigger the moment a set crosses 5.
