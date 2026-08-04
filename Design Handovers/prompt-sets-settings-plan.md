# Plan: Prompt Sets — Tenant Settings panel + Platform Master Prompt picker

> **Deliverable note:** The task is to produce this plan document. On approval it
> will be saved to **`docs/prompt-sets-settings-plan.md`** (plan-mode currently
> restricts edits to this plan file).

## Context

The `docs/prompt_sets_DH_06-24-26/` handoff package adds **prompt sets** to the
2BL admin across two Settings surfaces backed by one `prompt_sets` table:

1. **Tenant Settings → Prompt Sets** — a new accordion panel where a tenant
   manages its own sets (label, description, status, and — when live — the prompt
   type the set is wired to). `version` + `is_master` are read-only here.
2. **Platform Settings → Master Prompt** — a new platform-admin screen where one
   set across all tenants is flagged the platform master (the write side of the
   read-only "Master" badge the tenant panel shows).

**Critical substitution (applies everywhere in this plan):** the handoff's
open-ended `usage_type` (text) field **does not exist** on `prompt_sets`. It is
replaced by **`prompt_type_id`** — a UUID FK to `prompt_types.id`. The type
selector loads options from a new `GET /api/admin/prompt-types` and stores the
chosen `prompt_types.id` as `prompt_type_id` on the set. The handoff's inline
"＋ New type…" mint affordance is **kept** but rewired: instead of minting a
free-text usage slug, it creates a managed `prompt_types` row via a new
`POST /api/admin/prompt-types` and stores the returned `id` — types remain a
managed `prompt_types` list, never free text.

---

## Conflicts between handoff and live code (flagged before planning)

| # | Handoff assumption | Live reality | Resolution |
|---|--------------------|--------------|------------|
| 1 | `prompt_sets` is a **new** table to create via `migrations/0001_prompt_sets.sql`. | Table **already exists**. `System Docs/DB_CHANGELOG.md` (June 25 2026) shows `prompt_type_id`, `prompt_sets_single_master_idx`, and the `touch_updated_at` trigger already added; `is_master` added earlier. `usage_type` exists nowhere. | **No migration needed.** Schema work is already done by Jeff and already matches the `prompt_type_id` substitution. Per workflow rule #3, CC writes no migration. The handoff `.sql` is reference only. |
| 2 | `GET /api/admin/prompt-sets` is new, returns unwrapped `PromptSet[]` with full fields. | Route **exists** (`app/api/admin/prompt-sets/route.ts`), is **read-only**, returns wrapped narrow `{ promptSets: [{id,label,description,status,version}] }`, and feeds the Composer picker (`app/admin/prompt-builder/page.tsx:130`). | **Decision: expand GET + update Composer** (single source of truth). GET returns unwrapped full rows; the one Composer consumer is updated to the new shape. Add PATCH + DELETE. |
| 3 | Type selector mints free-text usage slugs (`base`/`member` + "＋ New type…"). | `prompt_types` is a managed per-tenant table with seeded platform defaults; **no `GET /api/admin/prompt-types` route exists**. | New routes `GET /api/admin/prompt-types` and `POST /api/admin/prompt-types`. The GET feeds the type selector. The POST handles the inline "＋ New type…" affordance — creates a new `prompt_types` row with `tenant_id` from session, `name` from user input, `key` slugified from name, returns the new row. The selector in `PromptSets.tsx` keeps the inline mint affordance, wired to `POST /api/admin/prompt-types`. |
| 4 | Platform screen lives at `app/platform/settings/page.tsx`; components at `@/components/admin/platform-settings/*`. | Platform routes live under the **`app/(platform)/platform/*`** route group; nav is centralised in `components/admin/shell/nav-config.ts`; gating is in `app/(platform)/layout.tsx`. | Page goes at `app/(platform)/platform/settings/page.tsx`. Co-locate its components under that folder (or `components/admin/platform-settings/`); add nav + page-title + padded-route entries to `nav-config.ts`. |
| 5 | Platform picker uses CSS modules (`.module.css`) with literal hex. | Admin/platform surfaces are **Mantine v7** (Tailwind only on public). Other platform pages use Mantine (`Stack/Title/Text`). | Rebuild the picker in Mantine to match the existing Settings panels rather than dropping in raw CSS modules. (Functionally equivalent; design-system consistency is a CLAUDE.md gate.) |
| 6 | "Prompt set" = the `prompt_sets` table. | The **Blocks page** derives "sets" from `prompt_types` via `getPromptSets.ts` / `promptSets.ts` (a *different* mechanism), and uses capitalized `'Live'/'Draft'`. The `prompt_sets` table check-constraint is lowercase `'live'/'draft'`. | Blocks page is in scope. `getPromptSets.ts` replaced to query `prompt_sets` directly (not `prompt_types`). Blocks query filters by `prompt_set_id` of the selected set. Status casing normalized to lowercase on all read comparisons. |

