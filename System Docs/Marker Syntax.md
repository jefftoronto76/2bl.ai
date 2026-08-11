# Marker Syntax

## Marker Syntax

Sage emits structured **markers** in bracket syntax that the chat parses at
render time. The marker registry (`services/chat/ui/v1/registry.ts`) is the
canonical parser; each marker has a **dispatch surface**:

- **`client`** — rendered into UI (e.g. `[BOOKING:]` → a booking card).
- **`server`** — persisted server-side in `onFinish` (e.g. `[NAME:]` →
  `chat_sessions.visitor_name`); never rendered.

**Two rules hold for every marker regardless of dispatch:**
- It is **stripped from displayed prose client-side** — a `server` marker is
  persisted, not shown, but it must never leak as raw text. Client render paths
  (`parseBookingCards`, Heirloom `MessageList`) use `createDefaultRegistry()`,
  which preloads every marker.
- A **trailing incomplete `[MARKER:` fragment still streaming** is stripped, so
  a half-open marker never flashes as prose.

### `[BOOKING: label | description | cta_label | url]` — dispatch `client`

- One card per line, on its own line at the end of the assistant message —
  never inline, never mid-message.
- `label`, `description`, `cta_label`, `url` correspond to the
  `sage_parameters` columns of the same name.
- **Server injection** (`services/chat/server/booking.ts`, via `/api/sage`):
  when a tenant is resolved, the route fetches its `sage_parameters` rows and
  appends a "Booking cards" section to the system prompt — one `[BOOKING: ...]`
  line per parameter. Omitted when the tenant has no parameters.
- **Client render**: the registry returns each completed match as
  `BookingCardData`; prose renders via `ReactMarkdown` and each card renders as
  a `BookingCard` (Tailwind, white background, `#2d6a4f` CTA) below the prose in
  the assistant-aligned column.

### `[NAME: firstname]` — dispatch `server`

- Captures the visitor's first name. **Server detection**:
  `detectVisitorNameMarker` (`services/crm/session.ts`) scans the final
  assistant message in `handleSessionFinish`, titlecases, runs `isPlausibleName`,
  and persists to `chat_sessions.visitor_name`. Stripped from prose client-side
  (not rendered). The Haiku extractor was removed in PR #46 and replaced with
  the same dual-path pattern documented for `[EMAIL:]`/`[PHONE:]` below:
  `detectNameInText` (also in `session.ts`) is a conservative regex fallback —
  anchored on explicit self-introduction cues ("my name is", "name's", "call
  me", "this is") — that scans the visitor's own message and runs only when
  the `[NAME:]` marker path did not capture.

### `[EMAIL: address]` — dispatch `server`

- Captures the visitor's email. **Server detection**:
  `detectVisitorEmailMarker` (`services/crm/session.ts`) scans the final
  assistant message in `handleSessionFinish`, lowercases, runs `isPlausibleEmail`
  (single `@`, dotted domain, no internal whitespace), and persists to
  `chat_sessions.email` via `persistVisitorEmail` (self-guards against
  overwriting an already-captured email). Stripped from prose client-side (not
  rendered). The email block runs **before** the name flow's early returns in
  `handleSessionFinish`, so name and email both capture in one turn. Emission is
  driven by the contact-capture instruction in `DEFAULT_SYSTEM_PROMPT`
  (`services/prompt/sage-prompt.ts`) — required for fallback-prompt surfaces
  (e.g. Heirloom) that have no tenant `compiled_prompts`.

### `[PHONE: value]` — dispatch `server`

- Captures the visitor's phone. **Server detection**:
  `detectVisitorPhoneMarker` (`services/crm/session.ts`) scans the final
  assistant message in `handleSessionFinish`, trims, runs `isPlausiblePhone`
  (must contain a digit and be at least 7 chars), and persists the value
  **verbatim** (no normalization) to `chat_sessions.phone` via
  `persistVisitorPhone` (self-guards against overwriting an already-captured
  phone). Stripped from prose client-side (not rendered). The phone block runs
  alongside the `[EMAIL:]` block, **before** the name flow's early returns in
  `handleSessionFinish`, so all of name / email / phone can capture in one turn.
  Mirrors `[NAME:]` / `[EMAIL:]` exactly. (Phone is also captured independently
  from the visitor's own message by the visitor-message contact watcher; both
  paths share the self-guarded `persistVisitorPhone`.)

### MEMBER CONTEXT block — not a `[bracket]` marker

Unlike the entries above, `MEMBER CONTEXT:` is not parsed by the client-side
marker registry — it never appears in the assistant's reply at all. It's a
section the **server** injects into the *system prompt* (not the
conversation) whenever an authenticated or invite-holding Heirloom member
resolves for the turn — see `System Docs/Utilities/Chat Server.md` for the full
mechanism (`services/chat/server/member-context.ts`). It's documented here
because the compiled prompt's contact-capture instructions (see the
`[NAME:]`/`[EMAIL:]`/`[PHONE:]` entries above) reference it directly: "if a
MEMBER CONTEXT block is present in your context and provides a name, email,
or phone number, emit the corresponding hidden marker(s) in your very first
reply." As of 2026-07-31 the block is always-on (present on every turn a
member resolves, not just once ever), and "your very first reply" is backed
by a server-computed `isFirstTurn` signal rather than the model's own
judgment — so the markers above only actually fire from this path on a
session's genuine first assistant turn, not repeatedly.

