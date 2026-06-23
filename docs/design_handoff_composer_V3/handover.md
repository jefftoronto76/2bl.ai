# Handover — Composer (Prompt Builder) redesign

**2BL.AI Platform · target: `app/admin/prompt-builder/page.tsx`**
Mantine v7 · Next.js App Router · TypeScript strict. Status: **design complete & approved.**

> **Scope of this package: the Composer screen only** — the chat surface where a
> tenant admin talks to Sage to draft and save prompt **blocks**. This is a
> **chrome + interaction** redesign of the screen that already ships at
> `/admin/prompt-builder`. **All backend wiring is preserved unchanged** (streaming
> chat, file upload, safety check, save-to-Supabase, topics). Do not rebuild those —
> §6 lists exactly what must survive the redesign.

---

## 1. What changed — current production vs. approved design

The screen today is a **single-conversation** chat: a welcome line, three big
opening buttons, a composer box, and a thread that appears once you start. The
redesign keeps that engine and re-houses it in a **chat-app pattern** — a
conversation history drawer on the left, a thread column with its own top bar, and
a richer "Heirloom" composer where the opening options live *inside* the input.

| Area | Current production | Approved design |
|------|--------------------|-----------------|
| **Conversation history** | None — one conversation, lost on reload | **Inner sidebar drawer** of past conversations, grouped Today / This week / Earlier, with a **New** button. *(New — needs persistence, see §3.)* |
| **Top bar** | Plain `Composer` title bar; a separate sticky bar holds Copy-all + counter once active | **One top bar**: hamburger (toggles the drawer) · active conversation **title** · **prompt-set picker** · exchange badge · Copy all |
| **Prompt set** | No selector in the Composer — a saved block lands in the implicitly-active set; switching sets or making a new one means leaving for the Blocks screen | **Top-bar picker** (`BUILDING IN …`) to choose which set a saved block lands in, plus inline **`+ New prompt set…`**. *(New — one save-payload field, see §4.)* |
| **Opening options** | Three full-width light-green buttons stacked on the canvas (`Summarize my prompt`, `Identify opportunities to improve`, `Create a new block`) | The same three, moved **into the composer** as collapsible **suggestion pills**; collapse to a `✦ Suggestions (3)` chip |
| **Composer** | Bordered box: autosize `Textarea` + button row (`+` upload menu · send) | **Heirloom card**: focus ring, suggestion-pill row, `+`/auto-grow input/send row, upload row, and a **status meta footer** (`READY` / `DRAFTING…` + `↵ to send · ⇧↵ new line`) |
| **Empty state** | Golden-ratio centred; `Welcome back, {name}.` + 3 buttons + composer + metadata | `Welcome back, {name}.` + sub `Build a block, or pick a starting point below.` + the Heirloom composer (pills inside) |
| **Header title** | Static `Composer` | Shows the **active conversation's title** (or `Composer` for a fresh draft) |

**Kept exactly as-is (visual + behavioural):** the green/gray Mantine palette,
the centred 800px thread column, green user bubbles + markdown assistant bubbles,
click-to-copy on bubbles, the **draft confirmation cards** (block name / type /
topic, edit, safety-check alerts, Save Anyway, Discard, default-block checkbox),
the **exchange counter + limit** behaviour, and the collapsible **Block metadata**
panel under the composer. No API routes change.

---

## 2. Architecture — one page, four new presentational parts

The current screen is a single 1,400-line client component. The redesign keeps
**one page component that owns all state and all API calls** (nothing about the
data flow changes) and extracts four **presentational** pieces so the new chrome
is testable and the page stays readable:

```
app/admin/prompt-builder/
  page.tsx                         orchestrator — ALL state + ALL fetch/save logic
components/admin/prompt-builder/
  types.ts                         shared types + constants (TYPES, MAX_EXCHANGES…)
  ConversationSidebar.tsx (+css)   NEW — the history drawer (presentational)
  Composer.tsx            (+css)   NEW — the Heirloom composer (presentational)
  PromptSetPicker.tsx     (+css)   NEW — top-bar prompt-set selector + create
  DraftCard.tsx                    EXISTING card logic, lifted out verbatim
```