---

## Current state of the Settings page

`app/admin/settings/page.tsx` is a `'use client'` page rendering a single Mantine
`Accordion` (`multiple`, `variant="separated"`, `defaultValue={[]}`) with four
items, each a header (bold title + dimmed subtitle spans) + panel:

1. **Parameters** → `<SageParameters />`
2. **Chat Thresholds** → `<ChatThresholds />`
3. **Invite Gate** → `<InviteGate />`
4. **Appearance** → `<Appearance />`

`SageParameters.tsx` is the canonical pattern the new panel mirrors: self-contained
client component, `fetch` on mount → `notifications`, Add-New → view/edit `Card`
split → delete `Modal`, server-owned fields excluded from the PATCH body, slugified
key, char-counter inputs. The new `PromptSets` panel slots in as the **second**
accordion item (after Parameters).

No existing platform Settings page or `/platform/settings` route exists.

---

## Change table — every file changing

### Phase 1 — Supporting API: prompt-types (foundation)

| File | Change | Why |
|------|--------|-----|
| `app/api/admin/prompt-types/route.ts` | **New.** `GET` → `getAuthContext()`, return `prompt_types` rows for the tenant (`id, key, name, description, sort_order`) ordered by `sort_order` (nulls last) then `name`. Reuse the existing reader logic in `app/admin/prompt-studio/blocks/getPromptSets.ts` (the `prompt_types` query is already written there — extract/share rather than duplicate). **Add `POST`** → `getAuthContext()`, body `{ name }`, create a `prompt_types` row with `tenant_id` from session, `name` from input, `key` slugified from `name`; return the new row. 401 on auth failure, 400 on missing/invalid name, 500 on DB error. | The tenant panel's type `Select` needs a tenant-scoped prompt-types list keyed by `id` (GET); the inline "＋ New type…" affordance needs to create one (POST). Neither exists today. |

### Phase 2 — Tenant Settings → Prompt Sets panel

| File | Change | Why |
|------|--------|-----|
| `app/api/admin/prompt-sets/route.ts` | **Modify.** `GET` returns **unwrapped** `PromptSet[]` with full fields (`id, tenant_id, label, description, status, is_master, prompt_type_id, version, created_at, updated_at`) ordered `created_at desc`; optionally LEFT JOIN `prompt_types` to surface a `prompt_type` label for the chip. **Add `PATCH`** (upsert): body `{ id?, label, description, status, prompt_type_id }`; resolve `tenant_id` from session; reject `id` not in tenant; ignore client `version`/`is_master`/timestamps; force `prompt_type_id = null` when `status !== 'live'`; insert defaults `version=1, is_master=false`; return saved row. `void logEvent(...)`. | The panel needs full rows + write paths; existing route is read-only/narrow. |
| `app/api/admin/prompt-sets/[id]/route.ts` | **New.** `DELETE` one set scoped to session tenant; `{ ok: true }` / `{ error }`. `void logEvent(...)`. | Delete-confirm modal target. |
| `app/admin/settings/PromptSets.tsx` | **New.** Adapt the handoff `tenant-settings/PromptSets.tsx`: same view/edit Card + delete Modal + Add-New structure, but **replace `usage_type` with `prompt_type_id`**: `DraftFields`/`PatchPayload` carry `prompt_type_id: string \| null`; the "Used as" control becomes a Mantine `Select` populated from `GET /api/admin/prompt-types` (value=`id`, label=`name`), shown only when `status === 'live'`, required when live. The inline "＋ New type…" affordance is **kept**, rewired to `POST /api/admin/prompt-types` (mints a managed `prompt_types` row, then selects the returned `id`) — the free-text `slugifyUsage` slug path is removed. View-card chip shows the resolved prompt-type name. `MetaStrip` unchanged (read-only version/master/id/tenant/dates). | The tenant management surface. |
| `app/admin/settings/page.tsx` | **Modify.** Add `import { PromptSets } from './PromptSets'` and a new `Accordion.Item value="prompt-sets"` (title "Prompt Sets", subtitle per handoff) directly after the `parameters` item. | Mount the panel. |
| `app/admin/prompt-builder/page.tsx` | **Modify.** Update the `fetchPromptSets` consumer (line ~127-144) to read the **unwrapped** array from the changed GET (was `body.promptSets`). Fix the Live-detection to lowercase `=== 'live'` (DB constraint). | Conflict #2 reconciliation — keep the Composer working against the new shape. |
| `app/admin/prompt-studio/blocks/getPromptSets.ts` | **Modify.** Replace the `prompt_types`-derived "sets" query with a direct `prompt_sets` query for the tenant. The Blocks table filters by the selected set's `prompt_set_id`. Normalize all status comparisons to lowercase `'live'/'draft'` on read. | Conflict #6 reconciliation — the Blocks picker now shows real `prompt_sets` rows. |

