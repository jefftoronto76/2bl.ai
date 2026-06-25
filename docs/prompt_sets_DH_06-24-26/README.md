# Handoff: Prompt Sets (Tenant Settings + Platform Master)

## Overview
This package adds **prompt sets** to the 2BL admin — two Settings surfaces backed by one
`prompt_sets` table:

1. **Tenant Settings → Prompt Sets** *(new accordion panel)* — a tenant manages its own
   prompt sets: label, description, status (live/draft), and, when live, the **usage type**
   (where the set is wired in). `version` and `is_master` are read-only here.
2. **Platform Settings → Master Prompt** *(picker)* — a platform admin flags exactly one
   set, across all tenants, as the platform **master**. This is the *write* side of the
   read-only "Master" badge the tenant page displays.

They are intentionally shipped together: the tenant page **shows** `is_master`; the platform
page **sets** it. Same table, two roles.

## About the design files
The files under `prototype/` are **design references built in HTML/JS** (the approved
prototype, `Combined Admin - Production.html` → Settings, and Platform → Settings). They show
intended look and behavior — they are **not** production code to paste in. The task is to
recreate them in the real app's environment (**Next.js App Router + Mantine v7 + TypeScript**),
using its existing patterns. The `.tsx`/`.css`/`.sql` files in this bundle are
**production-shaped skeletons** already written to those conventions — wire them to your real
endpoints and tenancy/session helpers.

## Fidelity
**High-fidelity.** Colors, spacing, typography, and interactions match the approved prototype
and the existing Settings panels. The tenant panel mirrors `SageParameters.tsx` exactly (Add
New → view/edit `Card` split → delete `Modal` → `notifications`), so it slots in as a sibling
of the other four accordion items.

---

## Decisions (these were open questions — now resolved)
- **`version` — auto, read-only.** Auto-increments on **compile** (a `bump_prompt_set_version`
  function called by the compile pipeline), never from the Settings PATCH path. The editor only
  displays it (`v7 · auto-increments on compile`).
- **`is_master` — read-only on the tenant page.** Set only from Platform Settings → Master Prompt.
- **`usage_type` — open-ended.** Seed options `base` / `member`, plus an inline **＋ New type…**
  affordance that mints a new slug. Only meaningful while `status === 'live'`.
- **`status` — multiple sets may be Live at once** (no exclusivity on the tenant page).
- **Master is single** platform-wide (enforced by a partial unique index + a transactional PUT).
- **Scope — all tenants** have the panel (it includes a create flow). In the prototype the
  current tenant is hardcoded (`sbl`); in the app, resolve `tenant_id` from the session.

---

## Surface 1 — Tenant Settings → Prompt Sets

### Files
- `tenant-settings/PromptSets.tsx` — the panel. Drop at `app/admin/settings/PromptSets.tsx`.
- `tenant-settings/page.tsx.accordion-item.md` — the one import + `Accordion.Item` to add to
  `app/admin/settings/page.tsx` (second item, after Parameters).

### Layout / components
- **Header row:** right-aligned `Add New` button (`green`, `IconPlus`), disabled while the new
  card is open.
- **View card** (`Card withBorder radius="md" p="md"`, transparent bg): title (`label`),
  mono `v{version}`, then badges — **Live** (green light) / **Draft** (yellow light), **Master**
  (green filled, only if `is_master`), and the **usage type** chip (gray light, only when live).
  Pencil + red trash `ActionIcon`s on the right. Description line below. Then the read-only
  **meta strip** (gray-0 `Card`): Version, Master, ID, Tenant ID, Created, Updated.
- **Edit/new card:** `Label` (TextInput), `Description` (autosize Textarea), `Status` (Select),
  and — only when Live — `Used as` (Select with **＋ New type…**, which swaps to a TextInput with
  an inline Cancel). The same meta strip renders read-only (showing "generated on save" / "from
  session" / "on save" in new mode). Footer: Cancel (subtle gray) + Save/Create set (green).
- **Delete:** centered `Modal`, "Delete prompt set?", Cancel + red Delete (loading state).

### State & data
Self-contained, same shape as `SageParameters`: `sets`, `loading`, `editingId`, `drafts`,
`savingId`, `deleteTarget`, `deleting`, `showNewCard`. Talks to `/api/admin/prompt-sets`
(GET / PATCH-upsert / DELETE). Only editable fields travel in the PATCH body; the server owns
`tenant_id`, `version`, `is_master`, timestamps. See `api/prompt-sets.routes.md`.

---

## Surface 2 — Platform Settings → Master Prompt

### Files
- `platform-settings/page.tsx` — the screen orchestrator (route `app/platform/settings/`).
- `platform-settings/MasterPromptPicker.tsx` + `.module.css` — the cross-tenant prompt-set
  picker (search across tenants, Live/Draft badge, double-check on the live master).
- `platform-settings/PlatformSettings.module.css` — page/field layout.
- `platform-settings/types.ts` — `MasterPromptOption` + `MasterPromptSetting`.

### Behavior
Loads every prompt set the platform admin can see + the current master pointer, holds a pending
selection (defaults to the live master), and **Save** PUTs `{ promptSetId }`. Promoting a set
sets `is_master = true` on it and clears the others (single-master). Nothing auto-saves.
Endpoints: `GET /api/platform/prompt-sets`, `GET|PUT /api/platform/settings/master-prompt`.

---

## Shared data layer
- `migrations/0001_prompt_sets.sql` — the `prompt_sets` table, `updated_at` trigger, the
  single-master partial unique index, and `bump_prompt_set_version()` (compile-only).
- `api/prompt-sets.routes.md` — both route groups, with the server-owned-field rules.

## Design tokens
Mantine v7 vars throughout. Status: **Live** `green`, **Draft** `yellow`, **Master** `green`
filled, usage `gray` — all `variant="light"` except Master (`filled`), `radius="sm"`. Meta strip
on `--mantine-color-gray-0`, mono values via `--mantine-font-family-monospace`. Sizes/spacing
match `SageParameters` (`Stack gap="sm"/"md"`, `Card p="md"`, `size="sm"` controls).

## Prototype reference files
- `prototype/tenant-settings.prototype.jsx` — the HTML-prototype Settings screen (the
  `PromptSets` accordion + the other four panels), for visual parity.
- `prototype/platform-settings.prototype.jsx` — the Platform Settings → Master Prompt screen.

## QA checklist
- [ ] Tenant: Add New → fill label, Draft → Create; appears as a card.
- [ ] Switch a set to Live → "Used as" required; pick `base`/`member` or mint a new type.
- [ ] `version`, `is_master`, ID, Tenant ID, Created, Updated all read-only.
- [ ] Edit → Save updates the card + `updated_at`; Delete confirms via modal.
- [ ] Platform: pick a different set, Save → it becomes master; the prior master clears.
- [ ] The newly-mastered set shows the read-only **Master** badge on its Tenant Settings card.
