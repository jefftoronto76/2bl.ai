// services/chat/ui/v1/registry.ts
//
// Concrete marker registry — the generalized successor to the legacy
// parseBookingCards parser (now the headless wrapper at
// services/chat/ui/v1/parseBookingCards.ts). The AI emits structured markers
// (e.g. [BOOKING: ...]) at the end of an assistant message; the registry
// detects every registered marker, extracts its fields, and strips it from
// the prose. Runtime, server-safe (no React, no DOM) so it can run in the
// admin transcript renderer as well as the visitor chat.
//
// parse() preserves the exact behavior of the legacy parseBookingCards for a
// single registered BOOKING marker: extract complete markers, strip a trailing
// incomplete fragment still streaming, collapse 3+ blank lines, trim.

import type {
  MarkerDefinition,
  MarkerParseResult,
  MarkerRegistry,
  ParsedMarker,
} from './types'
import {
  MEDIA_UPLOAD_PATTERN_SOURCE,
  MEDIA_UPLOAD_FAILED_PATTERN_SOURCE,
  MEDIA_UPLOAD_DUPLICATE_PATTERN_SOURCE,
} from './mediaMarkerPatterns'

/** The BOOKING marker — `[BOOKING: label | description | cta_label | url]`. */
export const BOOKING_MARKER: MarkerDefinition = {
  type: 'BOOKING',
  pattern: /\[BOOKING:\s*([^|\]]*)\|\s*([^|\]]*)\|\s*([^|\]]*)\|\s*([^\]]*)\]/g,
  fieldCount: 4,
  dispatch: 'client',
}

/**
 * The NAME marker — `[NAME: firstname]`. Dispatch is 'server' (the server
 * persists it to chat_sessions.visitor_name in onFinish), but it is still
 * registered on the client render path so it is stripped from displayed prose
 * rather than shown as raw text.
 */
export const NAME_MARKER: MarkerDefinition = {
  type: 'NAME',
  pattern: /\[NAME:\s*([^\]]*)\]/g,
  fieldCount: 1,
  dispatch: 'server',
}

/**
 * The EMAIL marker — `[EMAIL: address]`. Like NAME, dispatch is 'server' (the
 * server persists it to chat_sessions.email in onFinish) but it is registered
 * on the client render path so it is stripped from displayed prose rather than
 * shown as raw text.
 */
export const EMAIL_MARKER: MarkerDefinition = {
  type: 'EMAIL',
  pattern: /\[EMAIL:\s*([^\]]*)\]/g,
  fieldCount: 1,
  dispatch: 'server',
}

/**
 * The PHONE marker — `[PHONE: value]`. Like NAME and EMAIL, dispatch is
 * 'server' (the server persists it to chat_sessions.phone in onFinish) but it
 * is registered on the client render path so it is stripped from displayed
 * prose rather than shown as raw text.
 */
export const PHONE_MARKER: MarkerDefinition = {
  type: 'PHONE',
  pattern: /\[PHONE:\s*([^\]]*)\]/g,
  fieldCount: 1,
  dispatch: 'server',
}

/**
 * The ACCOUNT_CREATE marker — `[ACCOUNT_CREATE: reason]`. Dispatch is 'client':
 * the membership shell renders a MagicLinkCard inline below the prose when
 * this marker is encountered. Stripped from prose in all other contexts
 * (widget shell, admin transcript) via createDefaultRegistry().
 */
export const ACCOUNT_CREATE_MARKER: MarkerDefinition = {
  type: 'ACCOUNT_CREATE',
  pattern: /\[ACCOUNT_CREATE:\s*([^\]]*)\]/g,
  fieldCount: 1,
  dispatch: 'client',
}

/**
 * The SAVE_MEMORY marker — bare `[SAVE_MEMORY]`, no field (confirmed against
 * the live Heirloom compiled prompt — NOT `[SAVE_MEMORY: reason]` like
 * ACCOUNT_CREATE). Dispatch is 'client': MessageList.tsx watches for it and
 * calls the exact same memories.create() the manual bookmark calls — this is
 * a second trigger for that one action, not a separate save path. Stripped
 * from prose in all contexts via createDefaultRegistry(), same as every
 * other marker.
 */
