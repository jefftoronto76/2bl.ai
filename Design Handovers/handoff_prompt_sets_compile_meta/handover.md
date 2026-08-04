# Handover — Prompt Sets: Platform listing, richer create, compile metadata

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
all prompt sets in the database, grouped by tenant, searchable, each with the same
enriched card + a "view compiled prompt" action. It's the read/observability
counterpart to the Master Prompt write surface.

- **New:** `platform-settings/TenantPrompts.tsx` → `app/(platform)/platform/settings/TenantPrompts.tsx`
- **Edit:** `platform-settings/page.tsx.section.md` — adds the import + one `<Card>`.
- **Extend:** `api/platform/prompt-sets/route.ts` → replaces the lightweight list with
  the full row + compile metadata (the Master Prompt picker still works — its
  `MasterPromptOption` is a subset of the richer row).
- **New:** `api/platform/prompt-sets/[id]/compiled/route.ts` — cross-tenant compiled fetch.

### 2 — "Create new" prompt set captures Name + Type + Description
Two create surfaces, brought in line so a set is well-formed at creation:

- **Tenant Settings → Prompt Sets** (`app/admin/settings/PromptSets.tsx`): the **Type**
  ("Used as") control now renders for **drafts too** (was Live-only), so a type can be
  set at Add-New. Still *required* only when Live.
- **Composer** (`app/admin/prompt-builder/page.tsx` + `…/PromptSetPicker.tsx`): the inline
  "New prompt set…" affordance grows from a name field into **Name / Type / Description**.
- **API:** PATCH `/api/admin/prompt-sets` stops nulling a draft's `prompt_type_id`
  (still required for Live). One-line change — see `api/admin/prompt-sets/route.GET-PATCH.md`.

### 3 — Prompt-set cards show compile metadata + a stale warning
Every prompt-set card (tenant **and** platform) gains four read-only data points and a
"view compiled prompt" button:

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
| `shared/CompiledPromptModal.tsx` | `components/admin/settings/CompiledPromptModal.tsx` | NEW — the compiled-prompt viewer |
| `tenant-settings/PromptSets.tsx` | `app/admin/settings/PromptSets.tsx` | REPLACE — enhanced (search `// NEW:`) |
| `platform-settings/TenantPrompts.tsx` | `app/(platform)/platform/settings/TenantPrompts.tsx` | NEW — the platform listing |
| `platform-settings/page.tsx.section.md` | `app/(platform)/platform/settings/page.tsx` | EDIT — import + one card |
| `composer/PromptSetPicker.create.md` | `app/admin/prompt-builder/page.tsx` + `components/admin/prompt-builder/PromptSetPicker.tsx` (+ `.module.css`) | EDIT — 3-field create |
| `api/admin/prompt-sets/route.GET-PATCH.md` | `app/api/admin/prompt-sets/route.ts` | EDIT — view-read GET + draft-type PATCH |
| `api/admin/prompt-sets/[id]/compiled/route.ts` | `app/api/admin/prompt-sets/[id]/compiled/route.ts` | NEW — tenant compiled fetch |
| `api/platform/prompt-sets/route.ts` | `app/api/platform/prompt-sets/route.ts` | REPLACE — full rows + meta |
| `api/platform/prompt-sets/[id]/compiled/route.ts` | `app/api/platform/prompt-sets/[id]/compiled/route.ts` | NEW — platform compiled fetch |
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
  per `prompt-schema-design.md`). We read `content / version / updated_at` from it —
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

- **Platform Tenant Prompts is read-only** (list + view compiled). Create/edit/delete
  stay on the tenant surface; the Master Prompt picker owns `is_composer_prompt`. If you
  want platform-wide CRUD, lift `PromptSetEditCard` out of `PromptSets.tsx` into a shared
  module and reuse it — the platform card was deliberately kept presentational to avoid a
  second write path.
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
      label/description/tenant; cards match the tenant look.
- [ ] **Master Prompt picker** still loads and saves (back-compat with the extended list route).
- [ ] No client write of `version` / `is_composer_prompt` / `is_default` / compile fields.