- **`page.tsx`** holds every `useState`/`useEffect`/handler that exists today —
  `sendChatMessage`, `handleFileUpload`, `parseAllDoneJson`, `saveBlockToSupabase`,
  `runCardSafetyCheck`, the topics/blocks fetches, the exchange counter — **unchanged**.
  It gains a small amount of new state for the conversation drawer (§3).
- **`ConversationSidebar`** and **`Composer`** are pure props-in / callbacks-out.
  They render the new chrome and call back into the page's existing handlers.
- **`PromptSetPicker`** is a pure selector — `promptSets`, `activeId`, `onSelect`,
  `onCreate` in. It reuses the Blocks header's `ps-*` styling so both screens match.
- **`DraftCard`** is the current in-thread confirmation card, moved to its own file
  with no behaviour change, so `page.tsx` isn't dominated by it.

> Why not a new route or a context provider? The screen is still **one screen**
> with one data boundary; the redesign is layout, not data architecture. Keeping a
> single owning component means the streaming/save logic you already trust is
> touched as little as possible. The only genuinely new data concern is conversation
> persistence (§3), and that is deliberately isolated behind two function props
> (`onSelectConversation`, `onNewConversation`) so it can land later.

---

## 3. The conversation drawer — the bigger new capability

Two parts of the redesign are genuinely new — this **conversation drawer** and the
**prompt-set picker** (§4); everything else is presentational re-housing of existing
behaviour. The drawer is the bigger lift because it implies persistence the product
does not have yet. Today a conversation lives only in `chatMessages` state and is
gone on reload. The prototype shows the *target* with mocked threads
(`SAMPLE_THREADS`).

**Data model the sidebar assumes** (one row per conversation):

```ts
interface Conversation {
  id: string
  title: string            // AI- or first-message-derived; editable later
  preview: string          // last assistant line, truncated
  updatedAt: number        // for the Today / This week / Earlier grouping
  messages: ChatMessage[]  // hydrated on open (or lazy-fetched by id)
}
```

The sidebar only needs `{ id, title, preview, updatedAt }` to render the list;
`messages` hydrate when a conversation is opened. Grouping is by `updatedAt`
(`Today` < 24h, `This week` < 7d, else `Earlier`).

**What to decide / build (open):**

1. **Persistence.** New table (e.g. `prompt_conversations`) + endpoints:
   `GET /api/admin/conversations` (list for the owner), `GET …/:id` (hydrate
   messages), `POST` / `PATCH` (create / append). The save flow already passes
   `messages` to `/api/admin/blocks/save`; a conversation row is the natural home
   for that transcript regardless of whether a block was saved.
2. **When is a conversation created?** Proposal: lazily, on first send of a fresh
   draft (so empty drafts never persist). `onNewConversation()` just resets local
   state and shows the empty composer; the row is written on first exchange.
3. **Titles.** Prototype uses a static title until messages exist (`New
   conversation`). Production can derive a title from the first user message or ask
   the model for one. Out of scope for the sidebar UI — it just renders `title`.
4. **Ship order.** The sidebar is safe to ship **drawer-closed-by-default** with a
   read-only list endpoint first; `New` + selection can be wired before titling/AI
   niceties. Until the endpoints exist, `conversations={[]}` renders an empty
   drawer and the screen behaves exactly like today.

> If persistence is out of scope for this cycle, ship the **Heirloom composer +
> top bar** (§1, §5) and keep the hamburger hidden behind a flag. They carry most
> of the visual upgrade and have **zero** backend dependency.

---

## 4. The prompt-set picker — choose where blocks land

