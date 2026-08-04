# Handover (V2) — Prompt Sets: Platform listing, richer create, compile metadata

> **V2 supersedes the first handoff.** It corrects the Platform → Tenant Prompts surface
> to full parity with the approved prototype (shared card, full meta strip, Add New, and
> Open in Composer / View / Edit / Delete) and fixes the doubled intro line. Use this in
> place of the earlier package.


**Date:** 2026-06-26
**Prototype source of truth:** `Combined Admin - Production.html` → Admin · Composer,
Admin · Settings → *Prompt Sets*, and Platform · Settings → *Tenant Prompts*.
**Target app:** `jefftoronto76/2bl.ai` @ `main` — Next.js App Router · Mantine v7 ·
TypeScript · Supabase.

This package turns three approved prototype changes into production-shaped drop-ins
for the real app. The `.tsx`/`.ts`/`.sql` files are written to the repo's existing
conventions (the `Text` primitive, `@tabler/icons-react`, `getAuthContext` /
`getAdminClient`, `notifications`). The `.md` files are surgical diffs for files too
large or too shared to ship whole. **Nothing auto-saves; nothing writes server-owned
fields.** Wire to your real session/tenancy helpers and review before merge.

---

## What changed (and where it lands in the repo)

### 1 — Platform Settings now lists every prompt set, across all tenants
The platform Settings page (`app/(platform)/platform/settings/page.tsx`) shipped with
a single card — the **Master Prompt** picker. We add a second card, **Tenant Prompts**:
all prompt sets in the database, grouped by tenant, searchable, with **full parity** to
the tenant cards — **Add New**, and per-card **Open in Composer · View compiled · Edit ·
Delete** — plus the full meta strip. (Earlier this surface was speced read-only/slim; that
was wrong vs the approved prototype and is corrected here.)

- **New:** `platform-settings/TenantPrompts.tsx` → `app/(platform)/platform/settings/TenantPrompts.tsx`
- **Edit:** `platform-settings/page.tsx.section.md` — import + ONE `<Card>` with Title only
  (the component owns its single intro line — do not add a Card subtitle, that caused the
  doubled-paragraph bug).
- **Extend:** `api/platform/prompt-sets/route.ts` → full row + compile metadata on GET,
  plus a cross-tenant **PATCH** upsert (the Master Prompt picker still works — its
  `MasterPromptOption` is a subset of the richer row).
- **New:** `api/platform/prompt-sets/[id]/route.ts` (cross-tenant DELETE),
  `api/platform/prompt-sets/[id]/compiled/route.ts` (compiled fetch),
  `api/platform/prompt-types/route.ts` (per-tenant types for the Add-New/Edit card).

### 2 — "Create new" prompt set captures Name + Type + Description
Two create surfaces, brought in line so a set is well-formed at creation:

- **Tenant Settings → Prompt Sets** (`app/admin/settings/PromptSets.tsx`): the **Type**
  control now renders for **drafts too** (was Live-only), so a type can be set at Add-New.
  Still *required* only when Live.
- **Composer** (`app/admin/prompt-builder/page.tsx` + `…/PromptSetPicker.tsx`): the inline
  "New prompt set…" affordance grows from a name field into **Name / Type / Description**.
- **API:** PATCH `/api/admin/prompt-sets` stops nulling a draft's `prompt_type_id`
  (still required for Live). One-line change — see `api/admin/prompt-sets/route.GET-PATCH.md`.

### 3 — Prompt-set cards show compile metadata + a stale warning
Both surfaces render the SAME card — `shared/PromptSetCard.tsx` (`PromptSetViewCard` +
`PromptSetMetaStrip` + badges) — so they can't drift again. Every card gains four read-only
data points and a "view compiled prompt" button:

- **Blocks** — active block count in the set
- **Last compiled** — when its compiled prompt was last written
- **Compiled version** — the version the compile pipeline stamped
- **Stale** — a badge + alert when `updated_at > last_compiled_at` (edited since last compile)
- **View compiled prompt** — an eye button opening a modal with the authoritative
  compiled output (read-only, copy to clipboard)