### `[ACCOUNT_CREATE: reason]` — dispatch `client`

- Signals the membership shell (Heirloom) to render a `MagicLinkCard` inline
  below the assistant prose, with `reason` (e.g. `claim_membership`) passed
  through to the card. Parsed by `ACCOUNT_CREATE_MARKER`
  (`services/chat/ui/v1/registry.ts`) and consumed by
  `components/shells/membership/MessageList.tsx`. Stripped from prose in every
  other context (widget shell, admin transcript) via `createDefaultRegistry()`.
  **Second, deterministic source (added 2026-08-11, story-invite-first-run):**
  the registry's `.parse()` runs over every assistant message's raw content
  regardless of where it came from, so `chatStore.tsx`'s story-invite greet
  effect emits `[ACCOUNT_CREATE: story invite]` itself via
  `injectAssistantMessage` (a synthetic message, no LLM round-trip) for a
  not-signed-in visitor who arrived via a story invite link — `MagicLinkCard`
  renders identically either way. See the `chatStore` row in
  `System Docs/Public Site.md` for the full greet/account-create/failure-
  fallback sequence this belongs to.

### `[SAVE_MEMORY]` — dispatch `client`

- Bare marker, no field (confirmed against the live Heirloom compiled
  prompt — not `[SAVE_MEMORY: reason]` like `ACCOUNT_CREATE`). A guide-emitted
  signal ("enough has surfaced, write this one up") that `MessageList.tsx`
  watches for on a finished assistant reply and dispatches to the exact same
  `memories.create()` the manual bookmark button calls — a second trigger for
  that one action, not a separate save path. Parsed by `SAVE_MEMORY_MARKER`
  (`services/chat/ui/v1/registry.ts`) and stripped from prose in every
  context via `createDefaultRegistry()`. See `System Docs/Public Site.md`'s
  memory bookmark row and `Utilities/Chat UI.md`'s `useMemories.ts` row for
  the create/error/retry mechanics this feeds into.

### `[MEMORY_TITLE: short title]` — dispatch `server`

- Optional title override for a memory bookmark, resolved server-side at
  create time — `services/crm/memories.ts`'s `createMemoryFromAnchor` reads
  it directly off the anchor message's own stored content (the same pattern
  `NAME`/`EMAIL`/`PHONE` use for server-side resolution rather than a client
  dispatch). Parsed by `MEMORY_TITLE_MARKER` (`services/chat/ui/v1/registry.ts`)
  and stripped from displayed prose everywhere, like every other marker, even
  though nothing client-side ever reads it directly. When absent,
  `deriveFallbackMemoryTitle()` derives one from the passage itself (60-char
  cap, breaks at the last full word).

### `[MEDIA_UPLOAD: filename | media_item_id | type]` / `[MEDIA_UPLOAD_FAILED: filename]` — dispatch `client`

