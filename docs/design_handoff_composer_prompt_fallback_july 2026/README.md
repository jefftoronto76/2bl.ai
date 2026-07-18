# Handoff: Composer Prompt fallback + nested Tenant Prompts

## Overview
Two related changes to **Platform → Settings**:

1. **Fallback visibility + revert.** When no composed prompt set is live as the platform's
   Composer Prompt, production silently falls back to the default prompt built into the app.
   Today the admin UI can't tell the difference. This adds an explicit "Using system fallback"
   state to the Composer Prompt pill, and a **Revert to fallback** action that intentionally
   turns off the current composed prompt (sets the master pointer to `null`) so a bad prompt
   set can be pulled from production without picking a replacement first.
2. **Nested Tenant Prompts.** The "Tenant Prompts" list (every prompt set, across every tenant)
   is now a collapsible tree — one row per tenant, closed by default, expand to see that
   tenant's sets. Search still filters and auto-expands matching tenants. Replaces the old flat
   "header + list, repeated per tenant" layout.
   - "Add New" stays **top-level** (not nested per tenant) with a required **Tenant** picker as
     the first field — matches the existing pattern in `TenantPrompts.tsx`'s `EditCard`, just
     newly documented here since the surrounding list changed shape.

## About the design files
HTML/JS design references — a working prototype (Mantine, same tokens as production), not
drop-in code. Recreate in the real TSX using the same components already in
`components/admin/settings/PromptSetCard.tsx` etc.

## Fidelity
High-fidelity for copy, states, and interaction. Low-fidelity for the revert confirmation
modal wording — adjust to house style if needed.

## Files in this bundle
- `Composer Prompt Fallback - Diff Handover.html` — unified diffs against the real production
  TSX (`app/(platform)/platform/settings/*`).
- `Platform Settings.html`, `promptset.js` — the prototype source with the change already
  applied (mounted at `/platform/settings` in the admin-mantine harness).

## Where it lives in the prototype project
- `admin-mantine/Platform Settings.html` (Composer Prompt panel + revert modal)
- `admin-mantine/promptset.js` — shared `PromptSetList`/`PromptSetModal` (nested tree + Tenant
  field on new-set modal). Also used by tenant-level Settings → Prompt Sets, which is
  single-tenant and unaffected by the nesting change.

## Production port checklist
- [ ] `types.ts` — no shape change; `MasterPromptSetting.promptSetId` is already nullable.
- [ ] `MasterPromptPicker.tsx` — restyle the `!set` branch of `CurrentSystemPromptPill` as a
      neutral "Fallback" pill instead of plain dimmed text.
- [ ] `page.tsx` — add a `revert()` handler (`PUT .../master-prompt` with `promptSetId: null`)
      and a confirm `Modal`, wired to a new "Revert to fallback" button next to the pill.
- [ ] `TenantPrompts.tsx` — replace the flat per-tenant header+list with a collapsible section
      (chevron + count, closed by default, indented panel). Auto-expand on search match and
      after creating a new set in that tenant (scroll it into view).
- [ ] Verify: reverting flips the pill to "Using system fallback" immediately, disables the
      Revert button while already on fallback, and picking + saving a new set clears fallback.
