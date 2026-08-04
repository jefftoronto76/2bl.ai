# Integration Guide — `jefftoronto76/natural-resource`

**Target file:** `app/admin/prompt-studio/blocks/BlocksTable.tsx` (and siblings)
**Stack:** Next.js 15 App Router · React 19 · Mantine 7.17 · Tabler Icons · Supabase · Clerk
**Existing theme:** DM Sans / Playfair Display / DM Mono · green primary (`#2d6a4f`) · `defaultRadius: 'sm'`

This guide maps the redesign (see `README.md`) onto your actual code. Read it top-to-bottom; the phases are ordered by risk.

---

## 0. What's in your repo today

The screenshot I redesigned corresponds to **`BlocksTable.tsx`** (918 lines). It's a single client component that renders:

- A `PromptFullnessMeter` (8000-token budget, green/yellow/red threshold bar)
- A bulk-action bar that appears when rows are selected
- Desktop: `<Table>` with columns Title · Type · Topic · Order · Status · Actions
- Mobile (`hiddenFrom="md"`): a card stack of the same data
- Inline edit row: `<Textarea>` + safety-check alert + Save/Cancel/Save-Anyway buttons
- Two confirmation modals (single delete + bulk delete)

**API surface used by the table:**
- `PATCH /api/admin/blocks/[id]` · `{ status?, body?, order? }` → row
- `POST /api/admin/prompt/compile/check` · `{ body }` → `{ ok, issues[] }`
- `POST /api/admin/prompt/compile` (via `PublishButton`) → `{ version, tokenCount, ... }`

**No backend changes required for Phase 1.** All redesign UX fits the existing endpoints.

---

## 1. What the redesign changes (end state)

| Area                 | Today                                                          | Redesign                                                                 |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Status surface       | Select + colored Badge + "Active"/"Disabled" column (dupes)    | Single Mantine `Switch` in a dedicated column                            |
| Order                | `NumberInput` per row + per-type uniqueness check on blur      | **Both:** `NumberInput` (precise) **and** drag handle (relative). Order is **global**, not per-type — one sort key across all blocks. Both PATCH `order` via the same endpoint. |
| Preview              | None — have to click Edit to see body                          | Row-click expands inline preview (first ~8 lines + "View full")          |
| Token meter          | Single bar, total only                                         | Segmented bar colored by block Type + per-block length chips             |
| Bulk toolbar         | Appears above table on select                                  | Sticky at top under the meter; adds "Disable selected" + "Reorder"        |
| Mobile edit          | Card stack with inline edit row                                | **Bottom sheet** (not right drawer) — thumb-reach, keyboard-friendly, preserves list context |
| Compile affordance   | `<PublishButton>` fires compile directly, no preview          | **Compile & Publish preview ships in Phase 1.** Desktop modal + mobile full-screen sheet, both rendering the same diff summary + compiled `<pre>`. Publish is gated behind confirmation. |

Variations **B (split-view preview)** and **C (grouped stack by Type)** are provided as alternates in the prototype but are **not** part of the recommended Phase 1.

---

## 2. Phased migration

### Phase 1 — drop-in refactor of `BlocksTable.tsx` (low risk, no API changes)

Target commit shape: **one PR, 9 files touched, all frontend.**

**Files to modify:**
```
app/admin/prompt-studio/blocks/BlocksTable.tsx          (rewrite)
components/admin/primitives/PromptFullnessMeter.tsx     (enhance: accept per-block breakdown)
```

**Files to add:**
```
components/admin/content/BlockRow.tsx                   (new — desktop row)
components/admin/content/BlockCard.tsx                  (new — mobile card)
components/admin/content/BlockEditForm.tsx              (new — shared form body, all edit logic)
components/admin/content/BlockEditDrawer.tsx            (new — desktop/tablet shell, no logic)
components/admin/content/BlockEditSheet.tsx             (new — mobile bottom-sheet shell, no logic)
components/admin/content/BulkActionsBar.tsx             (new — extracted + enhanced)
components/admin/content/SegmentedTokenMeter.tsx        (new — wraps PromptFullnessMeter)
```

**Concrete steps:**

1. **Extract `BulkActionsBar`** from the `selectedCount > 0 && <Paper>` block at lines ~285–320 of `BlocksTable.tsx`. Add a "Disable" variant button next to the Select, and swap the `ActionIcon` trash for a labeled `<Button color="red" leftSection={<IconTrash />}>` — discoverability matters more than density at this level.

