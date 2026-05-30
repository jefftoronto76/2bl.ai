# Chat Shells

Authoritative reference for the two chat shells in the 2bl.ai platform.

Related: `docs/chat-ui-v2-design.md` (shared-session pattern design, not yet implemented).

---

## 1. The two shells

### Widget shell — jefflougheed.ca pattern

Two surfaces share one conversation. The page exists independently of the chat;
the chat is a feature layered on top of it.

| Surface | File | Role |
|---------|------|------|
| `Hero` | `src/components/Hero.tsx` | Inline chat embedded in the `#hero` section. Always mounted; keyboard handling via CSS vars. |
| `Chat` | `src/components/Chat.tsx` | Full-viewport overlay. `position: fixed; top: 0; height: 100dvh`. Toggled open/closed. |

Both surfaces share **one conversation** via `ChatSessionProvider` with
`instanceKey="sage"` (singleton mode in `useChatSession` — see
`docs/chat-ui-v2-design.md` §2). Until the v2 extraction ships, they share
state through the module-level Zustand store `useSageStore`
(`src/lib/store.ts`), which is `create(...)`'d once at module scope so every
subscriber reads and writes the same store object.

**Shell state vs conversation state:**

- Shell state — `isExpanded`, `expand()` / `collapse()`, `composerRef`,
  `mode` — lives in `useSageStore`. Only the widget shell owns this layer;
  neither `Heirloom` nor any future membership shell reads it.
- Conversation state — `messages`, `sessionId`, `isStreaming` — is the shared
  slice both Hero and Chat write through identical `ChatEngineAccessors`
  that call `useSageStore.getState()`.

**Keyboard handling — widget surfaces differ from each other:**

- `Hero` (inline): no body scroll-lock. A `visualViewport` listener writes
  `--kb-surface-h` and `--kb-surface-y` CSS vars onto `chatSurfaceRef`, and
  flips `.chat-surface--kb` on the surface element when the keyboard opens.
  The composer is pinned above the keyboard using `transform` + height via
  these vars — no `position: fixed` on the surface (see §3 for why).
- `Chat` (overlay): `trackViewport: false`, `lockBodyScroll: true`,
  `active: isExpanded`. Scroll-lock freezes the page (`position: fixed` +
  `top: -scrollY`, restored on close). Keyboard handling is pure CSS —
  `height: 100dvh` + `env(safe-area-inset-bottom)` on the composer tray.
  A `visualViewport` listener pins the overlay height/position via inline
  `style.height` and `style.transform = 'translateY(vv.offsetTop)'` —
  compositor transform, not `top`, so no reflow while the keyboard animates.

---

### Membership shell — Heirloom pattern

A slide-in modal panel. The chat is the primary product UI; the landing page is
context behind the panel, not a co-equal surface.

| Component | File | Role |
|-----------|------|------|
| `HeirloomPage` | `app/heirloom/page.tsx` | Root. Mounts `ChatProvider`, renders `<LandingPage>` with the panel layered over it. |
| `ChatHero` | `components/shells/membership/ChatHero.tsx` | Panel body: `Sidebar` + header + message area + input. |
| `ChatHeader` | `components/shells/membership/ChatHeader.tsx` | Panel header — "Your Story" label + Account / Close buttons. |
| `ChatInput` | `components/shells/membership/ChatInput.tsx` | Auto-growing textarea, Enter-to-send, ArrowUp send button. |
| `MessageList` | `components/shells/membership/MessageList.tsx` | Renders turns; auto-scrolls to bottom; bouncing-dots typing indicator. |
| `Sidebar` | `components/shells/membership/Sidebar.tsx` | Collapsible nav — New Chat, Recent sessions (signed-in), session load. |

**Store:** `useReducer` in `components/shells/membership/chatStore.tsx` via
`ChatProvider`. Isolated mode — no `instanceKey`. State includes `messages`,
`sessionId`, `isLoading`, `isChatOpen`, `isSidebarExpanded`, `hasStarted`.
`sendMessage` is the shared `useChatTurn().send` wired through
`ChatEngineAccessors` adapting the reducer.

**Panel geometry** (`app/heirloom/page.tsx`): `position: fixed; top: 0;
right: 0; h-full; max-w-2xl`. Slides in from the right via
`translateX(100%)` (closed) → `translateX(0)` (open). A `bg-black/50
backdrop-blur-sm` backdrop renders only while open. Escape key and
backdrop click both dispatch `CLOSE_CHAT`. Panel carries `role="dialog"` /
`aria-modal` / `aria-hidden`.

**Keyboard handling:** `useKeyboardViewport({ active: isChatOpen,
lockBodyScroll: true })`. Returns `{ keyboardOpen, height }`. While the
panel is open, the surface section shrinks to `height`px via inline style
when the keyboard is open. Body scroll-lock is always on while the panel
is open.