- The one exception to this page's "Sage emits" framing: these are written
  into a **visitor** message's own stored content by the client-side upload
  flow (`ChatInput.tsx`), one per attachment, not emitted by the AI at all.
  The real consumer is `components/shells/membership/MessageList.tsx`'s own
  separate, purpose-built `MEDIA_UPLOAD_RE`/`MEDIA_FAILED_RE` parser
  (`parseUserMessage`), which extracts a structured `uploads`/`failures`
  array to drive thumbnail/failure-chip rendering — registering these in
  the shared registry does not replace that parser.
- Registered here (2026-08-08, `MEDIA_UPLOAD_MARKER`/`MEDIA_UPLOAD_FAILED_MARKER`,
  `services/chat/ui/v1/registry.ts`) purely so every OTHER consumer of the
  shared registry strips them from prose the same way every other marker
  is stripped. Fixes a real bug: `services/crm/memories.ts`'s
  `createMemoryFromAnchor` reads a message's raw stored content verbatim,
  and before this marker was registered, bookmarking a photo message via
  the whole-message "Keep this as a memory" button (as opposed to the
  per-photo Bookmark, `PhotoUploadActions.tsx`) left the raw
  `[MEDIA_UPLOAD: ...]` bracket text sitting in that memory's title and
  body, ahead of the person's own typed caption.
- The two parsers used to define this syntax as two independent regexes,
  correct only because nobody had changed either one. As of 2026-08-09 the
  regex source is canonical in `services/chat/ui/v1/mediaMarkerPatterns.ts`
  — both `MessageList.tsx`'s parser and `registry.ts`'s two `MarkerDefinition`s
  construct their own `RegExp` from that one shared source string, so the
  syntax can only be changed in one place.

### `[CONTACT: phone]` — **retired**

- The `[CONTACT:]` marker, its `'CONTACT'` `MarkerType` member, and the entire
  Heirloom `ContactCard` + `CAPTURE_CONTACT` store flow (including the inline
  Clerk phone/OTP sign-up + client `claimSession` call) have been removed.
  Heirloom contact capture now happens server-side via the **visitor-message
  contact watcher** (`detectPhoneInText` / `detectEmailInText` in
  `services/crm/session.ts`), which scans the visitor's own typed message for a
  phone/email rather than relying on Sage emitting a trigger marker and the
  visitor filling in an inline card.
- **Account creation is deferred.** The server-side claim infrastructure
  (`POST /api/sessions/[id]/claim`, `claimSession` in `services/crm/sessions.ts`,
  `ensureClerkUser`) is left in place but is now **client-orphaned** — no surface
  calls it. It is retained, reversible, for a future signed-in flow rather than
  torn out.

**Open behavior** (`open_as` / `embed_code`): The bracket syntax only
carries `label | description | cta_label | url` — `open_as` and
`embed_code` are intentionally excluded (embed snippets contain HTML/JS
with characters that'd break pipe delimiting, and we don't want the LLM
copying them verbatim). Instead, both `WidgetShellChat` and `WidgetShellHero`
(`components/shells/widget/WidgetShell.tsx`) fetch `/api/sage/parameters`
via `useSageParameters` and match each parsed card to a parameter by `url`:
- `open_as = 'new_tab'` (default): CTA renders as an `<a target="_blank" rel="noopener noreferrer">`.
- `open_as = 'popup'` (admin label "Inline") with non-empty `embed_code`:
  CTA renders as a `<button>`, and directly below the card there is a
  hidden ref'd container (`mt-2 w-full min-h-[700px]`). On click, the
  container is revealed and `injectInlineEmbed(container, embedCode)`
  re-materializes the snippet into live `<script>` / `<link>` nodes
  scoped to that container (setting `innerHTML` alone does not execute
  `<script>` tags). Handles both pure inline JS and HTML-with-
  `<script src="...">` fragments (e.g. Calendly's inline-widget
  snippet). The button disables itself after injection so subsequent
  clicks don't remount the widget.
- `open_as = 'popup'` with empty `embed_code`: falls back to new-tab
  behavior and `console.warn`s.

**Terminology note**: The DB value is still `'popup'` for historical
reasons, but the admin label and visitor-facing behavior are both
"Inline" — the embed renders directly below the booking card, not in a
popup overlay. Renaming the DB value would require a migration; the
label-only rename keeps the column untouched.

---