These are **derived, never stored** — see §5.

---

## File manifest → drop locations

| Bundle path | Drop at | Kind |
|---|---|---|
| `shared/promptSet.ts` | `lib/promptSet.ts` | NEW — shared types + `isStale`/`formatDate` |
| `shared/PromptSetCard.tsx` | `components/admin/settings/PromptSetCard.tsx` | NEW — the shared card (view card, meta strip, badges) used by BOTH surfaces |
| `shared/CompiledPromptModal.tsx` | `components/admin/settings/CompiledPromptModal.tsx` | NEW — the compiled-prompt viewer |
| `tenant-settings/PromptSets.tsx` | `app/admin/settings/PromptSets.tsx` | REPLACE — uses the shared card; Type-on-create; Open in Composer |
| `platform-settings/TenantPrompts.tsx` | `app/(platform)/platform/settings/TenantPrompts.tsx` | NEW — full-parity listing (Add New, CRUD, Open in Composer) |
| `platform-settings/page.tsx.section.md` | `app/(platform)/platform/settings/page.tsx` | EDIT — import + one card (Title only) |
| `composer/PromptSetPicker.create.md` | `app/admin/prompt-builder/page.tsx` + `components/admin/prompt-builder/PromptSetPicker.tsx` (+ `.module.css`) | EDIT — 3-field create |
| `composer/open-in-composer.md` | `app/admin/prompt-builder/page.tsx` | EDIT — read `?promptSet=` to preselect |
| `api/admin/prompt-sets/route.GET-PATCH.md` | `app/api/admin/prompt-sets/route.ts` | EDIT — view-read GET + draft-type PATCH |
| `api/admin/prompt-sets/[id]/compiled/route.ts` | `app/api/admin/prompt-sets/[id]/compiled/route.ts` | NEW — tenant compiled fetch |
| `api/platform/prompt-sets/route.ts` | `app/api/platform/prompt-sets/route.ts` | REPLACE — full rows + meta GET + cross-tenant PATCH |
| `api/platform/prompt-sets/[id]/route.ts` | `app/api/platform/prompt-sets/[id]/route.ts` | NEW — cross-tenant DELETE |
| `api/platform/prompt-sets/[id]/compiled/route.ts` | `app/api/platform/prompt-sets/[id]/compiled/route.ts` | NEW — platform compiled fetch |
| `api/platform/prompt-types/route.ts` | `app/api/platform/prompt-types/route.ts` | NEW — per-tenant types for the platform Edit card |
| `db/0002_prompt_set_compile_meta.sql` | your migrations dir | NEW — the `prompt_sets_with_compile_meta` view |

> `lib/promptSet.ts` import path: the drop-ins import `@/lib/promptSet`. If your repo
> keeps shared types elsewhere (e.g. `app/admin/settings/types.ts`), move the file and
> update the three imports accordingly.

---

## Data model — what we relied on (from the real repo)

The shipping `prompt_sets` row (per `app/api/admin/prompt-sets/route.ts`) is:
`id, tenant_id, label, description, status('live'|'draft'), is_composer_prompt,
is_default, prompt_type_id (FK → prompt_types), version, created_at, updated_at`.

- **Type = `prompt_type_id`** (a FK), surfaced via `/api/admin/prompt-types` (GET list /
  POST mint). The prototype's free-text "usage_type" maps to this FK — the drop-in uses
  the real FK + the existing "＋ New type…" mint flow, so no terminology drift.
- **`version`** auto-increments on compile; read-only in the UI. Unchanged.
- **Compiled output** lives in `master_prompt` (mid-rename to `compiled_prompts`,
  per `Backlog/prompt-schema-design.md`). We read `content / version / updated_at` from it —
  the same source `PromptPreview.tsx` already uses.

---