2. **Replace the status column with a `Switch`:**
   ```tsx
   // was: <Select data={STATUS_OPTIONS} value={block.status} ... />
   <Switch
     checked={block.status === 'active'}
     onChange={e => handleStatusChange(block.id, e.currentTarget.checked ? 'active' : 'disabled')}
     color="green"
     disabled={isSaving}
     aria-label={`${block.status === 'active' ? 'Disable' : 'Enable'} ${block.title}`}
   />
   ```
   Delete the standalone "Active/Disabled" badge column — the switch state IS the status. This alone dedupes three cells into one and recovers ~120px of table width.

3. **Keep `NumberInput` AND add a drag handle — both write `order` via the same PATCH.**
   The two affordances serve different intents: `NumberInput` for *precise* placement ("make this the 3rd Guardrail"), drag for *relative* reordering ("move this above that one"). Power users reach for the number field; casual users drag. Both funnel through `PATCH /api/admin/blocks/[id]` with `{ order }`.

   Install `@dnd-kit` and wrap `<Table.Tbody>` in `<DndContext>` + `<SortableContext>`:
   ```bash
   npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
   ```
   Each `<BlockRow>` becomes a `useSortable` consumer and renders:
   ```tsx
   <Table.Td>
     <Group gap="xs" wrap="nowrap">
       <ActionIcon {...listeners} {...attributes} variant="subtle" style={{ cursor: 'grab' }}>
         <IconGripVertical size={14} />
       </ActionIcon>
       <NumberInput
         value={block.order}
         onBlur={e => handleOrderChange(block.id, Number(e.currentTarget.value))}
         min={1} w={64} size="xs"
       />
     </Group>
   </Table.Td>
   ```
   **Order is global, not per-type.** Remove the existing per-type uniqueness constraint. One `<SortableContext>` spans all blocks regardless of type; types interleave in compile output by global `order`. This is a simpler mental model for editors ("this block appears 5th in the compiled prompt, full stop") and matches how the backend concatenates on `compile`.
   On drop, compute the new contiguous `order` values across the full list and PATCH each changed row. Same on direct number-field edit — re-normalize all blocks and PATCH the ones whose order actually changed. For Phase 1, N parallel PATCHes are fine; Phase 2's bulk endpoint collapses drags into one transaction.

4. **Add inline preview on row click.** Keep the `isEditing` expansion you already have, but add a lighter `isExpanded` state that renders the first 8 lines of `block.body` in a monospace block. Clicking "View full" opens the existing edit flow.

