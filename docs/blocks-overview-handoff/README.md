# Blocks page — Overview donut + Prompt Sets (handoff bundle)

Drop-in for two additions to **Prompt Studio › Blocks**: (1) a token-distribution **Overview donut**
replacing the bare meter, and (2) a **Current Prompt Set** picker. Extract at the repo root.

```
docs/
  blocks-overview-and-prompt-sets.md      ← the handover doc (read this first)

app/admin/prompt-studio/blocks/
  TokenDonut.tsx                          ← new: SVG token-distribution donut
  BlocksOverview.tsx                      ← new: details grid + legend + donut
  PromptSetSelect.tsx                     ← new: "Current Prompt Set" picker (URL-driven)
  promptSets.ts                           ← new: PromptSet type + resolveActiveSet (shared)
  getPromptSets.ts                        ← new: server-only Supabase reader
  page.tsx                                ← updated: fetch sets, scope blocks, render picker

db/
  2026-06-24_prompt_sets.sql              ← schema sketch (prompt_sets + blocks.prompt_set_id)
```

## One hand-edit (not shipped as a full file)

`BlocksTable.tsx` owns the live block state, so the Overview mounts there. Apply the **three-line
patch in the handover §2a**: import `BlocksOverview`, add an `overview?` prop, and swap
`<SegmentedTokenMeter blocks={activeMeterBlocks} />` for
`<BlocksOverview blocks={items} version={overview?.version} status={overview?.status} />`.

## To finish wiring (handover §3)

1. **Schema** — run `db/2026-06-24_prompt_sets.sql`; backfill one Live set per tenant and stamp
   existing blocks. Ships safely *before* this: with no sets, the picker hides and the page falls
   back to tenant-wide blocks.
2. **Compile/publish must be set-aware** — `/api/admin/prompt/compile` should filter by
   `prompt_set_id`; `NewBlockButton` + duplicate should stamp the active set.
3. **Version/status source** — comes from the active `prompt_sets` row; repoint `getPromptSets` if
   versioning lives in the publish flow.

Built against Mantine v7 and the existing `@/services/prompt/{block-types,tokenize}` and
`@/services/auth` modules — reuses `TYPE_COLORS` / `tokensFor` so the donut, legend, and per-row
badges stay in sync. Verify the Supabase columns against your schema before shipping.
