// services/chat/ui/v1/types.ts
//
// Type contracts for the v1 chat engine UI layer: the marker registry and the
// useChatTurn hook. Types only — no runtime code, no React. The marker
// registry is the generalized successor to parseBookingCards: the AI emits
// structured markers (e.g. [BOOKING: ...]) and the engine detects, parses, and
// dispatches them to registered handlers. The useChatTurn contract is
// store-agnostic — it operates through injected accessors so a Zustand store
// (jefflougheed) and a useReducer context (Heirloom) can share one
// implementation.

import type { ChatMessage, ChatMode, ChatRole, MediaAttachmentInput } from '@/services/chat/server/types'

// ── Error classification ────────────────────────────────────────────────────

/**
 * Classifies why a chat turn ended without a normal completion, so each
 * surface can show on-brand, specific copy (see components/chat/errorCopy.ts)
 * instead of one generic "something went wrong." Persisted per-message
 * (UIMessage.error_type below) and per-session (chat_sessions.last_error_type)
 * — see useChatTurn.ts. `'user_stopped'` is the one member that isn't a
 * failure — the visitor deliberately hit Stop — but it's modeled as a class
 * here rather than a special-cased branch so it gets the same consistent
 * banner + persistence treatment as the other 5, regardless of whether any
 * content had streamed back yet when Stop was clicked (see
 * `finishAbortedTurn` in useChatTurn.ts).
 *
 * The last three members (`account_required`, `server_error`,
 * `invalid_response`) are produced only by the memory-bookmark create path
 * (services/chat/ui/v1/useMemories.ts) — useChatTurn.ts's own classifier
 * never throws them. They exist because the original 6 don't map cleanly
 * onto a memory-create failure: no member here fit a 5xx write failure, a
 * malformed-response contract mismatch, or (once artifacts.user_id became
 * required) an anonymous/unlinked member being rejected from saving. Neither
 * of these three is ever persisted to chat_sessions.last_error_type — that
 * column only ever receives what useChatTurn.ts's classifier produces.
 */
export type ChatErrorType =
  | 'network'
  | 'rate_limited'
  | 'stream_interrupted'
  | 'auth_error'
  | 'unknown'
  | 'user_stopped'
  | 'account_required'
  | 'server_error'
  | 'invalid_response'

// ── Canonical UI message ────────────────────────────────────────────────────

/**
 * The canonical in-memory message shape for every chat surface (Phase 0).
 *
 * Reconciles the two divergent shapes the surfaces carry today —
 * jefflougheed's `SageMessage` (`timestamp: number`) and Heirloom's `Message`
 * (`timestamp: Date`) — onto one contract so a shared session store and the
 * persisted `chat_sessions.messages` jsonb stop drifting per tenant.
 *
 * `timestamp` is **epoch milliseconds (number)**. This is the canonical form
 * both in memory and on the wire/DB: it is JSON-serializable with no Date
 * reviver, matches the live jefflougheed shape (so the dominant tenant needs no
 * change), and is trivially derived from a `Date` or an ISO string by the
 * adapters in `./message`. Every field is JSON-safe, so `UIMessage` IS the
 * frozen persisted shape — no separate serialized type is needed.
 *
 * The wire request to `/api/sage` still uses the leaner `ChatMessage`
 * (`{ role, content }`); `toChatMessage` in `./message` performs that
 * narrowing. `id`/`timestamp` are UI/persistence concerns the model never sees.
 *
 * Extension point: file-upload / voice attachments will extend this with an
 * optional `attachments` field in a later phase. It is intentionally omitted
 * here — that shape is not yet designed, and Phase 0 freezes only the text
 * contract.
 */
export interface UIMessage {
  /** Stable client id (e.g. crypto.randomUUID()) for React keys + dedupe. */
  id: string
  role: ChatRole
  content: string
  /** Epoch milliseconds. Canonical in-memory AND persisted representation. */
  timestamp: number
  /**
   * Delivery state of a user message's send attempt. User messages only —
   * assistant messages never carry this. 'sent' is the terminal success state
   * and renders no UI (a persistent "sent" chip is noise); absent/undefined is
   * equivalent to 'sent' for any pre-existing persisted message.
   */
  status?: 'sending' | 'sent' | 'failed'
  /**
   * True if the user hit Stop for this assistant message — regardless of
   * whether any content had streamed back yet. Always set on Stop (see
   * `finishAbortedTurn` in useChatTurn.ts); the message itself is always
   * kept, even with `content: ''`, so there is a durable record that a stop
   * happened rather than the turn silently disappearing.
   */
  stopped?: boolean
  /**
   * Regenerated reply variants for an assistant message, oldest first.
   * `content` is always the currently-displayed version — `versions` is an
   * additional history array alongside it, not an overlay `content` must be
   * resolved through (see services/chat/ui/v1/useChatTurn.ts `regenerate`).
   */
  versions?: string[]
  /** Index into `versions` of the currently-displayed version. */
  versionIdx?: number
  /**
   * Set when this message's turn ended without a normal completion (see
   * ChatErrorType above). For a genuine failure, the user message carries it
   * alongside `status: 'failed'`; the assistant placeholder carries it for
   * turns with no trackable user message (e.g. sendHidden). For a Stop
   * (`error_type: 'user_stopped'`), it's carried on the assistant message
   * alongside `stopped: true` — the user message's `status` stays `'sent'`,
   * since Stop is a deliberate choice, not a delivery failure. Absent/null on
   * every message whose turn completed normally.
   */
  error_type?: ChatErrorType | null
  /**
   * True once this user message has been edited and resent — renders the
   * "Edited" label (see components/chat/UserMessageActions.tsx). User
   * messages only.
   */
  edited?: boolean
}