**Persistence:** best-effort localStorage buffer via
`services/chat/ui/v1/persistence.ts`. Threads stored under
`heirloom:chat:v1:session:<id>`, pre-session threads under a draft slot.
Signed-in users also get DB recovery via `GET /api/sessions`; DB wins
over the local buffer only when `updated_at` on the DB session is strictly
newer.

---

## 2. Choosing a shell for a new product

| Situation | Shell |
|-----------|-------|
| AI assistant is one feature on a marketing or content page. The page lives on its own. Multiple surfaces (inline + overlay) must share one conversation. No panel chrome needed. | **Widget** |
| Chat is the product, or the primary interface. Full-panel UI with sidebar, session history, account features. One surface drives the conversation. | **Membership** |

**Rule:** if the AI chat is a feature on a page, use widget. If the page IS the
chat (or the chat is the primary product UI), use membership.

---

## 3. useKeyboardViewport

**File:** `services/chat/ui/v1/core/useKeyboardViewport.ts`

Listens to `visualViewport` resize and scroll events, tracks keyboard open/close,
and optionally freezes body scroll. SSR-safe — no-ops without the VisualViewport
API. No-ops when `active: false`.

### Options

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `active` | `boolean` | `true` | Enable the hook. When `false`, no listeners attach and no scroll-lock is applied. |
| `lockBodyScroll` | `boolean` | `false` | Freeze body scroll while active (`position: fixed` + `top: -scrollY`; restores on deactivate). |
| `trackViewport` | `boolean` | `true` | Attach `visualViewport` resize/scroll listeners and return live `height` / `offsetTop` / `keyboardOpen`. Set to `false` to get scroll-lock only. |
| `keyboardThreshold` | `number` | `120` | px below `window.innerHeight` at which the keyboard is considered open. |
| `onViewportChange` | `(vv: { height, offsetTop, keyboardOpen }) => void` | — | Called on every viewport change event. Use to write CSS vars or inline styles without re-rendering. |

### Return value

```ts
{
  height: number        // current vv.height (window.innerHeight when not tracking)
  offsetTop: number     // current vv.offsetTop (0 when not tracking)
  keyboardOpen: boolean // true when vv.height < window.innerHeight * keyboardThreshold
  sync: () => void      // call once on open to prime values before the first event
}
```

### How each surface wires it

**Hero — widget, inline surface**

```ts
useKeyboardViewport({
  trackViewport: true,   // default
  lockBodyScroll: false, // no body lock — page scrolls freely under the inline surface
  onViewportChange: ({ height, offsetTop, keyboardOpen }) => {
    // write CSS vars onto the chat surface element; no React re-render needed
    chatSurfaceRef.current?.style.setProperty('--kb-surface-h', `${height}px`)
    chatSurfaceRef.current?.style.setProperty('--kb-surface-y', `${offsetTop}px`)
    chatSurfaceRef.current?.classList.toggle('chat-surface--kb', keyboardOpen)
  },
})
```

`position: fixed` is intentionally NOT used on inline surfaces. iOS treats a
`position: fixed` element as part of the layout viewport, which causes the
keyboard to stop firing `visualViewport` events — making keyboard detection
impossible. The CSS-var approach with `transform`/height keeps the composer
above the keyboard without triggering this iOS restriction.

**Chat — widget, overlay**

```ts
useKeyboardViewport({
  trackViewport: false,  // overlay uses pure CSS keyboard handling
  lockBodyScroll: true,
  active: isExpanded,    // lock/unlock as the overlay opens/closes
})
```

The overlay's keyboard handling is pure CSS — `height: 100dvh` resizes as
the keyboard opens on iOS 17.4+; the composer tray uses
`pb-[max(12px,env(safe-area-inset-bottom))]`.
Body scroll-lock here uses `position: fixed` because the overlay IS a
modal — the body scroll restriction is the desired behavior, and iOS
keyboard detection is not needed (keyboard handling is CSS-driven).

**ChatHero — membership panel**

```ts
const { keyboardOpen, height } = useKeyboardViewport({
  active: state.isChatOpen,
  lockBodyScroll: true,
  trackViewport: true,   // default — panel shrinks to visual viewport height
})
```

The panel surface section gets `style={{ height: keyboardOpen ? height : undefined }}`
— when the keyboard opens, the surface collapses to the visual viewport
height so the composer is not hidden behind the keyboard. Body lock is
always on while the panel is open because the panel is a modal surface.

---

## 4. Adding a new product

### Step 1 — choose the shell

Apply the rule from §2.

### Step 2a — widget shell

