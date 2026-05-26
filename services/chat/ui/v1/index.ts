// services/chat/ui/v1/index.ts
//
// Public barrel for the v1 chat engine UI layer. Re-exports the marker
// registry + useChatTurn type contracts. Types only for now (PR 0); the
// registry and hook implementations land in later PRs.

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
