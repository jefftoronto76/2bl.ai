# Memory Canvas & Photo Actions — Implementation + Testing Plan (plan only)

## Context

`Design Handovers/design_handoff_memory_canvas_08_2026/` (README + `known-unknowns-memory-canvas.md`) specifies a right-hand "memory canvas" panel, photo-specific bookmark/attach/GPS actions, a scroll nudge, and a reshaped card chrome — extending the already-shipped Heirloom Memories feature (manual bookmark, `artifacts` table, `type='memory'`). All seven Known Unknowns are confirmed; this plan turns them into staged, buildable work.

**The handoff's reference `.tsx` files describe a different architecture than what's actually in production.** The handoff was written against an earlier prototype (`chat-widget-canvas.jsx` / `story-canvas-panel.jsx`) that models memories as `running`-pill tool-messages created by a `runMemory()` archivist call, with a `Memory`/`MemoryToolMessage` shape (`storyId`, `photos: Photo[]`, model-generated `passage`). **None of that exists in production.** What's actually shipped (read in full this session):

- `services/crm/memories.ts` / `services/chat/ui/v1/useMemories.ts` — memories are rows in the existing `artifacts` table (`type='memory'`), created with **no model call**: `createMemoryFromAnchor()` reads the anchor message's own stored text verbatim. Keyed by `anchor_message_id` (a stable message id), not array position.
- `components/shells/membership/memory/MemoryCard.tsx` — the four states (`running`/`draft`/`saved`/error) render **inline in the transcript**, below the message they anchor to (`renderMemorySlot()` in `MessageList.tsx`), not as a message role and not in any side panel.
- **No memory canvas / side panel / "story canvas" exists anywhere in production.** `design_handoff_story_canvas_August2026` is an unbuilt mockup. Stories don't exist as a schema (`Known Gaps.md`: "a `stories` schema... created stories are currently ephemeral client state").
- `components/shells/membership/UploadThumbnail.tsx` — the real inline upload renderer — is deliberately minimal ("no separate card, no eyebrow text, no status line, no quick actions, no story chips, no Keep/Discard footer"), replacing an old card family for exactly the reconciliation bugs `design_handoff_memories_August2026` §6 warns about. This is where photo actions attach.
- `media_items.derived_content` is real vision-caption text (Haiku, `services/media/processor.ts`'s `processImage`), already fetched to the client as part of `ClientMediaItem` (`MediaItem & {...}` in `chatStore.tsx`) via the existing `GET /api/media` batch call.

This plan builds the five confirmed items **against the real architecture**, reusing `createDraftMemory`/`useMemories`/`MemoryCard`'s established patterns (audit logging, tenant+session scoping, soft-delete, error classification) rather than the prototype's `runMemory`/tool-message model. Where the handoff's `.tsx` files are useful, they're used as **visual/interaction reference only** (chrome, copy, footer layout) — not as literal code to port, since their data flow doesn't exist here.

Two things surfaced during investigation, beyond the four schema bullets already confirmed in Known Unknowns #1, that need Jeff's schema sign-off alongside the main proposal — flagged inline in Stage 2 and Stage 5 below, kept as separate small SQL snippets so each stage stays independently executable.

---

## Step 1 — Staged implementation + testing plan

### Stage 1 — Memory canvas panel (list + card view) and CardView chrome

**No data dependency** — reads the existing, already-working `useMemories(sessionId)` hook (`GET /api/sessions/[id]/memories`). No schema change, no new API route.

Since no canvas panel exists at all yet, this stage builds the panel shell plus both its views in browse mode (select mode is Stage 3). Splitting "just the chrome" from "the panel it lives in" would leave Stage 1 unshippable, so both go together — this is still the least-risky stage: pure layout + already-available data.

**Build:**
- New panel component, e.g. `components/shells/membership/memory-canvas/MemoryCanvasPanel.tsx` — owns `{ view: 'list' } | { view: 'card'; memoryId: string }` state (mirrors the handoff's `MemoryCanvasMode`, adapted — no `selectMode` yet). Heirloom-only, lives beside `memory/` as a sibling folder, not inside `components/chat/` (same shell-isolation rule package 3 already established).
- `MemoryCanvasList.tsx` (browse mode only this stage) — list every `MemoryRow` from `useMemories(sessionId).memories`, click a row → `{ view: 'card', memoryId }`. Reuse `memoryKindOf`/`KIND_ICONS` from `components/shells/membership/memory/memoryKinds.ts` for the row icon — don't re-declare a second kind table.
- `MemoryCardView.tsx` — the reshaped chrome: header (title input wired to `useMemories().rename`, eyebrow+date meta, `+` add-to-story popover, `X` close), independently-scrolling body (media block if `source_kind` has one + `body` passage — passage stays **read-only**, per package 3's explicit "no inline editing of the passage" rule; only the title is editable, matching `MemoryCard.tsx`'s existing convention), footer action bar.
- Footer actions — `Talk about this` / `Use as a base` / `Remove`. `Remove` wires to the real `useMemories().discard()` (already exists, already works — this is not new). `Talk about this` and `Use as a base` are undesigned product flows (confirmed nowhere in this codebase or the handoff) — stub them with the same local-toast pattern `MemoryCard.tsx`'s `fireExtra` already uses for its own undesigned type-actions, rather than inventing behavior. This keeps the footer fully reachable (satisfies the handoff's "no overflow menu" requirement) without fabricating a flow.
- `+` add-to-story popover — the handoff's `stories` prop. Since there's no `stories` schema yet (Known Gaps), render this **conditionally on `stories.length > 0`** exactly as the reference `MemoryCardView.tsx` already does, sourced from `ChatHero.tsx`'s existing ephemeral client-side `stories` state. It's a no-op UI affordance until stories are real — acceptable debt, not new debt, since story-linking is explicitly out of scope per Known Gaps ("when story-linking is eventually built it should be many-to-many... not a single column").
- Wire the panel into `ChatHero.tsx`'s top-level `<section className="h-full w-full flex ...">` as a third flex child alongside the existing `SidebarV2` and the chat column (`ChatHero.tsx:167-232`). Add a `MemoryCanvasMode` piece of state to `ChatHero` (or `chatStore` if it needs to survive re-renders across the header trigger), a bookmark-icon toggle button in `ChatHeader.tsx` (matching its existing `IconButton` usage) that opens the panel in list view, and auto-open in card view for a memory the instant it's kept (hook off `useMemories().keep()` resolving, same session `ChatHero`/`MessageList` already own).
- **Resizable divider** — desktop only, sidebar collapses to a 60px rail when the panel is open (per README), 40/60 chat/panel split. Reset each session per Known Unknowns #7 — plain `useState`, no persistence, no localStorage.
- **Mobile/narrow-width handling (Known Unknowns #6), done in this stage, not deferred:**
  - Panel-level: on the same `useMediaQuery('(max-width: 768px)')` breakpoint `ChatHero.tsx` already uses for the sidebar, the canvas panel becomes a full-screen overlay (same slide-over treatment as `SidebarV2`'s existing mobile drawer, `ChatHero.tsx:184-205`) rather than a side-by-side split — there's no room for three columns on a phone.
  - Footer-level: the three footer buttons collapse to icon-only (label via `aria-label`/`title`, same as `ActionIconButton`'s existing convention) below a container-width breakpoint, keeping `Remove` pinned right (`ml-auto`) exactly as the reference layout. Verify against real content at 375px width — no font-size hack, no wrap, per the handoff's explicit ask.
- Independent scroll: body `overflow-y-auto` between a `flex-shrink-0` header and footer — no special layout math needed (confirmed by the reference `MemoryCardView.tsx`'s existing working structure).

**Test plan:**
- Unit: `MemoryCanvasPanel` state transitions (list → card → list, close from either view).
- Unit: footer `Remove` actually calls `discard()` and closes the panel/returns to list.
- Component: header title-edit calls `rename()` with trimmed value, Escape reverts, Enter commits (mirror `MemorySavedReceipt`'s existing edit tests as the pattern).
- Responsive: render at 375px — assert footer buttons render icon-only, no overflow/wrap, `Remove` stays rightmost.
- Responsive: `useMediaQuery` mobile branch renders the full-screen overlay variant, not the 40/60 split.
- Manual on Vercel preview (per CLAUDE.md's verification-surface rule): open panel from header, browse list, open a card, edit title, scroll independently with a long passage, close, resize the divider on desktop, confirm divider position resets on reload.

---

### Stage 2 — Photo bookmark

**Depends on Stage 1** (needs somewhere for the bookmarked memory to be visible/openable — though the create call itself is independent).

**The reuse target is `createDraftMemory`, not `runMemory`** (which doesn't exist in production) — Known Unknowns #4 already redirects source text to `media_items.derived_content` instead of the handoff's own `writePhotoCaption()`, which will **not** be built.

**A real gap found during investigation, not in the original four bullets:** `useMemories`/`createMemoryFromAnchor` key everything by `anchor_message_id` alone. `UploadThumbnail` is rendered per-upload inside a `.map()` over `userMsg.uploads` (`MessageList.tsx:480-488`) — a single message can carry more than one photo. If two photos on the same message are both bookmarked, the second bookmark's `getByAnchor(anchorMessageId)` would incorrectly resolve to the first photo's memory (`.find()` returns the first match), silently blocking the second photo's bookmark. This needs a second key. See the small schema addition below.

**Build:**
- `services/crm/memories.ts`: new `createPhotoMemoryFromMedia(tenantId, { sessionId, anchorMessageId, mediaItemId, memberId })`, sibling to `createMemoryFromAnchor`, not a branch inside it (different failure modes: "media item not found/wrong tenant", "not ready yet" vs. "no text content"). Validates `media_items.tenant_id`/`chat_id` match the session, reads `derived_content` server-side (never trust a client-supplied caption — same posture as every other write in this file), 409s with a clear error if `derived_content` is still null (upload processing not finished — client already gates the button on `status === 'ready'`, this is the server-side race guard). Title via the existing `deriveFallbackMemoryTitle(derived_content)` — no new title logic. Same audit-logging shape (`AuditAction.MEMORY_CREATED`) as `createMemoryFromAnchor`.
- `app/api/sessions/[id]/memories/route.ts` POST: accept an optional `media_item_id` alongside `anchor_message_id`; when present and `source_kind === 'photo'`, route to `createPhotoMemoryFromMedia` instead of `createMemoryFromAnchor`.
- `services/chat/ui/v1/useMemories.ts`: extend the per-anchor lookup functions (`getByAnchor`, `isPending`, `hasError`, `hasOpenDraft`, `create`) to accept an optional second key (`mediaItemId`), composing an internal lookup key (`` `${anchorMessageId}:${mediaItemId ?? ''}` ``) everywhere a `Record<string, ...>` is keyed today, and matching `MemoryRow`s by `(anchor_message_id, media_item_id)` when present. Non-photo call sites (existing message bookmark) are unaffected — they simply never pass the second key.
- `PhotoUploadActions.tsx` (new, under `components/shells/membership/memory-canvas/` or beside `UploadThumbnail.tsx`) — bookmark + add-to-memory (Stage 3) + GPS badge (Stage 5) row, rendered as a sibling under `UploadThumbnail` in `MessageList.tsx`'s upload `.map()` (`MessageList.tsx:480-488`), hover-gated to match every other message-action row (`[@media(hover:none)]` for touch), **except the GPS badge**, which is always-visible per the handoff. Bookmark calls `memories.create(anchorMessageId, 'photo', mediaItemId)`.
- No transition/animation work needed — the resulting `draft` card renders via the exact same `renderMemorySlot`/`MemoryCard` path every other bookmark already uses (`hl-animate-modal`, already shipped). The handoff's "insert a running pill" language describes the old prototype's tool-message array; production's pending state is already handled by `useMemories`'s `pendingAnchors` + `MemoryRunningPill` — nothing new to build here.

**Small schema addition (separate from Step 2's main block, needed for this stage's correctness):**

```sql
-- Stage 2 prerequisite — run before Stage 2 ships.
-- Disambiguates multiple bookmarked photos on the same message (artifacts.anchor_message_id
-- alone collides when >1 upload on one message is bookmarked independently).
ALTER TABLE artifacts
  ADD COLUMN media_item_id uuid REFERENCES media_items(id);
```

Nullable, no default — every existing row (all `source_kind` values today) gets `NULL`, unaffected. No backfill needed; only newly-created photo memories populate it.

**Test plan:**
- Unit: `createPhotoMemoryFromMedia` — happy path, wrong-tenant media item (404), media item not `ready` (409), empty `derived_content` edge case (falls back to the same `FALLBACK`-style copy pattern, or 409 — decide during implementation, write the test either way before writing the function).
- Unit: `useMemories` composite-key lookups — two photos on one message, bookmark both, assert both resolve independently (`getByAnchor` no longer collides).
- Integration: POST `/api/sessions/[id]/memories` with `media_item_id` routes correctly; without it, existing behavior is byte-for-byte unchanged (regression guard for the existing message-bookmark path).
- Manual on preview: attach two photos to one message, bookmark each independently, confirm two distinct draft cards, confirm the GPS-badge/add-to-memory buttons per-photo don't cross-wire.

---

### Stage 3 — Add-to-memory (multi-select)

**Depends on Stage 1** (the list view it opens in select mode) **and the Step 2 schema proposal below** (the `photo_artifacts` join table this stage actually writes to).

**Real current write path, investigated this session:** there is no existing "photo belongs to a memory" concept at all — `media_items.artifact_id` is a confirmed-dead column (zero code references, not even in the `MediaItem` TypeScript type). This stage is a genuinely new write path, not a modification of an existing one.

**Build:**
- Extend `MemoryCanvasPanel`'s mode union with `{ view: 'list'; selectMode: true; pendingMediaItemId: string }`. `PhotoUploadActions`'s "Add to a memory" button opens the panel in this mode instead of plain list.
- Extend `MemoryCanvasList.tsx` with the `selectMode` prop from the reference file — row-highlight-as-checkbox (no separate checkbox element, confirmed deliberate simplification), in-panel save bar appearing once ≥1 row checked, `Save` → "Saved" → panel auto-closes ~700ms later, toast naming what was added. This part of the reference `.tsx` ports cleanly since it's pure UI state, no data-shape mismatch with the mockup.
- New service function, `services/crm/memories.ts` or a new `services/crm/photo-artifacts.ts`: `attachPhotoToMemories(tenantId, mediaItemId, memoryIds: string[])` — validates the media item and every memory id belong to this tenant+session, upserts one `photo_artifacts` row per memory id (`ON CONFLICT DO NOTHING` on the unique pair, so re-checking an already-attached memory is a safe no-op).
- New route: `POST /api/media/[id]/memories` — body `{ memory_ids: string[] }`, calls `attachPhotoToMemories`. (Sibling to the existing `app/api/media/[id]/retry/route.ts` pattern.)
- New audit action: `AuditAction.MEMORY_PHOTO_ATTACHED` (`memory.photo_attached`), following the existing dot-separated naming convention in `services/audit/types.ts`.
- No change needed to `MemoryCardView`'s display — this stage only writes the relationship; showing "this photo is attached to N memories" anywhere in the card UI is not in the confirmed scope (the handoff doesn't ask for it) and is left for a later pass, noted as a gap rather than silently built partially.

**Test plan:**
- Unit: `attachPhotoToMemories` — happy path (multiple memory ids), partial-tenant-mismatch rejection, re-attach is idempotent (no duplicate row, no error).
- Component: `MemoryCanvasList` select mode — multi-check works (not single-select), save bar appears only once ≥1 checked, disabled during the ~700ms saved-state hold (matches the reference's `disabled={saved}` guard).
- Integration: POST `/api/media/[id]/memories` end-to-end against a real (test) `photo_artifacts` insert.
- Manual on preview: click "Add to a memory" on a photo, check three memories, Save, confirm toast + panel close, re-open select mode on the same photo, confirm the three rows still read as checked (round-trips from the DB, not just local state) — this is the one behavior with no client-side precedent (`Add-to-memory has no data model` was Known Unknowns #4/§2's open item), so it's the highest-risk manual check in this stage.

---

### Stage 4 — Scroll-to-latest nudge

**Independent — no dependencies on any other stage or on the schema proposal. Ship anytime**, per the handoff's own rollout order.

**Build:**
- Port `ScrollToLatestButton.tsx` + `useScrollAnchor` near-verbatim — this file is already production-shaped and not memory-specific. Target: wherever `MessageList.tsx`/`ChatHero.tsx` currently owns the transcript scroll container (find the actual scroll element — likely the `<div>` wrapping the messages map in `MessageList.tsx`; confirm exact selector during implementation, since the reference assumes a container this codebase's real markup may nest differently).
- Respect `prefers-reduced-motion` on the entrance animation (`motion-safe:` prefix already in the reference file — keep it).

**Test plan:**
- Unit: `useScrollAnchor`'s `atBottom` threshold logic (48px band) — scrolled up vs. near-bottom.
- Unit: pinned-to-bottom-on-new-content behavior only fires `atBottom === true`, never force-scrolls a visitor reading history.
- Component: button visible only when `!atBottom`, `onClick` calls `scrollToBottom`.
- Manual on preview: scroll up mid-conversation, confirm button appears; send/receive a new message while scrolled up, confirm it does NOT auto-scroll; click the button, confirm smooth-scroll to bottom.

---

### Stage 5 — GPS indicator

**Independent of Stages 1–4's UI work; badge display can ship standalone.** Real extraction requires its own small schema addition (below) — do not ship the badge wired to fake data, per the handoff's own explicit warning ("a permanently-true badge is misleading").

**Build:**
- `services/media/processor.ts`'s `processImage()` (lines ~186–345) currently hands Anthropic's vision API a signed URL **by reference** and never downloads image bytes — confirmed this session, and separately confirmed in `Known Gaps.md`'s width/height entry as the same limitation. Add a byte-fetch step mirroring `processDocument`'s existing pattern (`fetch(signedUrl)` → `arrayBuffer()` → `Buffer`, already used elsewhere in the same file) — lightweight, header-only EXIF read (no full image decode), per Known Unknowns #2. No new dependency exists in `package.json` for this (`exifr`/`exif-parser`/`sharp` all absent, confirmed via `package.json` read) — add a minimal EXIF-GPS-tag reader as a new dependency (smallest maintained option, e.g. `exifr`'s GPS-only parse mode) rather than hand-rolling TIFF/EXIF parsing.
- Store raw `lat`/`lng` only — **no reverse-geocoding**, per Known Unknowns #2. `updateMediaItem()` (already exists, already writes `derived_content`/`classification`/`processed_at`) gets two more optional fields.
- `services/media/types.ts`'s `MediaItem` interface gets `latitude: number | null` / `longitude: number | null`.
- `PhotoUploadActions.tsx`'s `GpsFoundBadge` renders when both are non-null — **always-visible, not hover-gated** (a status, not an action, per the reference file's own doc comment — keep that distinction). Tap is a stub (no-op), per Known Unknowns #3 — do not build a map/place-name flow.
- Client: `ClientMediaItem`/wherever `GET /api/media` batch-fetches item fields needs to include the two new columns in its select list.

**Small schema addition (separate from Step 2's block, this stage's own prerequisite):**

```sql
-- Stage 5 prerequisite — run before Stage 5 ships.
-- Raw EXIF GPS coordinates, header-only extraction, no reverse-geocoding this pass.
ALTER TABLE media_items
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision;
```

Nullable, no default — mirrors the already-deferred, same-shaped `width`/`height` addition documented in `System Docs/Database Schema.md`'s `media_items` row (same pattern, same reasoning, this one just gets built instead of staying deferred).

**Test plan:**
- Unit: EXIF-GPS parse — a fixture JPEG with known GPS tags extracts the right lat/lng; a fixture with none extracts `null`/`null` (not an error); a corrupt/non-JPEG buffer doesn't crash the pipeline (processing continues, `latitude`/`longitude` stay null — mirrors the existing `processImage` try/catch posture).
- Integration: full `processImage` run against a real signed URL still succeeds when the new fetch step is added (regression guard — don't break the existing caption pipeline while adding this).
- Component: badge renders only when both fields are non-null; renders regardless of hover state (screenshot/DOM test, not just visual); tap is inert (no network call, no state change).
- Manual on preview: upload a real photo with GPS EXIF data (many phone photos have it by default) and one without; confirm the badge appears only on the first.

---

## Step 2 — Schema proposal (Known Unknowns #1 — write only, do not run)

Investigated the real current shape first (`services/crm/memories.ts` full read, `System Docs/Database Schema.md`'s `artifacts`/`artifact_media`/`media_items` rows, live grep confirming zero code references to `artifact_media` or `media_items.artifact_id`):

- `artifacts`: existing table, no `type` CHECK constraint found in any documented or code-enforced form (unlike `source_kind`, which is an app-level-only enum — same pattern, `type` is likely the same, but **please confirm no DB-level CHECK exists on `artifacts.type` before running the `story` addition below** — if Studio shows one, it needs an `ALTER TABLE ... DROP CONSTRAINT` / `ADD CONSTRAINT` pair instead of a no-op comment).
- `artifact_media`: confirmed dead — zero code references anywhere in the repo. Left alone by this proposal (not part of the new photo↔artifact model; that's `media_items` + the new join table below, not `artifact_media`).
- `media_items.artifact_id`: confirmed dead column — absent from the `MediaItem` TypeScript type, no select/insert/update anywhere.
- `media_items.story_id`: confirmed always `NULL` — FK to a `stories` table that doesn't exist; `ChatInput.tsx` always inserts `null`, never set otherwise.

**Data migration check, per the task's explicit ask:** since both dead columns have zero write paths in application code, there is no plausible way for either to hold non-null data from normal app usage. But this environment has no live DB query access — the SQL below includes a `SELECT COUNT(*)` guard Jeff should run and check is `0` before the `DROP COLUMN` lines, rather than assuming it from static analysis alone.

**Execution order** (matters — later statements reference earlier ones):
1. `artifacts.type` gains `'story'` (constraint change, if any — independent of everything else, do first).
2. Create `artifact_containments` (memory↔story join) — depends on `artifacts` existing (it does), not on anything new.
3. Create `photo_artifacts` (photo↔artifact join) — depends on `media_items` and `artifacts` existing (both do).
4. Verify counts are 0, then drop `media_items.artifact_id` / `media_items.story_id` — do this **last**, and only after application code in Stage 3 is deployed and confirmed working against the new join tables (don't drop the old dead columns in the same pass as shipping code that might still reference them during a rolling deploy — low risk here since they're confirmed unread, but it's a one-way door, so sequence it after, not concurrent).

```sql
-- ============================================================
-- Memory Canvas — artifacts/media_items schema redesign
-- Per Known Unknowns #1 (confirmed, full redesign). Run in this
-- order. Jeff to execute in Supabase Studio — not run by CC.
-- ============================================================

-- 1. artifacts.type gains 'story' -----------------------------
-- CONFIRM FIRST: does artifacts.type have an existing CHECK
-- constraint in Studio? Static analysis of the codebase found
-- none (type is read/written as a plain text column everywhere,
-- same as source_kind's app-level-only enum) — if Studio shows
-- one, adapt this block to DROP + re-ADD it with 'story' included
-- instead of this being a no-op. If there is truly no constraint,
-- this step needs no DDL at all — the app will simply start
-- writing type='story' rows once Stage 3+ code ships. Included
-- here as an explicit checkpoint, not because DDL is known-needed.

-- 2. Memory <-> story containment (many-to-many) ---------------
CREATE TABLE artifact_containments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  parent_artifact_id uuid NOT NULL REFERENCES artifacts(id), -- the story
  child_artifact_id  uuid NOT NULL REFERENCES artifacts(id), -- the memory
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_artifact_id, child_artifact_id)
);
CREATE INDEX idx_artifact_containments_parent ON artifact_containments (parent_artifact_id);
CREATE INDEX idx_artifact_containments_child  ON artifact_containments (child_artifact_id);
CREATE INDEX idx_artifact_containments_tenant ON artifact_containments (tenant_id);

-- 3. Photo <-> artifact/memory attachment (many-to-many) --------
-- Replaces media_items.artifact_id. Mirrors the existing
-- prompt_type_tenants join-table shape/convention (id, two FKs,
-- tenant_id, created_at, unique pair + per-FK indexes).
CREATE TABLE photo_artifacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  media_item_id uuid NOT NULL REFERENCES media_items(id),
  artifact_id   uuid NOT NULL REFERENCES artifacts(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_item_id, artifact_id)
);
CREATE INDEX idx_photo_artifacts_media    ON photo_artifacts (media_item_id);
CREATE INDEX idx_photo_artifacts_artifact ON photo_artifacts (artifact_id);
CREATE INDEX idx_photo_artifacts_tenant   ON photo_artifacts (tenant_id);

-- 4. Retire the two dead media_items columns --------------------
-- RUN THIS FIRST, CHECK THE RESULT IS 0 BEFORE PROCEEDING:
--   SELECT count(*) FROM media_items WHERE artifact_id IS NOT NULL;
--   SELECT count(*) FROM media_items WHERE story_id IS NOT NULL;
-- Only after both return 0 (expected — confirmed zero code paths
-- write either column) and Stage 3's application code is deployed:
ALTER TABLE media_items DROP COLUMN artifact_id;
ALTER TABLE media_items DROP COLUMN story_id;
```

**Not included above, called out separately per-stage since they're independent, smaller, and not part of Known Unknowns #1's four bullets** (kept out of this block so this proposal stays scoped to what was asked, and so each stage's schema need can be run/reviewed on its own schedule):
- Stage 2's `artifacts.media_item_id` addition (multi-photo-per-message disambiguation).
- Stage 5's `media_items.latitude`/`longitude` addition (GPS extraction).

---

## What was explicitly not built (per the task and per investigation)

- `writePhotoCaption()` — not built; `derived_content` already covers it.
- Real map/place-name behavior behind the GPS badge tap — stub only, per Known Unknowns #3.
- Reverse-geocoding — not built, per Known Unknowns #2.
- Sorting/filtering on the memory canvas list — plain save-order, per Known Unknowns #5.
- "Talk about this" / "Use as a base" real behavior — toast stubs, matching the existing undesigned-action pattern already shipped in `MemoryCard.tsx`; no product spec exists for either.
- Showing "attached to N memories" anywhere in the photo/upload UI — Stage 3 only writes the relationship; no display surface was asked for.
- No SQL was run. No application code was written. This plan and the Step 2 SQL block are the full deliverable of this pass.
