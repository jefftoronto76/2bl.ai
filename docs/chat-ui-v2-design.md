# Chat UI v2 — Foundation Design: Shared Session Pattern

*Status: design — no implementation yet.*
*Branch: `feat/chat-ui-v2-foundation`*
*Audience: engineering review before extraction begins.*

This document designs the **shared/singleton session pattern** that lets
multiple UI surfaces drive **one** conversation instance. It is the
load-bearing prerequisite for extracting `useChatSession` into
`services/chat/ui/v1/core/` (see the chat-UI consolidation audit). Everything
else in the v2 extraction depends on getting this right, because it is the one
behavior a naive extraction silently breaks.

## Confirmed decisions feeding this design

1. **Two shells, permanent.** `widget` and `membership` are the only two
   deployment shells. An embedded SDK is a future-only consideration and is not
   designed for here.
2. **Booking and session history are universal capabilities.** They are
   `ChatConfig.capabilities` flags, not shell-locked. A membership may enable
   booking; a widget may enable session history. The session core must therefore
   make **no assumption** about which surface owns which capability.

Implication for this doc: the session core is capability-agnostic and
shell-agnostic. It owns exactly one thing — the conversation instance and its
lifecycle — and exposes it the same way regardless of shell.

---

## 1. The problem — why naive extraction breaks Hero + Overlay

### 1.1 What jefflougheed relies on today

On jefflougheed.ca there are **two independent mount points** that must behave
as **one conversation**:

- `src/components/Hero.tsx` — the inline chat surface in the `#hero` section.
- `src/components/Chat.tsx` — the full-viewport overlay (and the `#chat`
  anchor CTA), opened from Nav, the `#chat` CTA, and Work's "Click here".

They share state through a **module-level Zustand store**, `useSageStore`
(`src/lib/store.ts`). `create(...)` runs once at module scope, so every
component that calls `useSageStore()` — Hero, Chat, Nav, Work — reads and writes
the **same** store object. That module singleton is the *entire* reason a
message typed in Hero appears in the Overlay and vice versa, that `sessionId` is
created once and reused, and that the streaming pip is consistent across both.

Critically, **conversation state is shared but the engine is not**. Both
`Chat.tsx` (L39–51) and `Hero.tsx` (L51–63) build their *own* `useChatTurn`
instance over identical `accessors` that call `useSageStore.getState()`. So
there are two engine instances today, but they both read/write one shared store:

- `messages`, `sessionId`, and `isStreaming` are **shared** — the engine writes
  them through `accessors.setStreaming` / `addMessage` / `setSessionId`, which
  hit the module store both surfaces read.
- `isError`, and the retry context (`retryMsgsRef`, `retrySessionIdRef` inside
  `useChatTurn`) are **per-engine-instance** — so today, retry is effectively
  *surface-local*: only the surface that sent can retry that turn.

### 1.2 How Heirloom differs today

`app/heirloom/components/store/chatStore.tsx` wraps the subtree in a
`ChatProvider` that holds the reducer state (`chatReducer.ts`) and **one**
`useChatTurn` instance, exposing `sendMessage`/`isError`/etc. via React context.
Only one surface (the panel) consumes it. Heirloom is therefore **naturally a
single isolated instance** scoped by the provider — it never needed a module
singleton because it never had two mount points sharing one conversation.

### 1.3 The breakage

The audit's target is one headless `services/chat/ui/v1/core/useChatSession.ts`.
The naive extraction is: *"`useChatSession` owns its own `useState`/`useReducer`
conversation state and its own `useChatTurn`, and each surface calls it."*

If Hero and the Overlay each call that hook, **each gets its own private state
and its own engine** → **two conversations**:

- A message typed in Hero never appears in the Overlay.
- Two `POST /api/sessions` calls create two DB sessions.
- The streaming pip in the Overlay never reflects a Hero-initiated stream.
- `mode` (question/arrival) set on one surface is invisible to the other.

The module-level Zustand store is doing invisible, load-bearing work. Any
extraction that does not **explicitly** reproduce "multiple surfaces, one
instance" regresses jefflougheed the moment Hero and Overlay stop reading the
same module object. This is the single highest-risk behavior in the whole v2
consolidation, and it is the reason this design exists before any code.