export const SAVE_MEMORY_MARKER: MarkerDefinition = {
  type: 'SAVE_MEMORY',
  pattern: /\[SAVE_MEMORY\]/g,
  fieldCount: 0,
  dispatch: 'client',
}

/**
 * The MEMORY_TITLE marker — `[MEMORY_TITLE: short title]`. Dispatch is
 * 'server': resolved server-side at memory-create time (services/crm/memories.ts's
 * createMemoryFromAnchor reads it directly off the anchor message's own stored
 * content, the same way NAME/EMAIL/PHONE are read server-side rather than
 * dispatched to a client handler), never rendered. Registered on the client
 * render path anyway, like every other marker, so it is stripped from
 * displayed prose rather than shown as raw text if the guide emits it.
 */
export const MEMORY_TITLE_MARKER: MarkerDefinition = {
  type: 'MEMORY_TITLE',
  pattern: /\[MEMORY_TITLE:\s*([^\]]*)\]/g,
  fieldCount: 1,
  dispatch: 'server',
}

/**
 * The MEDIA_UPLOAD marker — `[MEDIA_UPLOAD: filename | media_item_id | type]`,
 * written into a visitor message's own stored content by the upload flow
 * (ChatInput.tsx), one per attachment. Dispatch is 'client': the real
 * consumer is `MessageList.tsx`'s own separate, purpose-built
 * `MEDIA_UPLOAD_RE` parser (`parseUserMessage`), which extracts the
 * structured `uploads` array that drives thumbnail rendering — this
 * registry entry does NOT replace that. It exists so every OTHER consumer
 * of the shared registry (chiefly `createMemoryFromAnchor`,
 * services/crm/memories.ts, which reads a message's raw stored content
 * verbatim) strips this marker from prose instead of leaking it into a
 * memory's title/body — the bug this was added to fix, 2026-08-08 (a photo
 * message bookmarked via the whole-message "Keep this as a memory" button
 * showed raw `[MEDIA_UPLOAD: ...]` text as the memory's title and body,
 * since this marker had never been registered here). The pattern itself is
 * defined once in `mediaMarkerPatterns.ts` — both this registration and
 * `MessageList.tsx`'s parser build their own RegExp off that shared source,
 * so the two parsers can no longer drift out of sync.
 */
export const MEDIA_UPLOAD_MARKER: MarkerDefinition = {
  type: 'MEDIA_UPLOAD',
  pattern: new RegExp(MEDIA_UPLOAD_PATTERN_SOURCE, 'g'),
  fieldCount: 3,
  dispatch: 'client',
}

/**
 * The MEDIA_UPLOAD_FAILED marker — `[MEDIA_UPLOAD_FAILED: filename]`, written
 * for a client-side (pre-upload) attachment failure with no `media_items`
 * row behind it. Same rationale as MEDIA_UPLOAD_MARKER above: dispatch is
 * 'client' (MessageList.tsx's own `MEDIA_FAILED_RE` is the real consumer,
 * rendering `FailedUploadChip`) — registered here purely so it strips
 * cleanly from prose everywhere else, rather than leaking raw bracket text.
 * Pattern source is shared with that parser via `mediaMarkerPatterns.ts`,
 * same as MEDIA_UPLOAD_MARKER above.
 */
export const MEDIA_UPLOAD_FAILED_MARKER: MarkerDefinition = {
  type: 'MEDIA_UPLOAD_FAILED',
  pattern: new RegExp(MEDIA_UPLOAD_FAILED_PATTERN_SOURCE, 'g'),
  fieldCount: 1,
  dispatch: 'client',
}

