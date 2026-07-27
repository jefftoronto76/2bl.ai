# Handoff — Compile & Publish release note (July 2026)

A third step in the Blocks screen's **Compile & Publish** modal: after reviewing the compiled
prompt, the publisher writes a short release note before it goes live.

## Why

Publishing a compiled prompt is a deploy. Today it leaves no trace of intent — the version
number increments and that's the whole record. The next person to look at v8 and ask "what
changed and why" has to diff the blocks themselves.

The note applies the same principles as a good PR: a one-line imperative **summary**
(required), an optional **body**, and a **change list the author never types** — it's derived
from blocks edited since the set's `last_compiled_at`.

## The flow

```
Compile & Publish  →  [1] compiling…  →  [2] Review compiled prompt  →  [3] Describe this release  →  published
                                             Copy · Download              Back · Publish v8
                                             Cancel · Publish →           ⌘↵ publishes
```

Same modal throughout — stage 3 swaps the body and the title, no second dialog. **The compile
POST does not fire until the note is submitted**; "Publish" on stage 2 is a step, not the commit.

## Stage 3 anatomy

| Element | Component | Notes |
| --- | --- | --- |
| Change summary panel | `Paper withBorder bg=gray-0` | "CHANGED SINCE v7" + token delta (`+154 tokens · 411 total`) |
| Change chips | `Badge variant="light"` per block | coloured by `TYPE_COLORS[block.type]`; empty state: "No block edits since the last compile — this republishes the same content." |
| Summary | `TextInput` required, `maxLength={72}` | live remaining-char counter in `rightSection`; **pre-filled** from the changed block types ("Update identity, guardrails and knowledge") |
| Why this change | `Textarea` autosize 3–6 | optional |
| Footer | `Back` (subtle) · `Publish v8` (filled, disabled until summary is non-empty) | `⌘↵ to publish` hint at left |

Modal size drops `xl → lg` on stage 3. No other layout, chrome, or button changes.

## Files

| File | What |
| --- | --- |
| `CompilePublishModal.tsx` | **Production artifact.** Drops into `components/admin/prompt-studio/`. Whole file, stage 3 included. |
| `PublishButton.tsx` | **Production artifact.** Drops into `app/admin/prompt-studio/blocks/`. Passes the new props, sends the note. |
| `DIFF.md` | Every hunk, plus the call-site wiring and the one backend hook point. |

The prototype the design was verified in is `admin-mantine/blocks-screen.js`
(`CompilePublishModal`, `changedSince`, `suggestSummary`) — rendered by
`Combined Admin July 2026.html` → Prompt Studio → Blocks.

## Open questions — read these before estimating

**`DIFF.md` §5 has the full list (OQ-1 … OQ-8).** They are not nitpicks; two of them change what
ships. The short version:

| # | Question | Impact |
| --- | --- | --- |
| OQ-1 | `last_compiled_at` isn't on the Blocks page's `PromptSet` (and I did not verify the column exists on `prompt_sets`). Threading it touches 4 files outside the publisher. | **Blocking** — without it the change list shows every active block, not the edited ones |
| OQ-2 | No compiled token count in this data path, so the `+154 tokens` delta has nothing to compare against. | Ship without the delta unless a count is available — never against `0` |
| OQ-3 | Does the server always produce `version + 1`? The modal now labels the pending version before the POST. | If not guaranteed, drop the number from the buttons |
| OQ-4 | Where the note is stored — is a **row per compiled version** retained, or is one row overwritten? | Decides whether a History screen is possible at all |
| OQ-5 | Should blocks *disabled* since the last compile show in the change list? Currently they don't. | Product call; today that case under-reports |
| OQ-6 | Is the tenant Blocks screen the only publish path? | Any other path needs the same note |
| OQ-7 | 72-char summary cap is my design choice, not a repo constraint. | Defer to an existing convention if one exists |
| OQ-8 | `version`'s meaning and `onPublish`'s signature both change; my search for other consumers was bounded/partial. | Verify before merge |

What I did verify in the repo: the call site (`BlocksOverview.tsx`), `TYPE_COLORS` / `BlockType` from `@/services/prompt/block-types`, `BlockRow` carrying `id/title/type/updated_at/status`,
the existing `active` filter, and the preview/compile endpoints' request and response shapes.

### Settled, not open
Summary is **required** (a hotfix exemption would be a deliberate exception). Stage 3 is the
**same modal**. The compile POST fires **only** from stage 3.

## Out of scope

Nothing outside the publish flow changed. No changes to the Blocks table, filters, overview,
Prompt Sets, or Settings.