### Phase 3 — Platform Settings → Master Prompt

| File | Change | Why |
|------|--------|-----|
| `app/api/platform/prompt-sets/route.ts` | **New.** `GET` gated on `getCurrentUser().isPlatformAdmin` (403 else), returns the cross-tenant superset: each option `{ id, label, tenantId, tenantName, status, version }` (JOIN `tenants.name`). | Feeds the cross-tenant picker. |
| `app/api/platform/settings/master-prompt/route.ts` | **New.** `GET` → `{ promptSetId, setByName?, setAt? }` current master pointer (the `is_master=true` row; `setBy*` from latest `audit_events` if cheap, else omit). `PUT` body `{ promptSetId }`, platform-admin gated, transactional: clear `is_master` on all other rows, set on target (the partial unique index `prompt_sets_single_master_idx` already enforces single-master). `void logEvent(...)`. | Read + write the platform master. |
| `app/(platform)/platform/settings/page.tsx` | **New.** Port handoff `platform-settings/page.tsx` orchestrator (load options + master, pending-selection state defaulting to master, confirm-Save, Cancel, dirty/empty states) but render in **Mantine** (`Stack/Title/Text/Button` + the picker) instead of CSS-module markup. | The platform screen. |
| `app/(platform)/platform/settings/MasterPromptPicker.tsx` (+ `types.ts`) | **New.** Cross-tenant searchable prompt-set picker (Live/Draft badge, double-check on live master). Prefer a Mantine `Select`/`Combobox` (searchable) over the hand-rolled CSS-module dropdown to stay on the design system. `types.ts` holds `MasterPromptOption` / `MasterPromptSetting` / `formatSetAt`. | Presentational picker the page drives. |
| `components/admin/shell/nav-config.ts` | **Modify.** Add `{ label: 'Settings', href: '/platform/settings' }` to the `Platform` section; add `'/platform/settings': 'Settings'` to `PAGE_TITLES`; add `'/platform/settings'` to `PADDED_ROUTES`. | Surface the screen + correct chrome. |

**Auth/scoping reuse (no new helpers):** tenant routes use `getAuthContext()` +
`getAdminClient()` (`@/services/auth`); platform routes use `getCurrentUser()` +
`user.isPlatformAdmin` (403) per `app/api/platform/tenants/route.ts`. Audit via
`logEvent` (`@/services/audit`).

---

