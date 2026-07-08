# Handoff: Blocks — "Compile & Publish" becomes a two-stage review flow

## Overview
On the Blocks screen (`/admin/prompt-studio/blocks`) the **Compile & Publish** button used
to publish immediately (a single click fired a "Prompt published" toast). Publishing the
master prompt with no chance to see what will ship is risky.

This change makes it a **two-stage operation**:

1. **Compile** — clicking **Compile & Publish** assembles the selected set's **active**
   blocks into the raw master prompt (grouped in compile order) and opens a review modal in
   a brief "Compiling…" state.
2. **Review** — the modal shows the compiled prompt **read-only and scrollable**, with a
   `will publish as vN · N tokens · N lines` meta line and four actions:
   - **Copy** — copies the raw prompt to the clipboard
   - **Download** — saves it as `{set}-vN.txt`
   - **Cancel** — dismisses without publishing
   - **Publish** — the only path that actually publishes (fires the version bump)

Nothing is published until the reviewer explicitly clicks **Publish**.

## Fidelity
**High-fidelity.** Built on the shipped Mantine theme + tokens (`var(--mantine-*)`,
`blockTint`, brand accent). The modal reuses the same mono-preview idiom as the existing
`CompiledPromptModal.tsx` / `PromptPreview.tsx`. Recreate pixel-for-pixel.

---

## What actually changes vs the page on `main`
Small and contained — one new component, five wiring edits, no schema change.

| Area | Before | After |
|---|---|---|
| Compile & Publish button | one click → publishes + toast | one click → **compile → review modal** |
| Publish | implicit, no preview | explicit **Publish** button inside the review modal |
| Compiled prompt preview | none at publish time | scrollable raw-prompt viewer with token/line meta |
| Export | none | **Copy** + **Download** (`{set}-vN.txt`) from the modal |
| Data model | — | **unchanged** (compiles from the active blocks already in state) |

### Relationship to `CompiledPromptModal.tsx` (the other compile modal)
They are **different modals, both kept**:
- `CompiledPromptModal.tsx` (existing) — views the **already-published** compiled output for
  a set (read-only, fetched from the compiled endpoint). *Post*-publish.
- `CompilePublishModal.tsx` (this handoff) — the **pre-publish gate**: shows what a compile
  *would* produce from the current active blocks and offers Publish. *Pre*-publish.

---

## The compile
`compilePrompt(activeBlocks)` (exported from `CompilePublishModal.tsx`) mirrors the compile
pipeline: sections in `BLOCK_TYPE_COMPILE_ORDER`
(**guardrail → identity → process → knowledge → escalation**), blocks ordered within a type,
a plain `# Heading` per non-empty section. Output matches `MASTER_PROMPT_CONTENT`'s shape.

It runs **client-side** so reviewers get an instant, exact preview. If your compile is
authoritative server-side, POST to it on open and render the response instead — the modal's
props don't change (see the component header + wiring doc §"Backend hook points").

---

## Interactions & Behavior
- **Compile & Publish** → `onCompile`: compiles, opens the modal, shows a `Loader` for ~800ms
  (stand-in for the compile request), then reveals the reviewer.
- **Copy** → clipboard, button flips to "Copied" for 2s (`IconClipboard` → `IconCheck`).
- **Download** → `Blob` → `{set.value}-v{version}.txt`, plus a "Downloaded" toast.
- **Cancel** / overlay / Esc → closes, nothing published.
- **Publish** → closes + fires the publish (currently `notify(...)`; wire to your endpoint).
- Modal is `centered size="xl"`, overlay `opacity 0.55 / blur 2`; body scrolls at `46vh`.

## State (added to the Blocks page component)
`compileOpen: boolean`, `compiling: boolean`, `compiledText: string`, and derived
`nextVersion = MASTER_PROMPT_VERSION + 1`. The button handler prop on `Overview` is renamed
`onPublish` → `onCompile`; a new `onPublish` fires from the modal.

## Design tokens
All already in the theme: brand accent `var(--mantine-color-brand-6)` (badge, Publish button,
ThemeIcon); neutrals `var(--mantine-color-gray-{0,3})`; radii `--mantine-radius-md`; mono
`--mantine-font-family-monospace` for the prompt body + meta.

## Assets
None. New icons (all `@tabler/icons-react`): `IconFileText`, `IconDownload`, `IconRocket`
(plus `IconClipboard` / `IconCheck` already used elsewhere on the page).

---

## Files in this bundle
- **`CompilePublishModal.tsx`** — the production artifact. Drop into
  `components/admin/prompt-studio/`. Exports `CompilePublishModal` (the modal) and
  `compilePrompt` (the compile helper). Reads `lib/{badges,primitives,types}` unchanged.
- **`blocks-page.wiring.md`** — the five edits to
  `app/admin/prompt-studio/blocks/page.tsx` (imports, `Overview` prop rename, compile state,
  handlers, mount the modal). Includes backend hook points.
- **`combined-blocks-screen.js`** — the htm/CDN **prototype** the flow was built and verified
  in (the in-project `admin-mantine/` Blocks screen, wired into `Combined Admin July 2026.html`).
  Reference only; `compilePrompt`, `CompilePublishModal`, and the `onCompile`/`onPublish`
  wiring here are the 1:1 source for the TSX. **To see the two states live:** open
  `Combined Admin July 2026.html`, go to Prompt Studio → Blocks, and click **Compile & Publish**
  — a ~0.8s "Compiling…" loader (stage 1) gives way to the review modal (stage 2).

## One-line rule (per CLAUDE.md)
Mantine is canonical. Port `CompilePublishModal.tsx` + the wiring into
`Rebuild_admin-tsx_HD/` and keep `admin-mantine/` (incl. `Combined Admin`) in step. The
prototype in this bundle already matches.