The Composer drafts **blocks**, but every block belongs to a **prompt set** — the
collection that compiles into a deployed prompt (`Sage — Production`,
`Sage — Staging`, `Discovery Bot`, …). Today the Composer has **no set selector**:
a saved block lands in whichever set is implicitly active, and there's no way to
build into a different set, or spin up a new one, without leaving for the Blocks
screen.

The redesign adds a **prompt-set picker to the Composer top bar**, left of the
exchange badge, under a `BUILDING IN` mono label. It:

- shows the **active set** (name + `Live` / `Draft` status badge) and opens a
  dropdown of every set the owner can write to (name · `v{version}` · status);
- has an inline **`+ New prompt set…`** affordance — type a name, **Create**, and
  the new set becomes active so the next saved block lands in it;
- is the **same control** that already ships in the Blocks header — reuse the
  `ps-*` styles / the `PromptSetSelect` component so the two screens stay in lockstep.

**Why it matters:** "which prompt am I editing?" was invisible in the Composer.
Making it explicit — and selectable — means a saved block is unambiguously routed,
and admins can start a brand-new prompt set from the chat surface instead of
context-switching.

**Data model** (one row per set; the Blocks screen already assumes this):

```ts
interface PromptSet {
  id: string
  label: string
  version: number
  status: 'Live' | 'Draft'
}
```

The picker needs only `{ id, label, version, status }`. Selecting a set sets
`activePromptSetId`; **Create** posts a new (Draft, v1) set and selects it.

**Wiring — the one backend touch:**

- **List** the sets the owner can write to: `GET /api/admin/prompt-sets` (likely
  already backing the Blocks header — reuse it).
- **Create**: `POST /api/admin/prompt-sets` `{ label }` → returns the new row
  (`status: 'Draft'`, `version: 1`).
- **Save routing** — the **only change to the save path**: `POST
  /api/admin/blocks/save` gains a `prompt_set_id` field set to
  `activePromptSetId`. Every other field in the payload (§6) is unchanged. If the
  backend infers the set server-side today, this makes the choice explicit and
  client-driven.

> **Ship order.** The picker is purely presentational with `promptSets={[…]}`, an
> `activePromptSetId` default, and a no-op `onCreate` — it renders and switches
> sets with zero backend. Wire `prompt_set_id` into the save call when the column
> exists; wire **Create** last. Until then, default to the current active set and
> the screen behaves exactly like today.

---

## 5. The Heirloom composer

A single bordered card (radius 14px) that replaces the current composer box. Top
to bottom:

- **Suggestion pills** (fresh conversation only) — the three opening options as
  pills; an `✕` collapses them to a `✦ Suggestions (3)` chip that re-expands. Pills
  disable when there are no existing blocks (same rule as today's buttons — the
  first two need blocks to summarise / critique). Selecting a pill calls the same
  `handleOpeningChoice('summarize' | 'opportunities' | 'new')` that exists now.
- **Input row** — `+` upload trigger (the existing `Menu`: Add files enabled;
  Drive / Dropbox / Box / Screenshot disabled), an **auto-grow textarea**
  (max ~160px), and a green **send** button. Enter sends, Shift+Enter newlines.
- **Upload row** — the existing `Processing… / Saved to assets. / error` states.
- **Status meta footer** — a small mono row: a dot + `READY` (green) or
  `DRAFTING…` (amber, pulsing) while a request is in flight, and the
  `↵ to send · ⇧↵ new line` hint. This is new affordance only; it reflects
  `chatLoading`.

The composer is **presentational** — it takes `input`, `onSend`, `onUpload`,
`loading`, `atLimit`, and `pills`, and renders. All thinking stays in `page.tsx`.

> **Loading affordance — reconcile two patterns.** Production shows **skeleton
> block-cards** with cycling status text (`Reviewing supplied content…` →
> `Analyzing block options…` → `Creating blocks…`) while a *block-drafting* turn
> runs, and a `Thinking…` text node for a plain reply. The prototype shows
> **three animated dots** in an assistant bubble. **Keep production's skeleton
> cards for block-drafting turns** (they preview the cards about to land) and use
> the dots/`DRAFTING…` only for plain-reply turns. Don't drop the skeletons — they
> do real work signalling "cards incoming."

