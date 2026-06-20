# Handover — Appearance Change History

**2BL.AI tenant admin · target file: `app/admin/settings/Appearance.tsx`**
Mantine v7 · Next.js App Router · TypeScript strict. Status: **design complete, awaiting data wiring.**

---

## 1. What was built

A read-only **audit trail** added to the bottom of the **Appearance** accordion section in Settings.
It answers "what theme changes were made, by whom, and when." Nothing else on the Appearance tab
changed — the color/typography editor and live preview are untouched; this is appended below them.

Each row is **one field change**, newest first:

- **Avatar** (auto-initials, deterministic color from the actor's name)
- **`<Actor> changed <Field>`**
- **Before → After diff** — for color fields, a swatch + lowercase hex on each side; for font and
  toggle fields, plain text (e.g. `Inter → Playfair Display`, `Off → On`)
- **Timestamp** (absolute: `Jun 18, 2026, 2:22 PM`)

Header shows a total count (`6 changes`). Empty state: "No changes recorded yet."

---

## 1b. Paper effect — decoupling + on/off control

The storefront's warm "paper" look is a **relationship between surfaces** (the `--color-paper` /
`-2` / `-3` + `--color-line` stack in `app/secondbrainlabs/globals.css`) — not a texture or filter.
Previously those were five independently hand-tuned creams, which a single editable `background`
control would desync (white page, cream cards, tan borders).

**Decision (chosen): derive, don't hand-set — and gate it with a toggle.**

- A new token **`paper_effect`** (boolean, default **on**) is added to the theme.
- `background` stays the only surface color a tenant sets. The raised/sunken surfaces + hairline are
  **derived** from it via `derivePaperStack.ts`:
  - **on** → warm tonal steps + warm hairline (the paper depth holds for any base color)
  - **off** → surfaces collapse to the background (flat), faint neutral hairline
- The Appearance live preview now shows a layered surface (card + chips) so the toggle's effect is
  visible as you flip it.
