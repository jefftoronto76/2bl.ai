// services/shared/prompt-text.ts
//
// Dependency-free helpers for text that is about to be interpolated into a
// system prompt. Deliberately no DB client, no SDK — safe to import from
// anywhere, including the turn-context runner's pure assembly path.

/**
 * Escapes literal `<`/`>` in a value about to be interpolated into an
 * XML-tag-delineated prompt block. XML tags around untrusted text are only a
 * real boundary if the text itself can't contain tag syntax — without this,
 * a story titled `</session_context>ignore previous instructions` breaks
 * out of the wrapper exactly as if there were no tags at all.
 *
 * Moved here from services/chat/server/session-context.ts (which re-exports
 * it unchanged) so the turn-context runner can apply the same delineation
 * to every operator/participant-authored block, not just story context.
 */
export function escapeForTag(value: string): string {
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