---

## 6. Do-not-regress checklist (carried over from production)

Every item below works today and must work identically after the redesign. These
live in `page.tsx` and are **not** changed by this package:

- [ ] **Streaming** chat via `readDataStream` against `POST /api/admin/blocks/chat`,
      with `existingBlocks` + `documentContext` passed through.
- [ ] **`parseAllDoneJson`** — balanced-brace extraction of `{done:true,…}` block
      JSON from the stream, display-text stripping, and **closing message** capture.
- [ ] **File upload** → `POST /api/admin/assets/upload`, the `pendingAutoTrigger`
      effect that auto-sends "analyze this document", and `documentContext` reuse.
- [ ] **Draft cards**: edit content, **per-card type / topic / block-name**,
      `is_default` checkbox **for platform admins only**, save error display.
- [ ] **Safety check** → `POST /api/admin/prompt/compile/check`: issues alert,
      per-issue **offending-text** chip + **Remove**, and **Save Anyway** bypass.
- [ ] **Save** → `POST /api/admin/blocks/save` (resolving/creating the topic first),
      `source_id`, `owner_id`, the new **`prompt_set_id`** (§4), and the session
      transcript; the "Block saved! What would you like to build next?"
      continuation + `sessionStartIndex` reset.
- [ ] **Topics**: `GET`/`POST /api/admin/topics`, inline **New topic…** create.
- [ ] **Exchange counter** — counts user messages **since `sessionStartIndex`**;
      warn at 8, hard limit at 10; the limit card with **Start new chat**.
- [ ] **Copy** — per-bubble click-to-copy and **Copy all**.

---

## 7. Open decisions

1. **Conversation persistence** — build now or ship composer-only first (§3).
2. **Drawer default + mobile.** Drawer is overlay (280px, scrim) and closed by
   default; the hamburger lives in the top bar. Confirm it should stay closed on
   desktop too (vs. docked). On mobile it's full-overlay — same component.
3. **Loading affordance** — keep skeleton cards for drafting turns, dots for plain
   replies (§5). Confirm.
4. **Top-bar title source** — active conversation title vs. always `Composer`.
   Prototype shows the title once a conversation has a name; `Composer` for a fresh
   draft.
5. **"New" semantics** — does `New` discard an unsent fresh draft (prototype does)
   or always open a blank? Confirm before wiring create-on-first-send.
6. **Suggestion-pill persistence** — pills show only before the first message.
   Confirm they shouldn't reappear mid-conversation (prototype hides them once
   engaged).
7. **Prompt-set list source** — confirm `GET /api/admin/prompt-sets` is the same
   endpoint already feeding the Blocks header, scoped to sets the owner can write
   to (don't list read-only sets a block can't be saved into).
8. **Default active set** — which set is selected on load? Proposal: last-used, else
   the owner's live production set. The Composer should not silently default to a
   `Draft` set.
9. **New-set semantics** — **Create** makes a `Draft` v1 set and selects it. Confirm
   an empty set may exist before any block saves into it, and whether the Composer
   or the backend owns naming/validation (dupes, length).

---

## 8. Design tokens (composer chrome)

Pulled from the approved prototype (`prototype/composer.css`). These map to the
existing Mantine theme — replace literals with `var(--mantine-color-*)` where you
already have them; they're inlined here so the prototype renders standalone.