## §5 — Compile metadata is derived, not stored (important)

`block_count`, `last_compiled_at`, `compiled_version` are **computed in a view**
(`prompt_sets_with_compile_meta`), not new columns. Block count comes from `blocks`;
last-compiled/version come from the compiled-prompt table. The view keeps the GET a
single SELECT and means the numbers can't drift. A denormalized-column alternative is
included (commented) in the migration if you later need to index/sort on them.

**Open question (blocks accurate values):** the compiled-prompt table is mid-migration
from **one row per tenant** → **one row per prompt set**. The current
`app/admin/prompt-studio/prompt/page.tsx` reads `master_prompt` with `.limit(1)` per
tenant (no `prompt_set_id`). The view + both `/compiled` routes assume the **per-set**
shape (join/filter on `prompt_set_id`). If your data is still per-tenant, every set will
read "Never compiled" until that migration lands — or temporarily key the `mp` lateral
and the `/compiled` queries on `tenant_id`. Confirm before shipping the numbers.

---

## §6 — Scope decisions / open questions

- **Platform Tenant Prompts has full CRUD** (matches the approved prototype): Add New,
  Edit, Delete, View compiled, Open in Composer. This means a **cross-tenant write path**
  on the platform side — `PATCH`/`DELETE /api/platform/prompt-sets` accept/act on any
  tenant's row (an insert carries an explicit `tenant_id`), and `GET
  /api/platform/prompt-types?tenant_id=` feeds the per-tenant Type select. These are
  platform-admin-gated; **confirm RLS + audit coverage** before enabling writes in prod.
  If you'd rather keep platform observe-only, pass only `onView` to `PromptSetViewCard`
  there and skip the platform PATCH/DELETE routes — the shared card degrades cleanly.
- **Open in Composer** deep-links `/admin/prompt-builder?promptSet=<id>`; the Composer
  reads the param to preselect (see `composer/open-in-composer.md`). Cross-tenant caveat:
  gate the button to own-tenant sets if the Composer is session-tenant-scoped.
- **"Composer" vs "Master" naming.** The repo column is `is_composer_prompt`; the
  prototype/older handoffs say "Master". Drop-ins use `is_composer_prompt` to match the
  DB. The platform *Master Prompt* picker is the thing that sets it.
- **Stale source.** "Stale" compares `prompt_sets.updated_at` to `last_compiled_at`.
  Editing a set's *blocks* must touch `prompt_sets.updated_at` for staleness to fire on
  block edits (today the `touch_updated_at` trigger only fires on `prompt_sets` updates).
  If block edits should mark the parent set stale, add a trigger on `blocks` that bumps
  the parent's `updated_at`. Confirm desired behavior.

---

## §7 — QA checklist

- [ ] **Tenant · Add New:** Type select shows for a *Draft* (not just Live); can pick or
      mint a type; Create persists it. Live still *requires* a type.
- [ ] **Tenant card:** Blocks / Last compiled / Compiled version render; Stale badge +
      alert appear only when `updated_at > last_compiled_at`.
- [ ] **View compiled prompt** (tenant + platform): modal fetches and shows content,
      Copy works, never-compiled shows the empty-state, stale shows the alert.
- [ ] **Composer:** "New prompt set…" captures Name + Type + Description; POST creates a
      Draft v1 with the type; it becomes the active set.
- [ ] **Platform · Tenant Prompts:** lists all sets grouped by tenant; search filters by
      label/description/tenant; cards are **identical** to the tenant card (same actions +
      full meta strip), with exactly ONE intro line (no doubled paragraph).
- [ ] **Platform · Tenant Prompts CRUD:** Add New (with Tenant picker) creates; Edit saves;
      Delete confirms + removes; Open in Composer deep-links with the set preselected.
- [ ] **Master Prompt picker** still loads and saves (back-compat with the extended list route).
- [ ] No client write of `version` / `is_composer_prompt` / `is_default` / compile fields.