## New API routes (summary)

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/admin/prompt-types` | GET | tenant (`getAuthContext`) | List tenant prompt types for the type selector. |
| `/api/admin/prompt-types` | POST | tenant (`getAuthContext`) | Create a new prompt type inline from the type selector. |
| `/api/admin/prompt-sets` | PATCH (new), GET (expanded) | tenant | Upsert a set / list full rows. |
| `/api/admin/prompt-sets/[id]` | DELETE | tenant | Delete one set. |
| `/api/platform/prompt-sets` | GET | platform admin | Cross-tenant set superset for the picker. |
| `/api/platform/settings/master-prompt` | GET, PUT | platform admin | Read/transactionally set the single master. |

No HTTP route mutates `version` — it is bumped only by the compile pipeline
(`bump_prompt_set_version`), read-only everywhere in Settings.

---

## Phased implementation (independently deployable)

- **Phase 1 — `GET`/`POST /api/admin/prompt-types`.** Pure additive; no UI consumer yet.
  Deployable + verifiable alone (curl/Network tab). Unblocks the Phase-2 selector.
- **Phase 2 — Tenant Prompt Sets panel** (`prompt-sets` GET/PATCH/DELETE +
  `PromptSets.tsx` + page wiring + Composer consumer update + Blocks-page picker
  swap). Self-contained tenant feature; ships without Phase 3. The Composer- and
  Blocks-consumer edits ship in the *same* phase as the GET-shape change so neither
  consumer ever sees a mismatched shape.
- **Phase 3 — Platform Master Prompt** (`/api/platform/*` + `/platform/settings`
  page + nav). Depends only on the existing `prompt_sets` rows; independent of
  Phase 2's UI. Deployable last.

Each phase: commit + push immediately, verify on the Vercel preview, pause for
approval before the next (per CLAUDE.md push cadence / one-change-at-a-time).

---

## Test plan per phase

**Write before implementation (CLAUDE.md gate).**

**Phase 1**
- Unit (if a service fn is extracted): GET returns tenant rows ordered by
  `sort_order` nulls-last then `name`; `[]` on no rows / DB error (fail-open). POST
  slugifies `key` from `name`, scopes `tenant_id` to session, rejects empty name.
- Manual (preview): authed `GET /api/admin/prompt-types` → 200 + array; authed
  `POST` → 200 + new row; signed-out → 401.

**Phase 2**
- Unit: PATCH body validation (label required; `prompt_type_id` forced null when
  not live; client `version`/`is_master`/timestamps ignored; cross-tenant `id`
  rejected). DELETE tenant-scoping (foreign-tenant id → not found).
- Component/manual (preview, QA checklist from README):
  Add New → label + Draft → Create → card appears; switch to Live → type Select
  required, pick a type → chip shows the name; inline "＋ New type…" → mints a
  `prompt_types` row and auto-selects it; `version`/`is_master`/IDs/dates
  read-only; Edit → Save updates card + `updated_at`; Delete → modal → row gone.
- Regression: Composer (`/admin/prompt-builder`) picker still lists sets and
  preselects the Live one against the new unwrapped shape. Blocks page picker
  lists real `prompt_sets` rows and filters the table by `prompt_set_id`; existing
  block CRUD unaffected.

**Phase 3**
- Unit: PUT single-master transaction (prior master cleared, target set; second
  PUT to a different set flips correctly); non-admin → 403.
- Manual (preview): `/platform/settings` lists sets across tenants with
  tenant name + Live/Draft; pick a different set → Save → it becomes master, prior
  clears; empty state when no sets; the newly-mastered set shows the read-only
  **Master** badge on its Tenant Settings card.

---

## Do-not-regress checklist

- [ ] **Composer picker** (`/admin/prompt-builder`) keeps working after the GET
      shape change — sets list, Live preselect, block save with `prompt_set_id`.
- [ ] **Blocks page** picker shows real `prompt_sets` rows for the tenant. Blocks
      table filters by selected `prompt_set_id`. Existing block CRUD (toggle, edit,
      delete, bulk) unaffected.
- [ ] Existing four Settings accordion panels (Parameters, Chat Thresholds,
      Invite Gate, Appearance) unchanged in behavior + order; Prompt Sets inserts
      at position 2 only.
- [ ] **No schema/migration work by CC** — `prompt_sets` + `prompt_type_id` +
      single-master index already exist (Jeff/Studio). If a column is missing at
      build time, stop and flag (rule #3).
- [ ] `version` + `is_master` never written from any Settings PATCH path;
      `prompt_type_id` forced null unless `status === 'live'`.
- [ ] Single-master invariant holds (partial unique index + transactional PUT);
      no path leaves two `is_master=true` rows.
- [ ] Platform routes reject non-platform-admins (403) independent of client routing.
- [ ] Status casing standard = lowercase `'live'/'draft'` (DB constraint) in all
      new code; no new `'Live'/'Draft'` string comparisons against table rows.
- [ ] Mantine v7 only on these admin/platform surfaces (no CSS-module raw-hex
      drop-ins); mobile-responsive; keyboard-navigable; on-brand error/empty states.
- [ ] TypeScript strict passes; no `@clerk/*` imports outside `services/auth`.

---

## Verification (end-to-end)

1. **Static (sandbox):** `npm run build` / `tsc` / `npm run lint` / unit tests
   (`*.test.ts` near new service fns) green after each phase.
2. **Phase 1:** preview — `GET /api/admin/prompt-types` authed (200) vs signed-out
   (401); `POST` authed mints a row.
3. **Phase 2:** preview `/admin/settings` — walk the README QA checklist (Add →
   Live+type → inline mint → read-only meta → Edit → Delete). Confirm
   `/admin/prompt-builder` and the Blocks page picker unaffected.
4. **Phase 3:** preview `/platform/settings` as a platform admin — promote a set,
   confirm prior master clears and the Tenant card's **Master** badge moves; verify
   non-admin is redirected/403.
5. **Docs:** update `System Docs/Shared Primitives.md` (new panel under
   "Page-local components" + `System Docs/Pages.md`'s Settings page row);
   new routes under `System Docs/API Routes.md`; `prompt_sets` row in
   `System Docs/Database Schema.md`) and `System Docs/DB_CHANGELOG.md` only
   if Jeff makes further schema changes — documentation is a PR gate
   (CLAUDE.md).

---

## Open items to confirm during build (non-blocking)

- Whether `GET /api/platform/settings/master-prompt` should populate `setByName`/
  `setAt` from `audit_events` now or return them null until a cheap source exists.
- Exact `prompt_sets` column list (confirm `created_at`/`updated_at` present as the
  changelog implies) at first query — if any field is absent, stop and flag, don't
  add it (rule #3).