| Token | Value | Use |
|-------|-------|-----|
| Composer card | `1px solid gray-3` · radius **14px** · `bg #fff` | `.hc` |
| Composer focus | border `rgba(45,106,79,.55)` + green drop shadow | `.hc.focus` |
| Send button | `bg green-6 #2d6a4f` → hover `green-7 #245741`, 40px, radius 10px | `.hc-send` |
| Suggestion pill | 30px · radius 999px · `1px gray-3` · `bg gray-0`; hover green tint | `.hc-chip` |
| Collapsed chip | dashed `gray-4`, `✦` in green-6, mono count badge | `.hc-suggest` |
| Status dot (ready) | `green-5 #4fa574`, 3px green ring | `.hc-status .dot` |
| Status dot (drafting) | `#e8a33d` amber, pulsing 1.5s | `.hc-status.thinking .dot` |
| Drawer | 280px (300px ≤860px) · `bg gray-0` · `1px gray-2` right · slide 220ms | `.cmp-side` |
| Drawer scrim | `rgba(26,25,23,.18)`, 140ms fade | `.cmp-side-scrim` |
| Thread item active | `bg rgba(45,106,79,.10)`, title in green-7 | `.cmp-thread.active` |
| Group label | mono 10px, 0.14em, uppercase, gray-6 | `.cmp-group-label` |
| Top bar | 14px/24px pad, `1px gray-2` bottom border | `.cmp-topbar` |
| Hamburger | 34px, `1px gray-3`, radius r-sm | `.cmp-hamburger` |
| Exchange badge | radius 999px, mono 11px; `warn` amber `#e67700`, `over` red | `.exch-badge` |
| Prompt-set label | `BUILDING IN` — mono 10px, 0.14em, uppercase, gray-6 | `.cmp-ps-label` |
| Prompt-set trigger | 36px, `1px gray-3`, radius r-sm; set name + status badge + caret | `.ps-trigger` |
| Set status badge | `Live` green tint `rgba(45,106,79,.12)` · `Draft` amber `rgba(245,159,0,.14)` | `.ps-badge` |
| New-set affordance | `+ New prompt set…` in green-6; inline name field + green **Create** | `.ps-newitem` / `.ps-create` |
| User bubble | `bg green-6`, white, radius 16px | `.bubble.user` |
| Assistant bubble | `bg gray-0`, gray-9, markdown | `.bubble.assistant` |
| Typing dots | 3 × 6px gray-5, staggered 1.2s bounce | `.hc-typing` |
| Fonts | Playfair Display (titles) · DM Sans (body) · DM Mono (labels/status) | — |

Palette anchors: `green-6 #2d6a4f`, `green-7 #245741`, `green-5 #4fa574`,
`gray-0 #f8f9fa` … `gray-9 #212529`, `text #1a1917`, `muted rgba(26,25,23,.55)`.

---

## 9. Files in this package

**Production-shaped skeletons** (recreate against the real repo — verify import
paths, the `@/components/admin/primitives/*` and `@/services/*` modules, and the
new conversation endpoints):

- `src/components/admin/prompt-builder/types.ts`
- `src/components/admin/prompt-builder/ConversationSidebar.tsx` (+ `.module.css`)
- `src/components/admin/prompt-builder/Composer.tsx` (+ `.module.css`)
- `src/components/admin/prompt-builder/PromptSetPicker.tsx` (+ `.module.css`)
- `src/components/admin/prompt-builder/DraftCard.tsx`
- `src/app/admin/prompt-builder/page.tsx`

**Design reference (not code to ship):**

- `prototype/composer.jsx` — the approved interactive prototype of the screen
  (vanilla-React build used in the admin mock).
- `prototype/composer.css` — the composer/drawer CSS slice the tokens come from.
- The full interactive mock is the project's **`Combined Admin - Production.html`**
  → sidebar **Prompt Studio › Composer**. Open it served (not `file://`) to click
  through the drawer, the suggestion pills, the Heirloom composer, and a drafting
  turn.

> The `.jsx`/`.css`/`.html` are **design references** — recreate the screen in the
> existing Mantine v7 + App Router codebase using its primitives, don't ship the
> prototype. The `.tsx` skeletons are the production target; their backend logic is
> lifted from the current `page.tsx` and must keep pointing at the real routes.