1. Mount `<ChatSessionProvider instanceKey="<product-key>">` at the common
   ancestor of all surfaces that must share the conversation (in the product
   layout or page root). The `instanceKey` must be unique across the application.
2. Each surface calls `useChatSessionContext()` to get `messages`,
   `sessionId`, `send`, `isStreaming`, `isError`, `retry`.
3. Wire keyboard handling via `useKeyboardViewport` per the patterns in §3:
   - Inline surfaces: `trackViewport: true`, no scroll-lock,
     `onViewportChange` writes CSS vars.
   - Overlay surfaces: `trackViewport: false`, `lockBodyScroll: true`,
     `active: isOpen`.
4. Shell-level state (open/close, composer ref) belongs in a product-local
   Zustand store or `useState` — not in the session provider.

### Step 2b — membership shell

1. Wrap the panel root in `<ChatProvider>` (or equivalent `useReducer` context).
   Do not pass an `instanceKey` — isolated mode, one surface, one conversation.
2. `useChatSession({})` (no `instanceKey`) inside the provider gives the
   isolated conversation instance.
3. Wire `useKeyboardViewport({ active: isChatOpen, lockBodyScroll: true })`
   in the panel root component. Use the returned `height` to shrink the surface
   when `keyboardOpen` is true.
4. Panel geometry: `position: fixed; top: 0; right: 0; h-full; max-w-<size>`.
   Slide in via `translateX` transition. Escape + backdrop click close it.
   `role="dialog"` / `aria-modal` / `aria-hidden` are required.

### Step 3 — brand tokens

Add `app/<product>/globals.css` with `:root` token overrides for the product
palette. Import it only from `app/<product>/layout.tsx` — the import boundary
is what isolates the tokens so they do not bleed into other routes.

See CLAUDE.md "Design System" for the token table, font scoping rules, and
existing per-product files.

### Step 4 — API and tenant

`/api/sage` resolves the tenant from the request Host header via
`getTenantFromRequest`. Until a `master_prompt` row exists for the tenant,
the route falls back to `DEFAULT_SYSTEM_PROMPT` — the chat streams, but
answers as the generic Sage persona.

To wire a real tenant:

1. Add a row to `tenants` in Supabase Studio with the product domain in
   `tenants.domain`.
2. Optionally seed a `master_prompt` row for the tenant.
3. `sage_parameters` rows (booking cards) are per-tenant — add them via
   the admin Settings page or directly in Studio.

### Step 5 — middleware routing

The host-to-route rewrite lives in `middleware.ts`. Add the new product host
to the appropriate host set or define a new set, then add a rewrite block
mirroring the SBL or Heirloom pattern:

```ts
// example — new product host set
const NEWPRODUCT_HOSTS = new Set(['newproduct.2bl.ai'])

// in the middleware:
if (NEWPRODUCT_HOSTS.has(host) || pathname.startsWith('/newproduct')) {
  response.headers.set('x-newproduct', '1')
  if (!pathname.startsWith('/newproduct')) {
    return NextResponse.rewrite(
      new URL('/newproduct' + (pathname === '/' ? '' : pathname), request.url),
      { headers: response.headers }
    )
  }
}
```

Guard: `/admin` and `/api/*` paths must be excluded from the rewrite (mirror
the `isAdminPath` / `isApiPath` guards on the existing blocks). No code change
is needed for the prompt or session DB once the tenant row exists.

---

## 5. ChatConfig — conceptual shape

`ChatConfig` is documented in `docs/chat-ui-v2-design.md` as the design-time
contract for future capability wiring. It is not yet implemented as a runtime
object — today each shell wires capabilities by convention.

```ts
interface ChatConfig {
  // Shell selection
  shell: 'widget' | 'membership'
  instanceKey?: string // singleton mode only; omit for isolated

  // Capabilities — not shell-locked.
  // A widget may enable session history; a membership may enable booking.
  capabilities?: {
    booking?: boolean        // [BOOKING:] card rendering + /api/sage/parameters
    sessionHistory?: boolean // GET /api/sessions + Recent sidebar
    persistence?: boolean    // localStorage buffer (Heirloom today)
  }

  // Brand tokens come from the route-scoped CSS file, not from config.
}
```

**Current wiring by convention:**

| Capability | Widget (jefflougheed) | Membership (Heirloom) |
|------------|----------------------|-----------------------|
| Booking cards | Yes — `useSageParameters` + `BookingCard` in `src/components/sage/` | No |
| Session history | No | Yes — `GET /api/sessions` + Recent sidebar |
| localStorage persistence | No | Yes — `services/chat/ui/v1/persistence.ts` |

When `ChatConfig` is formalized in a later phase, the convention becomes
explicit configuration — no behavior change, just a declared contract that
makes the per-shell capability matrix reviewable in one place.
