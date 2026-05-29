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
} from './types'

export { createMarkerRegistry, createDefaultRegistry, BOOKING_MARKER, NAME_MARKER, EMAIL_MARKER, PHONE_MARKER } from './registry'
