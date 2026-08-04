// services/crm/index.ts
//
// Public surface of the CRM service. Server-only (the session/inbound modules
// reach the service-role Supabase client and the model SDK). Consumers may
// import from here or from the specific modules directly.

// Session state machine
export {
  deriveSessionStatus,
  type SessionStatus,
  type SessionStatusThresholds,
  type DeriveSessionStatusInput,
} from './status'

// Session lifecycle (chat onFinish flows)
export { handleSessionFinish } from './session'

// Anonymous visitor session writes
export { createSession, updateSession, claimSession } from './sessions'
export type { SessionResult, SessionUpdateInput } from './sessions'

// Message feedback (thumbs + reason chips + note)
export { upsertFeedback, listFeedback, deleteFeedbackFrom, resolveMemberId } from './feedback'
export type { FeedbackResult, MessageFeedbackRow, UpsertFeedbackInput } from './feedback'

// Conversion events (booking offers / contact captures — presented/overwritten log)
export { recordConversionEvents, overwriteConversionEventsFrom } from './conversion-events'
export type { ConversionEventType } from './conversion-events'

// Inbound chat triage
export { getInboundChats, getTtftTrend } from './inbound'
export type { ChatSession, FeedbackCountsSummary, TtftTrendPoint } from './inbound'

// Token/cost formatting (Inbound Chats admin surfaces)
export { formatTokens, formatCost, INPUT_COST_PER_MILLION, OUTPUT_COST_PER_MILLION } from './formatting'