// ── Marker contract ───────────────────────────────────────────────────────

/** Known structured markers the AI may emit in an assistant message. */
export type MarkerType = 'BOOKING' | 'NAME' | 'EMAIL' | 'ARTIFACT' | 'PHONE' | 'ACCOUNT_CREATE' | 'SAVE_MEMORY' | 'MEMORY_TITLE'

/**
 * Parsed data for an ACCOUNT_CREATE marker — `[ACCOUNT_CREATE: reason]`.
 * `reason` is free text the engine passes through, surfaced as a muted
 * subheading in the MagicLinkCard (e.g. "to save your memories").
 */
export interface AuthPromptData {
  type: 'ACCOUNT_CREATE'
  reason: string
}

/** A single marker extracted from an assistant message. */
export interface ParsedMarker {
  type: MarkerType
  /** Pipe-delimited field values, trimmed, in declaration order. */
  fields: string[]
  /** The original matched substring, for round-tripping / diagnostics. */
  raw: string
}

/** Result of parsing an assistant message into prose + extracted markers. */
export interface MarkerParseResult {
  prose: string
  markers: ParsedMarker[]
}

// ── Dispatch surface ────────────────────────────────────────────────────────

/**
 * Where a marker's effect is applied:
 * - `'client'`  — render-time only (e.g. BOOKING → a card).
 * - `'server'`  — persisted server-side in onFinish (e.g. NAME → visitor_name).
 * - `'both'`    — stripped client-side for display AND persisted server-side
 *                 (e.g. EMAIL → DB write + a client confirmation surface).
 */
export type MarkerDispatch = 'client' | 'server' | 'both'

// ── Registration ──────────────────────────────────────────────────────────

/** Static definition registered for one marker type. */
export interface MarkerDefinition {
  type: MarkerType
  /** Matches the marker and captures its fields. */
  pattern: RegExp
  /** Expected number of pipe-delimited fields. */
  fieldCount: number
  dispatch: MarkerDispatch
}

/**
 * The marker registry. Implementations hold the registered definitions, parse
 * assistant content into prose + markers, and expose the registered set.
 */
export interface MarkerRegistry {
  register(def: MarkerDefinition): void
  parse(content: string): MarkerParseResult
  getDefinitions(): MarkerDefinition[]
}

// ── Engine hook (useChatTurn) ───────────────────────────────────────────────

/**
 * Injected state accessors the engine reads/writes through. Keeping the engine
 * store-agnostic lets jefflougheed (Zustand) and Heirloom (useReducer context)
 * share one turn implementation, and lets jefflougheed's Hero + overlay drive a
 * single shared conversation rather than two.
 */
