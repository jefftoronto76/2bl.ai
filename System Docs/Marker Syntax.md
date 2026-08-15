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
  **Fallback (per CLAUDE.md's marker fallback principle):** the LLM emitting
  this marker is the fast path, not the only path — `SaveChatCTA.tsx`
  (`components/shells/membership/`) renders a "Save this chat" button once
  `messages.length >= 4` and the visitor is not yet a member, independent of
  whether `[ACCOUNT_CREATE:]` ever fired. It opens the same magic-link/OTP
  flow, pre-filling name/email/phone by re-scanning the transcript for
  `[NAME:]`/`[EMAIL:]`/`[PHONE:]` at click time. This is the turn-count-gated
  CTA pattern named directly in CLAUDE.md's principle.
  **Deterministic sources, not just the LLM (three as of 2026-08-14):**
  the registry's `.parse()` runs over every assistant message's raw content
  regardless of where it came from, so `chatStore.tsx`'s one-time auto-greet
  effect can and does emit this marker itself via `injectAssistantMessage`
  (a synthetic message, no LLM round-trip) — `MagicLinkCard` renders
  identically either way, whether the marker came from the model or from
  this effect. Three deterministic reasons, one per invite-adjacent signup
  path, checked in order — the `reason` field itself is display-only in all
  three cases; `MagicLinkCard` renders identically regardless of its value,
  used only for the muted subheading shown under the card, and doesn't
  affect routing:
  1. `[ACCOUNT_CREATE: story invite]` (added 2026-08-11,
     story-invite-first-run) — a not-signed-in visitor who arrived via a
     valid `?join=` story-invite link.
  2. `[ACCOUNT_CREATE: admin invite]` (added 2026-08-13, PR #367) — a
     not-signed-in visitor who arrived via a valid `?invite=` admin/member
     invite token, personalized with `invitedName` in the preceding
     greeting when the admin set one — mutually exclusive with the
     story-invite branch above, both structurally (this branch is an
     `else if`) and via an explicit `!storyInviteTokenRef.current` guard.
  3. `[ACCOUNT_CREATE: expired invite]` (added 2026-08-14,
     expired-invite-chat-first) — a not-signed-in visitor whose `?invite=`
     token exists in the tenant's `members` table (`memberTokenExists`,
     distinguishing a real-but-expired/used/revoked token from a garbage
     query-param string) but didn't authorize them. No `invitedName`/story
     context available for this one, so the preceding greeting is generic:
     `"Looks like that invite link didn't work — but I can still get you
     set up."` This is also the only one of the three that required a
     gate-formula change (`isGated`) rather than just a new greet branch,
     since this population previously never reached the chat at all —
     `GateView`'s Clerk-modal button handled it instead. See the
     `chatStore`/`GateView` rows in `System Docs/Public Site.md` for the
     full greet/account-create/failure-fallback sequence and the gate
     bypass mechanics each of these belongs to.

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

### `[MEDIA_UPLOAD: filename | media_item_id | type]` / `[MEDIA_UPLOAD_FAILED: filename]` / `[MEDIA_UPLOAD_DUPLICATE: filename | media_item_id | type | status]` — dispatch `client`

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
- `[MEDIA_UPLOAD_DUPLICATE: filename | media_item_id | type | status]` —
  written by `ChatInput.tsx` instead of `MEDIA_UPLOAD` when a content-hash
  match reuses an existing `media_items` row instead of a fresh upload.
  Parsed by `MEDIA_UPLOAD_DUPLICATE_MARKER` (`services/chat/ui/v1/registry.ts`,
  added after the two markers above). Same rationale as `MEDIA_UPLOAD` above
  (registered purely so it strips cleanly everywhere except its real
  consumer): `MessageList.tsx`'s own `MEDIA_UPLOAD_DUPLICATE_RE` is the real
  consumer, rendering the reused item's thumbnail with a
  `duplicateLabelForStatus` status chip (via `UploadThumbnail.tsx`'s
  `duplicateLabel` prop) instead of treating it as a fresh attachment.
  `status` is the matched row's status **at match time** — the renderer
  prefers the live status off `mediaItems` (chatStore) when available,
  falling back to this captured value only before that catches up.
- The three parsers used to define this syntax as independent regexes each,
  correct only because nobody had changed any of them out of sync. As of
  2026-08-09 the regex source is canonical in
  `services/chat/ui/v1/mediaMarkerPatterns.ts` — `MessageList.tsx`'s parser
  and `registry.ts`'s three `MarkerDefinition`s each construct their own
  `RegExp` from that one shared source string, so the syntax can only be
  changed in one place.
- **Chat title generation is a third real consumer, fixed 2026-08-14.**
  A session's title (both the client-derived fallback and the payload sent
  to the AI title-generation call) is built directly from the session's
  first user message's raw stored content — the same content this marker
  gets written into. Neither `components/shells/membership/chatStore.tsx`'s
  `deriveSessionTitle` nor `services/chat/ui/v1/persistence.ts`'s
  `deriveTitle` (the shared local IndexedDB thread-index title, used by
  both chat surfaces) stripped this syntax before that date — a media-only
  first turn (an attachment with no typed caption) rendered its title as
  the raw `[MEDIA_UPLOAD: filename | media_item_id | type]` bracket text
  verbatim, a real, confirmed production case. Fixed by adding
  `titleSourceFromContent` to `mediaMarkerPatterns.ts` — strips all three
  marker types (also covering `MEDIA_UPLOAD_DUPLICATE`) and, when that
  leaves nothing (the attachment-only case), returns a short type-aware
  fallback (`'Photo shared'` / `'Audio shared'` / `'Document shared'`, or
  `'Attachment shared'` for a bare `MEDIA_UPLOAD_FAILED` marker, which
  carries no type field) instead of empty string. Both call sites above now
  route through it — `chatStore.tsx` also uses the same stripped text for
  the `firstUserMessage` field it sends to `POST /api/sessions/[id]/title`,
  so the AI title-generation prompt itself never sees raw bracket syntax
  either, not just the client-rendered fallback title. See
  `services/chat/ui/v1/mediaMarkerPatterns.test.ts` for coverage of all
  three marker types plus the plain-caption and no-marker passthrough cases.

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