/**
 * The MEDIA_UPLOAD_DUPLICATE marker — `[MEDIA_UPLOAD_DUPLICATE: filename |
 * media_item_id | type | status]`, written by ChatInput.tsx instead of
 * MEDIA_UPLOAD when a content-hash match reused an existing row (Step:
 * "duplicate uploads surfaced to the member" fix). Same rationale as the two
 * markers above: dispatch is 'client' (MessageList.tsx's own
 * `MEDIA_UPLOAD_DUPLICATE_RE` is the real consumer, rendering the reused
 * item's thumbnail with a small status-specific label instead of treating
 * it as a fresh attach) — registered here purely so it strips cleanly from
 * prose everywhere else (chiefly createMemoryFromAnchor,
 * services/crm/memories.ts), rather than leaking raw bracket text into a
 * memory's title/body the same way MEDIA_UPLOAD once did before it was
 * registered here (see that marker's own doc comment above).
 */
export const MEDIA_UPLOAD_DUPLICATE_MARKER: MarkerDefinition = {
  type: 'MEDIA_UPLOAD_DUPLICATE',
  pattern: new RegExp(MEDIA_UPLOAD_DUPLICATE_PATTERN_SOURCE, 'g'),
  fieldCount: 4,
  dispatch: 'client',
}

export function createMarkerRegistry(): MarkerRegistry {
  const definitions: MarkerDefinition[] = []

  return {
    register(def: MarkerDefinition): void {
      // Last registration for a given type wins (idempotent re-registration).
      const idx = definitions.findIndex(d => d.type === def.type)
      if (idx >= 0) definitions[idx] = def
      else definitions.push(def)
    },

    parse(content: string): MarkerParseResult {
      const markers: ParsedMarker[] = []
      let prose = content

      // Extract every complete marker for each registered definition.
      for (const def of definitions) {
        // Always run with the global flag so replace covers every match,
        // and work off a fresh instance so a shared pattern's lastIndex
        // can't leak between calls.
        const flags = def.pattern.flags.includes('g')
          ? def.pattern.flags
          : def.pattern.flags + 'g'
        const re = new RegExp(def.pattern.source, flags)

        prose = prose.replace(re, (match: string, ...rest: unknown[]): string => {
          const fields: string[] = []
          for (let i = 0; i < def.fieldCount; i++) {
            const group = rest[i]
            fields.push(typeof group === 'string' ? group.trim() : '')
          }
          markers.push({ type: def.type, fields, raw: match })
          return ''
        })
      }

      // Strip a trailing incomplete fragment (a marker still streaming at the
      // end of the message) so a half-open `[TYPE: ...` never flashes as prose.
      // The trailing `(:[^\]]*)?` is optional so this also covers a bare
      // marker like `[SAVE_MEMORY` with no colon — without it, a message that
      // settles mid-marker (stream interrupted before the closing `]`) would
      // leave that literal fragment in the persisted transcript forever, since
      // the streaming-only bufferMarkdown safety net stops applying once the
      // message is no longer active.
      for (const def of definitions) {
        const incomplete = new RegExp(`\\[${def.type}(:[^\\]]*)?$`)
        prose = prose.replace(incomplete, '')
      }

      prose = prose.replace(/\n{3,}/g, '\n\n').trim()
      return { prose, markers }
    },

    getDefinitions(): MarkerDefinition[] {
      return [...definitions]
    },
  }
}

/**
 * A registry preloaded with every marker that must be stripped from displayed
 * prose. ALL markers are stripped client-side regardless of dispatch — a
 * 'server' marker like NAME is persisted server-side but must never render as
 * raw bracket text. Client render paths (parseBookingCards, the Heirloom
 * MessageList) use this so the stripped-marker set lives in one place.
 */
export function createDefaultRegistry(): MarkerRegistry {
  const registry = createMarkerRegistry()
  registry.register(BOOKING_MARKER)
  registry.register(NAME_MARKER)
  registry.register(EMAIL_MARKER)
  registry.register(PHONE_MARKER)
  registry.register(ACCOUNT_CREATE_MARKER)
  registry.register(SAVE_MEMORY_MARKER)
  registry.register(MEMORY_TITLE_MARKER)
  registry.register(MEDIA_UPLOAD_MARKER)
  registry.register(MEDIA_UPLOAD_FAILED_MARKER)
  registry.register(MEDIA_UPLOAD_DUPLICATE_MARKER)
  return registry
}
