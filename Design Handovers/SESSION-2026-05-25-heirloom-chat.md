# Session Summary — Heirloom Chat Migration (2026-05-25)

Working session on **2bl.ai**. Brought Heirloom's chat onto the platform,
synced docs, shipped a routing hotfix, and diagnosed the live `/api/sage`
failure. Shareable handoff for the coding partner.

---

## What shipped

### 1. Commit 3 — Heirloom chat UI + live streaming
Ported the full chat surface from the legacy Vite repo (`LJ_Legacy26`) into
`app/heirloom/`:

- **`components/chat/`** — `ChatHero`, `ChatHeader`, `ChatInput`, `MessageList`,
  `Sidebar`. Full layout preserved: collapsible sidebar, header, message list,
  input.
- **`components/ui/`** — `Avatar`, `IconButton`, `Button`.
- **Removed/replaced:** `ComingSoonOverlay` gone; empty state → "What's a story
  worth keeping?"; fake identity (JE / John E. / email) removed; mock Recent
  list emptied; AudioWaveform icon → send arrow; AI disclaimer removed.
- **Real streaming:** `sendMessage` in the Heirloom store + a Heirloom-local
  reader `app/heirloom/lib/stream.ts` POSTing to `/api/sage`. Deliberately does
  **not** import `src/lib/sage.ts` / `stream.ts` — the two chat clients stay
  decoupled; the wire format (Vercel AI SDK data stream) is the only shared
  contract. `session_id` is null for now.
- **`page.tsx`** is now the app root: `ChatProvider` + slide-in panel + backdrop,
  Escape / backdrop-click to close.
- `tsc` clean, `next build` passing. One commit.

### 2. Documentation sync (one commit per file)
- **CLAUDE.md** — Heirloom routing, `x-heirloom` middleware signal, design
  tokens, chat components.
- **Backlog/SERVICEMIGRATION.md** — marked Heirloom landing + chat complete; next step
  is the memory-creation flow.
- **README.md** — Heirloom route, `x-heirloom` brand signal, chat section.
- **System Docs/2BL.md** — Heirloom product status updated.
- **Backlog/MIGRATION.md** — corrected the stale "Heirloom — nothing exists" line.

### 3. PR #28 — merged to `main`
Bundled the full `heirloom-migration` branch (10 commits, 34 files) with a
three-section description, merged to `main`.

### 4. Hotfix PR #29 — merged to `main`
`middleware.ts` was rewriting `heirloom.2bl.ai/api/sage` → `/heirloom/api/sage`
(404). Added an `isApiPath` guard to the Heirloom host block so `/api/*` passes
through on the original host — mirrors the SBL block's `/api/platform`
exclusion. `tsc` + build verified. Clean hotfix branch → PR → merged.

### 5. Backlog/BACKLOG.md — "Prompt Contradiction Detection"
Added a backlog entry: cross-block semantic contradiction detection during the
save-time safety check (passes the full compiled prompt to Claude to flag
conflicting instruction pairs). Feeds the existing `safety_check_result` jsonb
field; no schema change. Pushed to `main`.

---

## Diagnosis: live `/api/sage` failure

Symptom: chat panel opened but `/api/sage` returned "Something went wrong
reaching your story guide." Traced the chat service end to end.

- The null-tenant and missing-`master_prompt` paths both fall back **safely**
  (`DEFAULT_SYSTEM_PROMPT` + Anthropic defaults) — not the cause.
- **Root causes were two:**
  1. **Routing** — `heirloom.2bl.ai/api/sage` rewritten to `/heirloom/api/sage`
     (404). Fixed by hotfix #29.
  2. **Tenant resolution** — the Heirloom tenant had no `domain`, so
     `heirloom.2bl.ai` fell back via the `2bl.ai` root domain to the *platform*
     tenant. The 502 most likely came from that tenant's `tenant_model_config`
     pinning an unwired provider (`getModelInstance` throws on `openai`).
- **Tenant domain fixed** (set to `heirloom.2bl.ai`). With the hotfix +
  domain set, resolution now correctly picks the Heirloom tenant.

---

## Open items / follow-ups

- **Heirloom answers as Sage** until a Heirloom-specific `master_prompt` is
  configured (needs prompt content + a Supabase Studio insert).
- **Runtime smoke test** of the Heirloom chat on the live/preview deploy still
  pending — verify it streams cleanly now that routing + tenant resolution are
  fixed.
- **Code hardening (optional):** make `getModelInstance`
  (`services/chat/server/stream.ts`) degrade gracefully for unwired providers
  instead of throwing a 502.
- **2bl.ai favicon (report only, not fixed):** metadata is wired and files
  exist/are tracked, but a legacy root-level `app/favicon.ico` (Next.js
  special-file convention) is served at `/favicon.ico` site-wide and overrides
  the per-brand 2BL favicon. Fix direction: drop/replace the global
  `app/favicon.ico` and let each brand's `metadata.icons` win.

---

## Architecture notes for the partner

- **Brand isolation:** each storefront scopes its design tokens under a
  `[data-brand="…"]` wrapper (`sbl`, `heirloom`), and `middleware.ts` tags
  requests with `x-sbl` / `x-heirloom` so the root layout drops the inkwell
  palette for those brands. Host → route resolution lives entirely in
  middleware.
- **Chat service:** `app/api/sage` is a thin HTTP adapter over
  `services/chat/server` (`streamChat`). Tenant is resolved from the host;
  prompt/model/booking all fall back to safe defaults. Wire format is frozen.
- **Heirloom decoupling:** Heirloom carries its own store + stream reader under
  `app/heirloom/` rather than reusing the Sage client, by design.
