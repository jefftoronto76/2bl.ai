# Handoff: Blocks — layout parity with the design

## What this fixes
The branch `claude/compile-publish-modal-le6jqt` renders the Blocks screen with a layout
that drifted from the approved design (`Combined Admin · Blocks`). The **Compile & Publish
behavior is correct** — only the chrome is off. Six visual deltas, all in the page shell:

| # | Design (source of truth) | Branch today | Fix | File |
|---|---|---|---|---|
| 1 | Detail rows are **borderless** plain text | Rows sit in a **bordered box with divider lines** (`defGrid`) | Drop `defGrid`; plain 2-col text | `BlocksOverview.tsx` |
| 2 | **Two bordered cards, transparent fill** (same colour as the page) separated by a gap | **One white card** wrapping both columns | Outer `SimpleGrid` → two `Card withBorder` `background:transparent` | `BlocksOverview.tsx` |
| 3 | Search box is **white** (`#fff`) | Search box is **page cream** (`--mantine-color-body`) → blends in | `background: '#fff'` on the FilterBar container | `BlocksFilters.tsx` |
| 4 | **"Hide summary" above the card**, right-aligned, outside it | Pinned **inside** the card (`.hideBtn` absolute top-right) | Render it as a `Group` row above `{children}` | `SummarySection.tsx` |
| 5 | **New block + Compile & Publish inside the summary card** (left column) | Both buttons in a **page header** | Move into `BlocksOverview` left column | `BlocksOverview.tsx` + `page.tsx` |
| 6 | Compile & Publish is **brand terracotta**; no "Blocks" H1 | **Green** button; adds a "Blocks" H1 + subtitle | `color="brand"`; drop the H1/subtitle | `PublishButton.tsx` + `page.tsx` |
| 7 | Status **"Active" toggle is brand terracotta** (theme primary); label is plain text | Toggle + label hardcoded **green** | Switch `color="brand"`; drop the green label colour | `BlockRow.tsx` |

Not touched (the branch is correct here — do **not** revert): the Output Format block type,
the ordinal type badges, and the server-side compile. Those come from
`services/prompt/block-types.ts` and are the current production truth; the `admin-mantine`
design file is the stale one on taxonomy.

## Where things land after the patch (matches the design)
- **Above the cards:** right-aligned **Hide summary** control (outside the card).
- **Left card** (bordered, borderless rows): details grid → guardrail meter →
  **New block + Compile & Publish**.
- **Right card** (bordered): token donut → "Hover a segment…" caption → **type-chip legend**.
- **Filter bar:** white (`#fff`) search pill.

## Files
- `BlocksOverview.tsx` — full replacement. Two `Card withBorder` via an outer `SimpleGrid`;
  borderless detail rows (no `defGrid`); left column holds `NewBlockButton` +
  `PublishButton`; legend moved under the donut in the right card. Accepts
  `topics / activeSetId / activeSetLabel`.
- `SummarySection.tsx` — full replacement. "Hide summary" is a right-aligned `Group` row
  above the card instead of an absolutely-pinned pill. (The `.hideBtn` / `.summaryRel` rules
  in `BlocksLayout.module.css` are now unused — safe to delete, not required.)
- `PublishButton.tsx` — full replacement. `color="brand"` (terracotta) instead of green.
- `BlocksFilters.patch.md` — one line: FilterBar search container `background` → `#fff`.
- `BlockRow.patch.md` — status Switch `color="green"` → `"brand"`; drop the green "Active" label colour.
- `page.tsx.patch.md` — remove the H1/subtitle and the header button `Flex`; forward
  `topics / activeSetId / activeSetLabel` into `BlocksTable`.
- `BlocksTable.patch.md` — accept those three props and pass them to `BlocksOverview`.

Apply all as one commit. After it: Hide-summary sits above two clean bordered cards,
borderless detail rows, a white search pill, buttons in the left card, terracotta
Compile & Publish, and no page H1 — matching the design.