- `paper_effect` logs through the same audit pipeline (it's a `toggle` kind — already in `FIELD_META`).

**Wiring on the storefront:** feed `derivePaperStack(background, paper_effect)` → `paperStackVars()`
into the theme as CSS custom properties (on `layout.tsx` / the theme provider) so `globals.css`
consumes derived `--color-paper*` / `--color-line` values instead of the constants. The constants in
`globals.css` become the *default* (effect-on, default background) fallback.

*Texture and other true "effects" stay deferred* — when wanted, they come in as new field **kinds**
(e.g. `paper_texture: none | subtle | strong`, `kind: 'effect'`): one schema entry, one renderer, one
`FIELD_META` line. The kind-based history + editor pipeline already supports that additively.

---

## 2. Files & structure (prototype → production)

In the prototype, all of this lives in three files:

| Prototype file | What's there |
|----------------|--------------|
| `tenant-admin/settings.jsx` | `AppearanceHistory` + `DiffValue` components and `fmtHistDate`; rendered at the end of `WebsiteAppearance`'s return, below `.theme-grid`. |
| `tenant-admin/data.jsx` | `APPEARANCE_HISTORY` mock array (the shape the API must return). |
| `tenant-admin/styles.css` | `.hist-*` classes (`/* Appearance — change history */`). |

**The production files are written and included in this bundle** under `app/admin/settings/`
(Mantine v7, matching the Members Admin conventions). Verify import paths + the Supabase select
against your schema before shipping.

| File | Type | Status | Responsibility |
|------|------|--------|----------------|
| `AppearanceHistory.tsx` | Client | **written** | The list: maps entries → rows, renders avatar + line + diff + time. Header count + empty state. |
| `AppearanceDiff.tsx` | Client | **written** | The `kind`-aware before/after renderer (the prototype's `DiffValue`). |
| `getAppearanceHistory.ts` | Server | **written** | Reads the audit log for this tenant's theme settings and shapes `AppearanceChange[]` (see §4). |
| `derivePaperStack.ts` | — | **written** | Derives the layered paper surfaces + hairline from `background`, gated by `paper_effect` (see §1b). |
| `types.ts` | — | **written** | `AppearanceChange`, `AppearanceChangeKind`. |
| `utils.ts` | — | **written** | `formatAuditTime`. |
| `Appearance.tsx` | Client | **you wire** | Existing editor component — add one line to render the history (snippet below). |

These reuse existing primitives instead of the prototype's hand-rolled markup: **`Avatar`**
auto-initials (`color="initials"`, same as Members Admin — replaces `avatarColor`/`initials`),
**`Card`**, and the `Text`/`Group`/`Stack` layout primitives.

### Wiring (two edits)

**1. Load the history in the Settings page's server component** and pass it down:

```tsx
// app/admin/settings/page.tsx (server)
import { getAppearanceHistory } from './getAppearanceHistory';

const appearanceHistory = await getAppearanceHistory(tenantId); // tenantId from session/route
// …pass to the Appearance section: <Appearance history={appearanceHistory} … />
```

**2. Render it at the end of `Appearance.tsx`**, below the editor grid:

```tsx
import { AppearanceHistory } from './AppearanceHistory';
// …
return (
  <Stack gap="md">
    {/* existing two-column editor + live preview */}
    <SimpleGrid cols={{ base: 1, md: 2 }}>{/* … */}</SimpleGrid>

    <AppearanceHistory log={history} />
  </Stack>
);
```

`Appearance.tsx` is a `'use client'` component, so thread `history` down as a prop from the server
page (don't fetch inside it).

---

## 3. Diff rendering rules

`kind` drives how `from` / `to` are displayed:

| `kind` | Renders | Notes |
|--------|---------|-------|
| `color` | Swatch chip + lowercase hex | Swatch is `background: <value>`; hex in mono. |
| `font`  | Mono text | Font family name as stored. |
| `toggle` | Plain text | Map booleans to friendly labels server-side (`On`/`Off`), or pass the label. |

Keep `kind` on the data so the UI stays dumb — don't infer it from the field name. If new theme
fields appear (e.g. a number/spacing token), add a `kind` and a branch rather than special-casing.

---

## 4. Data requirements

These changes should already be recorded by the **same audit mechanism every other admin mutation
uses** — the Appearance "Save" handler writes one `audit_events` row per changed field (same
transaction as the settings write). This component only **reads** that log; it does not create it.

### Entry shape (what `getAppearanceHistory` returns)

```ts
type AppearanceChange = {
  id: string;
  actor: string;          // display name
  email?: string;         // for the row tooltip / disambiguation
  field: string;          // human label: "Accent", "Primary font", "Apply accent to buttons"
  kind: 'color' | 'font' | 'toggle';
  from: string;           // prior value (hex, font name, or "On"/"Off")
  to: string;             // new value
  at: string;             // ISO timestamp; UI formats it
};
```

### Query (shape, not literal)

Filter `audit_events` to this tenant + the appearance/theme settings entity, one row per field
change, ordered `at desc`:

```
audit_events:  id, actor_id, entity, field, old_value, new_value, created_at
users:         id, name, email         // joined for actor + email
```

Map `old_value/new_value → from/to`, derive `kind` from the field's type, and resolve `actor` from
`actor_id`. Booleans → `"On"/"Off"`.

---

## 5. Open decisions

1. **Audit source of truth.** Confirm Appearance saves already emit per-field `audit_events`. The
   current save handler is a stubbed `setTimeout` in the prototype — production must write the audit
   rows (one per changed field) for this log to populate. If saves only record a coarse "settings
   updated" event, add per-field diffing at write time.
2. **Granularity.** The design shows one row **per field**. If a single Save changes 3 fields, that's
   3 rows sharing a timestamp. Confirm that's desired vs. grouping a Save into one expandable entry.
3. **History depth / paging.** Prototype shows the full list. For long-lived tenants, cap to the
   last N (e.g. 20) with a "View all" link to a fuller audit view, or paginate server-side.
4. **Relative vs. absolute time.** Currently absolute (`Jun 18, 2026, 2:22 PM`). The rest of admin
   uses relative ("2d ago") in some places — pick one; a `title` with the absolute value on a
   relative label is the usual compromise.
5. **Actor for system/automated changes.** If theme can change via import/migration/API, decide the
   actor label (e.g. "System") and avatar treatment.
6. **Permissions.** This is read-only and safe for any admin who can see Settings; confirm no field
   values are sensitive enough to gate.

---

## 6. Reference

- **Production files (this bundle):** `app/admin/settings/` — `AppearanceHistory.tsx`,
  `AppearanceDiff.tsx`, `getAppearanceHistory.ts`, `types.ts`, `utils.ts`. Drop-in; wire per §2.
- `Combined Admin - Production.html` → **Settings → Appearance** (expand the section, scroll past the
  editor) — the approved interactive prototype. Design reference, not code to copy.
- Mirrors the audit/notification split used in **Members Admin** (`design_handoff_members_admin/handover.md`):
  the server records audit on write; the client only reads and renders.