export interface ChatEngineAccessors {
  /**
   * Returns the full canonical messages, including `id` — typed as
   * `UIMessage[]` (a strict superset of the wire `ChatMessage` shape) rather
   * than `ChatMessage[]` so the engine can look up the id of a
   * just-`addMessage`d message (needed for `patchMessageById`, e.g. to mark a
   * user message's delivery status) without the store handing ids back from
   * `addMessage` itself.
   */
  getMessages(): UIMessage[]
  addMessage(msg: ChatMessage): void
  updateLastMessage(content: string): void
  /**
   * Merges a partial patch onto the message matching `id` — the general form
   * `updateLastMessage` doesn't cover (targeting a message by id rather than
   * "whichever is last", and patching fields other than `content`: delivery
   * `status`, `stopped`, `versions`/`versionIdx`). Used by delivery-status
   * tracking, stop/regenerate, and the version carousel.
   */
  patchMessageById(id: string, patch: Partial<UIMessage>): void
  /**
   * Removes the message matching `id` — used only when Stop is hit before any
   * chunk has arrived, so the still-empty assistant placeholder never renders
   * or persists (see useChatTurn.ts `send`/`retry`).
   */
  removeMessageById(id: string): void
  /**
   * Drops every message AFTER the one matching `id`, keeping `id` itself —
   * the truncate-forward step editMessage/resendMessage use before
   * re-delivering, so a rewritten history never leaves stale replies (or
   * memory cards, once those exist) trailing the edit point. No-ops if `id`
   * doesn't resolve.
   */
  truncateAfter(id: string): void
  setStreaming(val: boolean): void
  setSessionId(id: string): void
  getSessionId(): string | null
  /** Optional — only the surfaces that support arrival modes implement this. */
  getMode?(): ChatMode
  /** Optional — the Supabase members.id for a pre-auth invited member.
   *  When provided, /api/sage passes it to getMemberContext so the primer
   *  can be looked up without chat_sessions.user_id being set. */
  getMemberId?(): string | null
  /** Optional — the raw invite token for a pre-auth invited member. Sent to
   *  /api/sage as `invite_token` so the route can re-validate it server-side
   *  and derive a trustworthy memberId; the client-supplied member id above
   *  is display/lookup convenience only and is never trusted by the server. */
  getInviteToken?(): string | null
  /** Optional — media items associated with the current session. When provided,
   *  resolveMediaContext fetches derived_content for ready items and injects an
   *  ATTACHED MEDIA section into the system prompt. */
  getMediaItems?(): MediaAttachmentInput[]
  /**
   * Optional — called with the `mediaItemId`s of exactly the media items that
   * were included in a request, once that request has genuinely completed
   * (the true success path — never on network/stream failure, and never on a
   * client-initiated Stop). Lets the caller record ready/failed items as
   * delivered to the guide only once the guide actually received them,
   * instead of at getMediaItems() read time — see chatStore.tsx's
   * getMediaItems/markMediaItemsDelivered for why that distinction matters.
   */
  markMediaItemsDelivered?(mediaItemIds: string[]): void
}

/** Options passed into the useChatTurn hook. */
export interface UseChatTurnOptions {
  accessors: ChatEngineAccessors
  tenantId?: string
}

/** Public surface returned by the useChatTurn hook. */
export interface UseChatTurnReturn {
  send(input: string): Promise<void>
  /**
   * Like send(), but the user message is injected into the API context only —
   * it is never added to the store or persisted, so it never renders in the UI.
   * The assistant reply IS added and rendered normally. Used by system signals
   * (e.g. dispatchSystemSignal) where the application drives a guide turn
   * without showing a user bubble.
   */
  sendHidden(content: string): Promise<void>
  retry(): Promise<void>
  /**
   * Aborts the in-flight send()/retry() turn, if any. Whatever content
   * already streamed in is kept (marked `stopped: true`) rather than
   * discarded; if no chunk had arrived yet, the empty assistant placeholder
   * is removed instead. No-ops when nothing is in flight.
   */
  stop(): void
  /**
   * Re-generates the assistant message matching `messageId` using the same
   * preceding context, streaming the fresh reply directly into that
   * message's `content` (the single source of truth for what's displayed —
   * see the `versions` doc on UIMessage). On completion the pre-regenerate
   * content is appended to `versions` if not already there, and the new
   * content becomes the latest version. No-ops if a turn is already in
   * flight or `messageId` doesn't resolve to an assistant message.
   */
  regenerate(messageId: string): Promise<void>
  /**
   * Switches which cached `versions` entry a message displays (the carousel
   * arrows) — no network call, just a local content swap — and persists it
   * so the choice survives a reload. No-ops if `versionIdx` is out of range
   * or the message has no `versions`.
   */
  setActiveVersion(messageId: string, versionIdx: number): void
  /**
   * Replaces a user message's content, truncates every message after it, and
   * re-delivers — the mental model is that editing rewrites history forward
   * from that point. Marks the message `edited: true`. Any in-flight turn is
   * cancelled first (sequencing matters: a stream token arriving after
   * truncation must never write into a message that no longer exists). Also
   * clears any `message_feedback` rows for the truncated indices, so a new
   * reply can never silently inherit a rating that belonged to different,
   * now-discarded content. No-ops if `text` is empty/whitespace or
   * `messageId` doesn't resolve to a user message.
   */
  editMessage(messageId: string, text: string): Promise<void>
  /**
   * Re-delivers a user message unchanged: same truncate-and-redeliver flow as
   * editMessage, but the content is untouched and `edited` is not set.
   * Distinct from `retry()` — retry replays the last turn's delivery attempt
   * without truncating; this always truncates forward from `messageId`, even
   * if it isn't the most recent message.
   */
  resendMessage(messageId: string): Promise<void>
  isStreaming: boolean
  /** Classified reason the most recent turn failed, or null when it succeeded. */
  errorType: ChatErrorType | null
}
