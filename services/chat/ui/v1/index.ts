// services/chat/ui/v1/index.ts
//
// Public barrel for the v1 chat engine UI layer: the marker registry type
// contracts + the concrete registry. The useChatTurn hook is intentionally NOT
// re-exported here — it carries a 'use client' directive, and keeping it out of
// the barrel lets server consumers (e.g. the admin transcript renderer) import
// the registry without pulling a client-only module. Import the hook directly
// from '@/services/chat/ui/v1/useChatTurn'.

export type {
  MarkerType,
  ParsedMarker,
  MarkerParseResult,
  MarkerDispatch,
  MarkerDefinition,
  MarkerRegistry,
  ChatEngineAccessors,
  UseChatTurnOptions,
  UseChatTurnReturn,
  UIMessage,
  AuthPromptData,
  ChatErrorType,
} from './types'

export { createMarkerRegistry, createDefaultRegistry, BOOKING_MARKER, NAME_MARKER, EMAIL_MARKER, PHONE_MARKER, ACCOUNT_CREATE_MARKER } from './registry'

// Canonical message helpers (Phase 0). Pure + server-safe, so they belong in
// the barrel — no 'use client' surface like useChatTurn.
export {
  normalizeTimestamp,
  createUIMessage,
  reviveUIMessage,
  reviveUIMessages,
  toChatMessage,
  toChatMessages,
  toModelMessages,
} from './message'

// Shared session core type contracts (Phase 1). Types only — the runtime hook
// and provider (useChatSession, ChatSessionProvider) carry 'use client' and are
// intentionally NOT re-exported here; import them directly from their modules,
// like useChatTurn.
export type { ChatSessionState, ChatSessionStore, HydrateInput } from './core/store'
export type { ChatSession, ChatSessionConfig } from './core/useChatSession'
