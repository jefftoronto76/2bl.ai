# Handoff — Composer prompt sets as a distinct kind

Two features, one idea underneath: **a prompt set belongs to one of two families**, and neither
screen can currently tell you which.

- **Feature A — Platform Settings → Composer Prompt.** An "Add New" action, a picker filtered to
  composer-eligible sets only, and an edit affordance per row that routes to Blocks.
- **Feature B — Blocks screen.** A quiet way to switch which family the screen is focused on,
  and a marker showing when you're in the Composer family.

Prototype: `Combined Admin July 2026.html` → Platform · Settings, and → Prompt Studio · Blocks.
Prototype source: `admin-mantine/platform-settings-screen.js`, `admin-mantine/blocks-screen.js`,
`admin-mantine/data.js`.

---

# Known knowns

Verified by reading `jefftoronto76/2bl.ai@main` (tree `bf764b3c8645`). Facts, not assumptions.

**`is_composer_prompt` already exists — but it is a POINTER, not a kind.**
`prompt_sets.is_composer_prompt` (renamed from `is_master`, per `DB_CHANGELOG.md`) is constrained
so that **exactly one row across all tenants** may be true, backed by the partial unique index
`prompt_sets_single_composer_idx`. `PUT /api/platform/settings/master-prompt` clears the prior row
before setting the new one. It answers *"which single set is live as the Composer Prompt right
now"* — it cannot answer *"which sets are Composer sets."* **This is the crux of the handoff.**
See UK-1.

**The Composer Prompt screen is already built, and is not what the prototype shows.**
`app/(platform)/platform/settings/page.tsx` owns all state and renders
`<CurrentSystemPromptPill/>` + `<MasterPromptPicker/>` + Save/Cancel + a revert `Modal`.
`MasterPromptPicker` is a Mantine **`Select`** with `renderOption`, not the custom
button/dropdown in the prototype. The artifacts here are written against the real `Select`, so
they differ from the prototype in chrome — deliberately.

**The picker is fed by `GET /api/platform/prompt-sets`, unfiltered**, and `MasterPromptOption`
(`types.ts`) carries `id, label, tenantId, tenantName, status, version` — **no kind field**, so
the client could not filter today even if it wanted to.

**The Blocks picker is `PromptSetSelect.tsx`** — a Mantine `Menu` with a search `TextInput` above
6 sets, driven by `?set=` via `router.push`. Switching sets deliberately **strips all other query
params** ("start clean"). Data comes from `getPromptSets(tenantId)`, reading the
`prompt_sets_with_compile_meta` view and selecting
`id, label, version, status, prompt_type_id, last_compiled_at, compiled_version` — **no kind
field either**.

**`resolveActiveSet(sets, requestedId)`** exists in `promptSets.ts` and falls back to the Live
set, then the first set, then null. Family-aware resolution has to go through it.

**Prompt *types* are a separate, already-solved taxonomy.** `prompt_types` + the
`prompt_type_tenants` join table, with `is_platform` marking platform-shared types. **Not the same
axis as the family** — a type says *where a live set is wired in* (base / sales / onboarding /
editor); the family says *whose assistant it builds*. Don't overload it (UK-1 option D).

**The publish release note shipped.** `compile.ts` now takes a required `note` and archives the
prior version's note into `compiled_prompts_history`. Nothing here touches it.

---

# Known unknowns

Decisions for engineering. I could not settle these from the repo and have not assumed an answer
in the artifacts — each is marked at its point of use.

### UK-1 · What carries the family? **(blocking — everything else depends on it)**
`is_composer_prompt` is a singleton pointer and cannot be reused. The prototype invents a per-set
boolean (`composer_prompt` in `data.js`) purely to make the screens work. The real shape is
your call:

| Option | Shape | Trade-off |
| --- | --- | --- |
| **A. New column** | `prompt_sets.kind text NOT NULL DEFAULT 'tenant'` — `'tenant'` / `'composer'` | Explicit, indexable, room for a third family. Migration + backfill. |
| **B. New boolean** | `prompt_sets.is_composer_set boolean DEFAULT false` | Smallest migration; reads badly beside `is_composer_prompt` — two near-identical names meaning different things is a trap. |
| **C. Derive from tenant** | composer sets are those owned by the SBL platform tenant | No migration. Breaks the moment a composer set must live under another tenant — **confirm that's never true before choosing this.** |
| **D. Derive from prompt type** | a reserved `prompt_types` row (key `composer`) | Reuses existing taxonomy; conflates two axes. |