---

## 2. The proposed solution — one core, two binding modes

`useChatSession` resolves its conversation state from a **store instance**, and
the *mode* decides **where that store comes from**:

- **Isolated mode** — the store is created **per provider** (`useRef` so it is
  stable for the provider's lifetime) and dies with it. One surface tree → one
  instance. This is Heirloom's existing pattern, generalized.
- **Singleton mode** — the store is resolved from a **module-level registry
  keyed by `instanceKey`**. Every binding with the same key resolves the **same**
  store. This reproduces today's `useSageStore` module-singleton behavior
  exactly, so Hero + Overlay converge on one conversation regardless of where
  each is mounted.

Both modes are consumed **identically** through a `ChatSessionProvider` +
`useChatSessionContext()` pair. The mode is an explicit opt-in via config — the
consumer never touches the store mechanism directly.

### 2.1 Canonical topology (the rule)

> **Exactly one `ChatSessionProvider` instance per shared conversation, mounted
> at a common ancestor of every surface that participates in it.**

- **jefflougheed (singleton):** one `<ChatSessionProvider mode="singleton"
  instanceKey="sage">` mounted at the nearest common ancestor of Hero and Chat
  in `app/(jefflougheed)/`. Both surfaces consume context → one engine, one
  store. (The overlay is `position: fixed`, but that is CSS only — its DOM
  ancestry is unchanged, so context resolves normally.)
- **Heirloom (isolated):** one `<ChatSessionProvider mode="isolated">` around
  the panel, exactly where `ChatProvider` sits today.

With one provider, there is **one** `useChatTurn` engine even in singleton mode
— surfaces consume the context value, they do not each instantiate the engine.
This also fixes the surface-local-retry quirk: error and retry context now live
in the single shared instance, so retry works from any surface (see §6, Risk 1 —
this is a deliberate, confirmable behavior change).

### 2.2 Why keep the module registry if one provider already shares state?

The module-keyed store is a **convergence safety net**, not the primary
mechanism:

- It precisely reproduces the proven `useSageStore` behavior, lowering migration
  risk — if the single-provider assumption is ever violated (e.g. a future
  refactor portals the overlay outside the provider tree, or two providers mount
  with the same key), the two bindings still resolve the **same** store and the
  conversation stays unified rather than silently forking.
- Isolated mode does **not** touch the registry, so Heirloom and tests get clean,
  independent instances with no global state.

The canonical setup remains "one provider per conversation"; the registry simply
makes singleton mode fail safe instead of fail silent.

---

## 3. The exact API

> Design sketches below are **type/interface declarations and signatures only**
> — no hook bodies, no component bodies. They define the contract for review,
> not the implementation.

### 3.1 The conversation store (framework-agnostic)

The store holds **only** conversation state — the slice both surfaces must
share. Shell/presentation state (expanded, composer focus ref) is explicitly
*not* here (see §6, Risk 4). Recommended backing: Zustand's vanilla
`createStore` for `useSyncExternalStore`-correct subscriptions, replacing both
the jefflougheed Zustand store's conversation slice and Heirloom's reducer.

```ts
// services/chat/ui/v1/core/store.ts  (design sketch — declarations only)

import type { ChatMode } from '@/services/chat/server/types'
import type { UIMessage } from '../types' // canonical message (audit Phase 0)

export interface ChatSessionState {
  messages: UIMessage[]
  sessionId: string | null
  isStreaming: boolean
  isError: boolean
  /** Request-affecting conversation context (e.g. question mode). */
  mode: ChatMode
}

/** Minimal vanilla store contract (Zustand-vanilla compatible). */
export interface ChatSessionStore {
  getState(): ChatSessionState
  setState(partial: Partial<ChatSessionState>): void
  subscribe(listener: () => void): () => void
}

export function createChatSessionStore(): ChatSessionStore
```

### 3.2 Store resolution — isolated vs singleton

```ts
// services/chat/ui/v1/core/store-registry.ts  (design sketch)

/** Module-level registry. Client-only — never seeded on the server (§6 Risk 5). */
//  Map<instanceKey, ChatSessionStore>

/** Singleton: same key → same store. Lazily created on first client access. */
export function getSingletonStore(instanceKey: string): ChatSessionStore

/** Test/SSR seam: clear a keyed singleton (used only in tests). */
export function __resetSingletonStore(instanceKey: string): void
```

### 3.3 `useChatSession` — the core hook

```ts
// services/chat/ui/v1/core/useChatSession.ts  (design sketch — signature only)

export type ChatSessionMode = 'singleton' | 'isolated'

export interface ChatSessionConfig {
  /** Selects the store backing. Default 'isolated'. */
  mode: ChatSessionMode
  /** Required only for singleton mode; identifies the shared store. Default 'default'. */
  instanceKey?: string
}

/** The session instance every surface consumes. */
export interface ChatSession {
  // state (read)
  messages: UIMessage[]
  sessionId: string | null
  isStreaming: boolean
  isError: boolean
  mode: ChatMode
  // actions
  send(input: string): Promise<void>
  retry(): Promise<void>
  setMode(mode: ChatMode): void
}

export function useChatSession(config: ChatSessionConfig): ChatSession
```

Behavioral contract (for review — not implementation):

- Resolves its `ChatSessionStore`:
  - `isolated` → a `useRef`-stable store created once for this hook call.
  - `singleton` → `getSingletonStore(config.instanceKey ?? 'default')`.
- Subscribes to the store via `useSyncExternalStore` so React re-renders on
  changes from **any** surface.
- Builds the `ChatEngineAccessors` over the resolved store (reading/writing
  `getState`/`setState`), so the engine mutates the shared slice.
- Calls `useChatTurn({ accessors })` **once per provider** (see §3.4 — the
  provider, not each surface, calls this hook), and writes `isStreaming` /
  `isError` / retry-context into the **store** so they are shared, not
  engine-instance-local. (Requires the minor `useChatTurn` change in §6 Risk 1.)
- `getMode`/`setMode` read/write `state.mode` so arrival/question mode is shared
  across surfaces (today's `useSageStore.mode` behavior).

### 3.4 `ChatSessionProvider` + `useChatSessionContext`

The provider is the **single place** `useChatSession` is invoked. Surfaces never
call `useChatSession` directly — they consume context. This guarantees
one-engine-per-conversation.

```ts
// services/chat/ui/v1/core/ChatSessionProvider.tsx  (design sketch — signatures only)

export interface ChatSessionProviderProps {
  mode: ChatSessionMode
  instanceKey?: string        // singleton only
  children: React.ReactNode
}

/** Calls useChatSession(config) ONCE; provides the ChatSession via context. */
export function ChatSessionProvider(props: ChatSessionProviderProps): JSX.Element

/** Surface-side consumer. Throws if used outside a provider. */
export function useChatSessionContext(): ChatSession
```

### 3.5 How consumers opt in

**jefflougheed — singleton (Hero + Overlay share one conversation):**

```
// app/(jefflougheed)/ — at the common ancestor of Hero and Chat
<ChatSessionProvider mode="singleton" instanceKey="sage">
  <Hero />     // calls useChatSessionContext()
  <Chat />     // calls useChatSessionContext()  (overlay + #chat anchor)
  <Nav />      // shell-state expand() lives elsewhere — see §6 Risk 4
</ChatSessionProvider>
```

**Heirloom — isolated (one panel, one instance):**

```
// app/heirloom/ — around the panel, where ChatProvider sits today
<ChatSessionProvider mode="isolated">
  <ChatHero />  // Sidebar / MessageList / ChatInput call useChatSessionContext()
</ChatSessionProvider>
```

The only difference is `mode` (and `instanceKey` for singleton). Both shells
read the identical `ChatSession` contract.

---

## 4. Fit into the target structure

From the audit's target layout, this design populates the session core:

```
services/chat/ui/v1/
  types.ts                 ← + UIMessage, ChatMode re-exports used by the store
  registry.ts              ← (exists) markers — unchanged by this work
  useChatTurn.ts           ← (exists) engine — minor change: engine state → store (§6 R1)
  core/
    store.ts               ← createChatSessionStore + ChatSessionState/Store types   (NEW)
    store-registry.ts      ← singleton registry (client-only)                        (NEW)
    useChatSession.ts      ← the core hook (this doc §3.3)                            (NEW)
    ChatSessionProvider.tsx← provider + useChatSessionContext (this doc §3.4)        (NEW)
```

- The provider supersedes Heirloom's `ChatProvider` conversation responsibility
  and jefflougheed's `useSageStore` **conversation slice**.
- `useChatTurn` stays the engine; `useChatSession` is the store-aware wrapper
  that constructs accessors and owns store resolution.
- The barrel (`index.ts`) keeps **not** re-exporting client hooks, so the
  server-safe registry import path is preserved (per CLAUDE.md note on the
  client/server split). `ChatSessionProvider`/`useChatSession` are imported
  directly from their modules, like `useChatTurn` is today.
- Capability hooks (booking, session history, persistence, keyboard, arrival)
  layer **on top** of `ChatSession` in later phases; they are out of scope here
  but constrained by it — they read the same shared instance via context.

---

## 5. Migration safety — confirming the invariant holds

**The invariant to defend:** *A message, sessionId, streaming state, mode, and
error/retry context produced on any participating surface are observed
identically on every other participating surface in the same conversation; and
isolated instances never share.*

Per CLAUDE.md: tests are written **before** implementation; static checks run in
the sandbox; **runtime behavior is verified on Vercel preview**, not local dev.

### 5.1 Unit tests (sandbox, written before extraction)

1. **Singleton sharing** — render two consumers under one
   `<ChatSessionProvider mode="singleton" instanceKey="t">`; mutate via consumer
   A (mock `send`); assert consumer B observes the same `messages`,
   `isStreaming`, `sessionId`, `mode`.
2. **Isolated isolation** — two separate `mode="isolated"` providers; mutate one;
   assert the other is unchanged.
3. **Registry identity** — `getSingletonStore('x') === getSingletonStore('x')`;
   `getSingletonStore('x') !== getSingletonStore('y')`; isolated never calls the
   registry.
4. **Single session create** — with `fetch` mocked, sending from two different
   surfaces under one singleton provider fires `POST /api/sessions` **once**;
   subsequent `PATCH /api/sessions/[id]` reuses the same id.
5. **Shared retry** — error raised on a turn sent from surface A is observable as
   `isError` on surface B, and `retry()` invoked from surface B replays the same
   last turn (guards the §6 Risk 1 behavior change).
6. **SSR safety** — importing the registry module and rendering on the server
   does not create or leak singleton state across simulated requests (§6 Risk 5).

### 5.2 Preview verification (Vercel, manual checklist)

On the jefflougheed preview deploy:

1. Type in Hero → send → open Overlay: transcript present; Network shows a
   **single** `POST /api/sessions`, then `PATCH` on the same id.
2. Send from Overlay → collapse → Hero shows the reply.
3. Start a stream in Hero → open Overlay mid-stream: streaming pip active, tokens
   continue to land in both.
4. Trigger an error (force a 500) → confirm error block + working **Retry** from
   *both* Hero and Overlay.
5. Deep-link `/#chat?mode=question` → both surfaces reflect question-mode
   greeting/behavior (shared `mode`).
6. Refresh: no behavioral regression (widget persistence, if later enabled, is a
   separate phase and must not be assumed here).

On the Heirloom preview deploy:

7. Full send/stream/persist lifecycle unchanged; Recent/New Chat/load unaffected
   (those are capability hooks layered later, but must not regress when the
   provider swaps in).

### 5.3 Behavioral-parity baseline

Before extraction, record current behavior so the diff is intentional:

- Hero+Overlay **do** share conversation/sessionId/streaming today.
- Retry is **surface-local** today. v2 makes it shared (improvement). This is the
  one intended behavior change and must be explicitly signed off (§6 Risk 1).

---

## 6. Risks & open questions (resolve before implementation)

**Risk 1 — Engine state moves into the shared store (intended behavior change).**
Today `isError` and retry context are per-engine-instance, so retry is
surface-local. The single-provider design makes them shared, so retry works from
any surface. This is an improvement but a change. *Decision needed:* confirm
shared retry is desired (recommended: yes). It also requires a **minor change to
`useChatTurn`** so it writes `isStreaming`/`isError`/retry-context through the
store rather than only local React state — or, alternatively, keep `useChatTurn`
as-is and rely solely on the one-provider guarantee. *Recommendation:*
single-engine-via-provider as the primary mechanism; push engine state into the
store so the module registry can also keep state convergent if duplication ever
occurs.

**Risk 2 — Provider placement on jefflougheed.** The design requires Hero and
Chat to share a mountable common ancestor in `app/(jefflougheed)/`. They are
siblings under the page today (overlay is fixed-position, DOM ancestry intact),
so this holds — but the exact mount tree must be confirmed when wiring the
provider, and the provider must wrap **both** plus Nav/Work (which call
`expand()`/shell actions). *Open:* verify the precise file
(`app/(jefflougheed)/page.tsx` vs `layout.tsx`) for provider placement.

**Risk 3 — One engine vs N engines.** Canonical setup is one provider → one
engine. The module registry only protects state convergence, not duplicate
network calls; if two providers ever mount with the same key, two engines could
double-fire `send`. *Mitigation/decision:* document and lint against more than
one provider per `instanceKey`; treat multiple providers as a bug, not a
feature.

**Risk 4 — Shell/presentation state is out of scope but also shared.**
`isExpanded` / `expand` / `collapse` (Nav, overlay, Work), `composerRef` /
`focusComposer`, `visitorName`, `hasGreeted` are **shell** state, not
conversation state, yet several are shared across surfaces too. This design
deliberately excludes them from `useChatSession` (single responsibility).
*Open:* they need a **parallel** shared mechanism (e.g. a widget-shell store
using the same singleton pattern). Recommend a separate `useWidgetShell` store
rather than overloading the session. Must be designed in the shell phase so
`expand()` keeps working across Nav → Overlay.

**Risk 5 — SSR / module-singleton hazard.** A module-level registry on the
server is per-process and shared across requests — seeding state there would leak
one visitor's conversation into another's. *Mitigation:* the registry and its
stores are **client-only**, lazily instantiated on first client access; never
read/written during SSR. Isolated mode (`useRef`) is inherently safe. This must
be enforced and unit-tested (§5.1.6).

**Risk 6 — Canonical message shape is a prerequisite.** `useChatSession`
standardizes on a canonical `UIMessage` (id, role, content, timestamp). The
audit's Phase 0 (reconcile jefflougheed `SageMessage.timestamp: number` vs
Heirloom `Message.timestamp: Date`, and freeze the persisted
`chat_sessions.messages` jsonb shape) must land first, or the store will persist
mixed shapes. *Dependency:* Phase 0 before this extraction.

**Risk 7 — Store technology choice.** Recommend Zustand vanilla
(`createStore`) for the core store to keep `useSyncExternalStore` semantics
proven and to ease the jefflougheed migration; Heirloom's reducer is replaced.
*Decision needed:* confirm Zustand-vanilla over a hand-rolled store.

**Risk 8 — `instanceKey` namespace.** Singleton is keyed; document a single
reserved key per app (`"sage"` for jefflougheed) to avoid accidental collision
or accidental splitting. Multi-tenant-on-one-page is not a current scenario.

---

## Summary

The shared-conversation behavior jefflougheed depends on is currently an
implicit side effect of a module-level Zustand store. v2 makes it **explicit**:
one `useChatSession` core, two store-binding modes (`singleton` via a
client-only keyed registry, `isolated` via a ref-local store), consumed
uniformly through one `ChatSessionProvider` per conversation. Heirloom is the
isolated reference; jefflougheed Hero + Overlay is the singleton reference. The
invariant is defended by unit tests (sharing, isolation, single-create, shared
retry, SSR safety) and preview checks before the originals are deleted. The open
decisions — shared retry, provider placement, shell-state split, SSR guard,
Phase-0 message canonicalization — are listed in §6 and should be signed off
before code starts.