5. **Move the edit UI out of the row. One form, two shells — non-negotiable.**

   The edit UI is a single `BlockEditForm` component with a fixed prop contract, wrapped by two presentational shells (drawer for desktop/tablet, bottom sheet for mobile). **Do not duplicate the form body, the safety-check flow, or the save handlers between shells.** If you find yourself copy-pasting logic into the sheet, stop and lift it into the form.

   **Stable prop contract** (this signature is the contract — don't drift):
   ```tsx
   type BlockEditFormProps = {
     block: Block;
     onSave: (draft: Partial<Block>) => Promise<void>;        // clean-path save
     onSaveAnyway: (draft: Partial<Block>) => Promise<void>;  // bypass safety warnings
     onCancel: () => void;
   };
   ```

   **What lives where:**

   | File                                         | Contains                                                                                                     |
   | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
   | `components/admin/content/BlockEditForm.tsx` | Textarea · safety-check alert (reads `runSafetyCheck`) · Save / Save Anyway / Remove-offending / Cancel buttons · draft state · all business logic |
   | `components/admin/content/BlockEditDrawer.tsx` (≥ md) | `<Drawer position="right" size="lg">` shell. Renders `<BlockEditForm>` as its only child. **No logic.** |
   | `components/admin/content/BlockEditSheet.tsx`  (< md) | `<Drawer position="bottom" size="86%" radius="md" withCloseButton={false} trapFocus>` + grabber handle. Renders `<BlockEditForm>` as its only child. **No logic.** |

   ```tsx
   // BlocksTable.tsx — container picker
   const isMobile = useMediaQuery('(max-width: 48em)');
   const EditContainer = isMobile ? BlockEditSheet : BlockEditDrawer;

   <EditContainer opened={editingId !== null} onClose={closeEdit}>
     <BlockEditForm
       block={editingBlock}
       onSave={handleSave}
       onSaveAnyway={handleSaveAnyway}
       onCancel={closeEdit}
     />
   </EditContainer>
   ```

   Wait — note that `<BlockEditForm>` is passed as a child to the shell, **not** instantiated inside each shell. This is what prevents drift: the shells literally cannot diverge because they don't own the form.

   **Test surface:** unit tests run against `BlockEditForm` once. Shell tests verify the shell renders its children and fires `onClose` — nothing else. If a shell test reaches for `runSafetyCheck` or a save button, it's in the wrong file.

   **Why split containers instead of "same shell everywhere":**
   - Bottom sheets put Save / Save Anyway in the thumb zone on a one-handed hold; a right drawer pushes them to the top-right (worst reach zone).
   - Bottom sheets leave ~14% of the list visible above — user keeps context about which row they're editing. `size="lg"` on mobile is effectively fullscreen.
   - When the virtual keyboard raises, a bottom sheet lifts with it naturally. Right drawers on iOS Safari get their layout mangled.
   - Platform convention: iOS/Android use bottom sheets for "edit this item" (Mail, Notes, Slack).
   - Trade-off: two shell files and one breakpoint hook. Small cost for a meaningful UX win on mobile-first usage.

6. **Upgrade `PromptFullnessMeter` to `SegmentedTokenMeter`.**
   ```tsx
   // Today:
   <PromptFullnessMeter bodies={activeBodies} />

   // Proposed signature:
   <SegmentedTokenMeter blocks={items.filter(b => b.status === 'active')} />
   // Renders: total chip · segmented bar (one segment per block, colored by Type) ·
   //          hover tooltip "Title · 340 tokens"
   ```
   Use `Progress.Root` + `Progress.Section` — this is the exact primitive Mantine ships for stacked progress. Each section's `value` is `(block.body.length / 4) / 8000 * 100`, colored by `TYPE_COLORS[block.type]`. Keep the existing `YELLOW_THRESHOLD=5000` / over-budget red as a wash over the whole bar.

**After Phase 1:** no behavioral regression, three UX wins (preview, single status control, drag reorder), same API contract.

---

### Phase 2 — optional, after Phase 1 ships

These are nice-to-haves that justify a small backend delta:

- **Bulk reorder endpoint** — `POST /api/admin/blocks/reorder` taking `{ type, orderedIds: string[] }` to collapse N PATCHes into one transaction. Worth it once drag becomes common.
- **Optimistic PATCH with `@tanstack/react-query` or SWR.** Your current pattern (await PATCH, then `setItems`) is fine at N~20, but feels sluggish as blocks grow. Introduce a tiny mutation wrapper; the state shape doesn't change.
- **Compile preview modal** — `PublishButton` currently fires `/api/admin/prompt/compile` directly. A preview step (showing the compiled prompt, per-block token breakdown, and a diff vs the last-published version) is the single highest-value addition for editor confidence. I can design this if you want.

---

## 3. Component-by-component mapping (prototype → codebase)

| Prototype file              | Codebase target                                                         | Notes                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `shell.jsx` → `AppShell`    | `components/admin/layout/AdminShell.tsx` *(already exists, do not replace)* | My shell was a sketch; yours is production-grade. Ignore mine entirely.                               |
| `shell.jsx` → `TokenMeter`  | `components/admin/primitives/PromptFullnessMeter.tsx` → enhance to `SegmentedTokenMeter` | Keep the threshold logic; add per-block segments.                                                     |
| `shell.jsx` → `CompileModal` | *(Phase 2)* — new `app/admin/prompt-studio/blocks/CompilePreviewModal.tsx` | Wire behind `PublishButton` as a pre-flight step.                                                     |
| `variation-a.jsx` → `BlockRow` | `components/admin/content/BlockRow.tsx` (new)                       | Drag handle from `@dnd-kit/sortable`, Switch for status, click-to-expand preview.                     |
| `variation-a.jsx` → `BulkBar` | `components/admin/content/BulkActionsBar.tsx` (new)                   | Sticky under meter. Lives outside the table.                                                          |
| `mobile.jsx` → edit sheet       | `components/admin/content/BlockEditSheet.tsx` (new)                  | **Bottom sheet** (`position="bottom" size="86%"`), not a right drawer. Shell only — renders `<BlockEditForm>` as child.   |
| inline edit row (today)        | `components/admin/content/BlockEditForm.tsx` (new)                   | All edit logic lives here once. Consumed as a child by both `BlockEditDrawer` and `BlockEditSheet`.                   |
| `mobile-compile.jsx`           | *(Phase 2 — same as Compile modal above)*                              | Mobile bottom-sheet variant of the compile preview.                                                   |
| `dnd.jsx` (`useSortable`)      | **Delete** — use `@dnd-kit/sortable`'s `useSortable` directly.         | My hook was a prototype stand-in.                                                                     |
| `data.jsx`                     | N/A                                                                     | Sample data only. Your real data comes from `BlocksPage`'s Supabase query.                            |
| `mantine.css`                  | N/A                                                                     | Your `mantine-theme.ts` is authoritative. Ignore my CSS file entirely.                                |

---

## 4. Theme & token alignment

The prototype uses default Mantine (Inter, blue primary). **Your theme is the source of truth.** Specifically:

- **Colors:** `TYPE_COLORS` is the single source of truth for block-type styling. Define it once, import everywhere (badges, type filter chips, segmented meter sections, legend):

  ```ts
  // components/admin/content/blockTypes.ts
  export const BLOCK_TYPES = ['identity', 'knowledge', 'guardrail', 'process', 'escalation'] as const;
  export type BlockType = typeof BLOCK_TYPES[number];

  export const TYPE_COLORS: Record<BlockType, MantineColor> = {
    identity:   'violet',
    knowledge:  'blue',
    guardrail:  'red',
    process:    'orange',
    escalation: 'yellow',
  };

  export const TYPE_LABELS: Record<BlockType, string> = {
    identity:   'Identity',
    knowledge:  'Knowledge',
    guardrail:  'Guardrail',
    process:    'Process',
    escalation: 'Escalation',
  };
  ```

  Pass the color key directly to `Progress.Section color=`, `Badge color=`, `Chip color=`. Do **not** invent new colors and do **not** add or remove types without a schema change.
- **Radius:** your `defaultRadius: 'sm'` (4px) — use on every `<Paper>`, `<Card>`, `<Modal>` and avoid passing `radius=` unless overriding.
- **Fonts:** body = DM Sans, display = Playfair, mono = DM Mono. The token chip and offendingText block should use `var(--mantine-font-family-monospace)` (already done in your code — preserve).
- **Brand green:** `#2d6a4f` (`colors.green[6]`). The status `Switch` should be `color="green"` to match the publish CTA.

---

## 5. Prompt for next-phase Claude Code

When you open the repo in Claude Code for the build, paste this as the first message:

> Read `design_handoff_blocks_redesign/README.md` then `design_handoff_blocks_redesign/INTEGRATION_natural-resource.md`. Implement Phase 1 only. Open `app/admin/prompt-studio/blocks/BlocksTable.tsx` alongside you — that's the file being refactored. Use the existing `@mantine/core` primitives and respect `components/admin/theme/mantine-theme.ts`. Do not modify any API routes. Produce a single PR with the 9 file changes listed in Phase 1. **Where README and INTEGRATION conflict, INTEGRATION wins** — README is a general design-system overview, INTEGRATION is the canonical codebase-specific spec (block types, order semantics, shell architecture, acceptance checklist). After drafting, run `npm run build` to confirm types are clean.

---

## 6. Acceptance checklist for Phase 1

- [ ] `BlocksTable.tsx` no longer has both a status Badge column AND a Select-based status column — `Switch` is the only status surface.
- [ ] Rows reorder by **drag handle** AND by editing the `NumberInput` directly. Order is **global** (one sort key across all blocks, types interleave). Both paths write through `PATCH .../blocks/[id]` with `{ order }` and re-normalize contiguous orders across the full list. Mobile supports long-press drag.
- [ ] All **five** block types (`identity`, `knowledge`, `guardrail`, `process`, `escalation`) render their correct `TYPE_COLORS` in badges, type filter chips, and segmented-meter sections.
- [ ] Clicking a row expands a body preview; clicking "Edit" opens the edit surface — right-side `<Drawer>` at ≥ md, bottom sheet (`position="bottom" size="86%"`) at < md.
- [ ] `BlockEditForm` exists as a single file with the prop contract `{ block, onSave, onSaveAnyway, onCancel }`. It is passed as a **child** to `BlockEditDrawer` / `BlockEditSheet`, not instantiated inside either shell.
- [ ] `BlockEditDrawer.tsx` and `BlockEditSheet.tsx` contain zero business logic — no references to `runSafetyCheck`, no save handlers, no draft state. Grep confirms: only Mantine `<Drawer>` props and `{children}`.
- [ ] Unit tests exist for `BlockEditForm` covering clean save, safety-check warning → Save Anyway, and Remove-offending. Shell tests only verify render + `onClose`.
- [ ] Bulk bar still offers Enable/Disable/Delete and is sticky on scroll.
- [ ] Token meter shows one segment per active block, colored by type. Hovering a segment shows `{title} · {tokens} tokens`. Over-budget still turns red.
- [ ] Mobile: single `BlockCard` component; tapping the switch toggles status; tapping anywhere else opens the bottom sheet (`BlockEditSheet`).
- [ ] No new API routes. Existing `PATCH /api/admin/blocks/[id]` absorbs all writes.
- [ ] `npm run build` succeeds with zero type errors.