I lean **A** — `kind` reads correctly next to `is_composer_prompt` ("this set is *of kind*
composer; this *one* set is *currently* the composer prompt") and survives a third family. **The
migration cost and the option-C question are yours, not mine.**

Every `TODO(UK-1)` in the two `.tsx` files marks a line that changes with this decision.

### UK-2 · Can a tenant admin see composer sets at all?
Feature B's switch is on the **tenant** Blocks screen (`app/admin/prompt-studio/blocks`), which is
tenant-scoped. If composer sets live under SBL, a normal tenant admin has none and the switch
shouldn't render (the artifact hides it when either family is empty). If composer sets can be
tenant-owned, it's a permissions question: **should a tenant admin be able to edit the prompt that
builds their Composer?** Unanswered.

### UK-3 · Should the family live in the URL?
`PromptSetSelect` navigates by `?set=<id>`, and a set id already implies its family — so
`?family=` is redundant *for the active set*. But the scope you were **browsing** then isn't
restorable on reload or a shared link. The artifact keeps scope in local state (browsing is
transient, picking navigates), which is cheapest and matches the existing "strip params on
switch" posture. Confirm rather than inherit.

### UK-4 · Where does "Add New" post, and what does it default the family to?
The prototype reuses the tenant prompt-set modal minus the Tenant field. In production the create
path is `PATCH /api/platform/prompt-sets` (or `/api/admin/prompt-sets`), and **both explicitly
treat `is_composer_prompt` as server-owned, never written by the client.** A set created from the
Composer Prompt section must come out as composer-family — meaning either a new request field the
server validates against platform-admin role, or a dedicated endpoint. **Not designed here.**
Related: dropping the tenant picker assumes composer sets need no tenant — UK-1 option C again.

### UK-5 · Does the edit route need a cross-tenant Blocks view?
The pencil routes to `/admin/prompt-studio/blocks?set=<id>`. That page resolves sets from
`getPromptSets(tenantId)` — **tenant-scoped**. If the composer set belongs to another tenant,
`resolveActiveSet` won't find the id and silently falls back to the Live set: the user clicks Edit
and lands on the wrong prompt set with no error. **Either the route needs a platform-scoped Blocks
view, or the miss needs to become a visible state.** I have not verified which tenant composer
sets belong to, so I can't tell you whether this bites today.

### UK-6 · "2bl.ai" vs "Composer" is my wording
The switch labels the families **2bl.ai** and **Composer**, with hints "Prompt sets your tenants
ship to their users" / "The prompt that powers the Composer AI itself." If product has settled
names (`tenant`? `product`? `platform`?), those win — the labels are one constant
(`SET_FAMILIES`).

### UK-7 · Not verified: nothing else renders these two components
I changed the props of both `MasterPromptPicker` and `PromptSetSelect`. Each search showed a
single call site (`page.tsx`, `blocks/page.tsx`), **but the repo search reported partial
coverage.** Verify before merge.

---

# Feature A · Composer Prompt section

Three changes to a screen that otherwise stays exactly as it is — same Accordion, same pill, same
Save/Cancel, same revert modal.

| Change | Detail |
| --- | --- |
| **Add New** | Green `Button` + `IconPlus`, `size="sm"` — the same treatment as Tenant Prompts' Add New, beside "Revert to fallback". Opens the create modal **without the Tenant field**. On create the set becomes the *pending* selection — you still press Save to make it live. |
| **Picker filtered** | Only composer-family sets are listed. Today it lists every set in every tenant, which is why choosing one is guesswork. |
| **Edit per row** | A pencil `ActionIcon` (tooltip "Edit blocks") routes to Blocks with that set selected — no trip through Prompt Studio to find it. |

Layout note worth keeping: in the prototype these rows squeezed their own badges once the pencil
was added. The fix is `flexShrink: 0` on every right-hand item and `truncate` on the label —
Mantine's `renderOption` has the same failure mode, so the artifact carries it.

# Feature B · Blocks family switch

Deliberately quiet — most sessions never leave the tenant family, so this is **not** screen chrome.

| Change | Detail |
| --- | --- |
| **Scope switch** | A two-item segmented row at the top of the existing dropdown: **2bl.ai** / **Composer**, with a one-line hint. Opens on the family you're already in. Browsing the other family **does not change the screen** until you pick a set. |
| **Composer chip** | A small gray "Composer" chip before the set name on the trigger, for composer-family sets only. Tenant sets show nothing — the common case stays unmarked. |
| **Empty family** | If either family is empty the switch doesn't render (UK-2). |

---

# Files

| File | What |
| --- | --- |
| `MasterPromptPicker.tsx` | Production artifact — filtered options + per-row edit. Drops into `app/(platform)/platform/settings/`. |
| `PromptSetSelect.tsx` | Production artifact — family switch + chip. Drops into `app/admin/prompt-studio/blocks/`. |
| `DIFF.md` | Every hunk, plus `page.tsx` / `types.ts` / `getPromptSets.ts` wiring, the backend hook points, and a migration sketch. |

Both artifacts read the family through a single helper per file (`familyOf` / `isComposerSet`) so
UK-1 lands in one place instead of scattered through JSX.
