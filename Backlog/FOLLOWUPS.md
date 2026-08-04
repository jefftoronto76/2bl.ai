# Followups

Deferred issues and design reviews surfaced during work. Each entry
has a date, source commit or step, description, and disposition.

---

## 2026-05-05

### Duplicate endpoint accumulates monotonic order values

- **Source:** PR 2 PR2_PLAN.md, Step 16 design discussion.
- **Observation:** The `POST /api/admin/blocks/duplicate` endpoint
  computes `order = MAX(order WHERE tenant_id AND type) + 1`. Over
  time, as duplicates accumulate (and source rows get deleted or
  disabled), the per-type order monotonically grows. After heavy use
  the numbers become large (e.g., `127`) even when only a handful of
  blocks remain.
- **Blocking?** No. Sort behavior is unchanged — the compile route
  uses `order` as a sort key, not a magnitude. Display via the
  zero-padded order prefix shows `127` instead of `12` which looks
  odd at scale.
- **Disposition:** Consider an order normalization or compaction
  strategy in a future phase. Options to consider: (a) on-duplicate
  re-pack the per-type sequence to 1..N, (b) periodic admin "reorder"
  action, (c) store a sparse fractional index instead of integers.

---

## 2026-04-22

### Order clearing UX + API support

- **Source:** Step 16 live verification (post-fix, same session).
- **Observation:** Clearing the order input silently reverts to the
  prior value; there is no API path to set order back to null.
- **Disposition:** Revisit alongside broader UX reconciliation against
  the Image 1 target. See investigation notes in the session history —
  both `BlockRow.handleOrderBlur` and `BlocksTable.handleOrderBlur`
  early-return on `nextValue === null`, and `/api/admin/blocks/[id]`
  PATCH doesn't accept null. Both would need coordinated changes for a
  "clear my order" flow. Parked.

### SegmentedTokenMeter — warning label color not visually shifting at 5000–8000 tokens

- **Source:** Step 13 live verification (commit `5b8f22a`).
- **Observation:** When total tokens cross the `YELLOW_THRESHOLD = 5000`
  but stay under `TOKEN_LIMIT = 8000`, the meter label is supposed to
  shift to `var(--mantine-color-yellow-8)` as a heads-up. In live
  verification it doesn't visibly change.
- **Likely cause (not yet confirmed):** the label renders through the
  project's `Text` primitive (`components/admin/primitives/Text.tsx`)
  which spreads a Mantine `c: 'dimmed'` via `variantMap.muted`. Mantine's
  `c` prop sets the text color via a dedicated CSS path that likely wins
  over the inline `style.color` we're trying to set. Replacing the `Text`
  wrapper with a raw `<span>` or `<p>` styled with only the inline color
  should restore the threshold visual.
- **Blocking?** No — over-budget (> 8000) red still works because the
  visible cue is also the bar segments turning red, not just the label.
  The warning tier loses its subtle label heads-up but functions
  otherwise.
- **Disposition:** deferred for later review. Fix when we touch
  `SegmentedTokenMeter` next or during the Phase 2 meter pass.

### SegmentedTokenMeter — segment order couples to table order

- **Source:** Step 13 live verification (commit `5b8f22a`).
- **Observation:** The meter renders segments in the same order as the
  active-blocks array, which is the same order as the table rows. With
  many blocks of different types interleaved by user-chosen `order`
  field, the meter becomes visually chaotic — adjacent segments
  constantly switch colors.
- **Design question:** should the meter sort by type (grouping all
  guardrails, then identities, etc.) regardless of table order, so
  color bands read as contiguous? Pro: easier to scan "how much of my
  budget is guardrail vs knowledge." Con: segment position no longer
  maps to table row position, so hover tooltips can't double as a "find
  this block in the list" affordance.
- **Blocking?** No — the meter is functional, just visually noisy.
- **Disposition:** deferred for design review. Options to consider:
  (a) sort by type inside the meter only, (b) add a toggle between
  "list order" and "type order", (c) group segments by type with a
  small gap between type runs while preserving intra-type table order.
