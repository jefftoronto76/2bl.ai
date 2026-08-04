# Appearance Change History — handoff bundle

Drop-in for the **Settings › Appearance** audit trail. Extract at the repo root; the two trees
land where they belong:

```
docs/
  appearance-history.md                  ← the handover doc

app/admin/settings/
  AppearanceHistory.tsx                  ← the list component  (client)
  AppearanceDiff.tsx                     ← before/after value renderer (client)
  getAppearanceHistory.ts                ← audit-log reader     (server-only)
  derivePaperStack.ts                    ← paper-effect derivation (see docs §1b)
  types.ts                               ← AppearanceChange, AppearanceChangeKind
  utils.ts                               ← formatAuditTime
```

If your docs live elsewhere, move `docs/appearance-history.md` wherever you keep handovers — it has
no code dependencies.

## To finish wiring (two edits — see the handover §2)

1. Load the history in the Settings **server** page and pass it down:
   `const appearanceHistory = await getAppearanceHistory(tenantId);`
2. Render at the end of `Appearance.tsx`, below the editor grid:
   `<AppearanceHistory log={appearanceHistory} />`

The one dependency: the Appearance **Save** handler must emit one `audit_events` row per changed
field (same transaction as the settings write) for this list to populate. Details + open decisions
are in `docs/appearance-history.md`.

Also included: **`derivePaperStack.ts`** + a new **`paper_effect`** toggle — the storefront's warm
"paper" look is now derived from the single `background` token and can be switched off (flat). See
`docs/appearance-history.md` §1b for the storefront wiring.

Built against Mantine v7 + the existing `@/components/admin` and `@/services/auth` modules — verify
import paths and the Supabase select against your schema.
