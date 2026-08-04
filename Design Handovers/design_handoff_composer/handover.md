# Handover — Composer (Prompt Builder) redesign

**2BL.AI Platform · target: `app/admin/prompt-builder/page.tsx`**
Mantine v7 · Next.js App Router · TypeScript strict. Status: **design complete & approved.**

> **Scope of this package: the Composer screen only** — the chat surface where a
> tenant admin talks to Sage to draft and save prompt **blocks**. This is a
> **chrome + interaction** redesign of the screen that already ships at
> `/admin/prompt-builder`. **All backend wiring is preserved unchanged** (streaming
> chat, file upload, safety check, save-to-Supabase, topics). Do not rebuild those —
> §5 lists exactly what must survive the redesign.

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
| **Top bar** | Plain `Composer` title bar; a separate sticky bar holds Copy-all + counter once active | **One top bar**: hamburger (toggles the drawer) · active conversation **title** · Copy all · exchange badge |
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

## 2. Architecture — one page, three new presentational parts

The current screen is a single 1,400-line client component. The redesign keeps
**one page component that owns all state and all API calls** (nothing about the
data flow changes) and extracts three **presentational** pieces so the new chrome
is testable and the page stays readable:

```
app/admin/prompt-builder/
  page.tsx                         orchestrator — ALL state + ALL fetch/save logic
components/admin/prompt-builder/
  types.ts                         shared types + constants (TYPES, MAX_EXCHANGES…)
  ConversationSidebar.tsx (+css)   NEW — the history drawer (presentational)
  Composer.tsx            (+css)   NEW — the Heirloom composer (presentational)
  DraftCard.tsx                    EXISTING card logic, lifted out verbatim
```

- **`page.tsx`** holds every `useState`/`useEffect`/handler that exists today —
  `sendChatMessage`, `handleFileUpload`, `parseAllDoneJson`, `saveBlockToSupabase`,
  `runCardSafetyCheck`, the topics/blocks fetches, the exchange counter — **unchanged**.
  It gains a small amount of new state for the conversation drawer (§3).
- **`ConversationSidebar`** and **`Composer`** are pure props-in / callbacks-out.
  They render the new chrome and call back into the page's existing handlers.
- **`DraftCard`** is the current in-thread confirmation card, moved to its own file
  with no behaviour change, so `page.tsx` isn't dominated by it.

> Why not a new route or a context provider? The screen is still **one screen**
> with one data boundary; the redesign is layout, not data architecture. Keeping a
> single owning component means the streaming/save logic you already trust is
> touched as little as possible. The only genuinely new data concern is conversation
> persistence (§3), and that is deliberately isolated behind two function props
> (`onSelectConversation`, `onNewConversation`) so it can land later.

---

## 3. The conversation drawer — the one real new capability

Everything else in the redesign is presentational re-housing of existing behaviour.
**The conversation history is the exception**: it implies persistence the product
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
> top bar** (§1, §4) and keep the hamburger hidden behind a flag. They carry most
> of the visual upgrade and have **zero** backend dependency.

---

## 4. The Heirloom composer

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

## 5. Do-not-regress checklist (carried over from production)

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
      `source_id`, `owner_id`, and the session transcript; the "Block saved! What
      would you like to build next?" continuation + `sessionStartIndex` reset.
- [ ] **Topics**: `GET`/`POST /api/admin/topics`, inline **New topic…** create.
- [ ] **Exchange counter** — counts user messages **since `sessionStartIndex`**;
      warn at 8, hard limit at 10; the limit card with **Start new chat**.
- [ ] **Copy** — per-bubble click-to-copy and **Copy all**.

---

## 6. Open decisions

1. **Conversation persistence** — build now or ship composer-only first (§3).
2. **Drawer default + mobile.** Drawer is overlay (280px, scrim) and closed by
   default; the hamburger lives in the top bar. Confirm it should stay closed on
   desktop too (vs. docked). On mobile it's full-overlay — same component.
3. **Loading affordance** — keep skeleton cards for drafting turns, dots for plain
   replies (§4). Confirm.
4. **Top-bar title source** — active conversation title vs. always `Composer`.
   Prototype shows the title once a conversation has a name; `Composer` for a fresh
   draft.
5. **"New" semantics** — does `New` discard an unsent fresh draft (prototype does)
   or always open a blank? Confirm before wiring create-on-first-send.
6. **Suggestion-pill persistence** — pills show only before the first message.
   Confirm they shouldn't reappear mid-conversation (prototype hides them once
   engaged).

---

## 7. Design tokens (composer chrome)

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
| User bubble | `bg green-6`, white, radius 16px | `.bubble.user` |
| Assistant bubble | `bg gray-0`, gray-9, markdown | `.bubble.assistant` |
| Typing dots | 3 × 6px gray-5, staggered 1.2s bounce | `.hc-typing` |
| Fonts | Playfair Display (titles) · DM Sans (body) · DM Mono (labels/status) | — |

Palette anchors: `green-6 #2d6a4f`, `green-7 #245741`, `green-5 #4fa574`,
`gray-0 #f8f9fa` … `gray-9 #212529`, `text #1a1917`, `muted rgba(26,25,23,.55)`.

---

## 8. Files in this package

**Production-shaped skeletons** (recreate against the real repo — verify import
paths, the `@/components/admin/primitives/*` and `@/services/*` modules, and the
new conversation endpoints):

- `src/components/admin/prompt-builder/types.ts`
- `src/components/admin/prompt-builder/ConversationSidebar.tsx` (+ `.module.css`)
- `src/components/admin/prompt-builder/Composer.tsx` (+ `.module.css`)
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
