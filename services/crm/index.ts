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
export { createSession, updateSession } from './sessions'
export type { SessionResult, SessionUpdateInput } from './sessions'

// Message feedback (thumbs + reason chips + note)
export { upsertFeedback, listFeedback, deleteFeedbackFrom, resolveMemberId } from './feedback'
export type { FeedbackResult, MessageFeedbackRow, UpsertFeedbackInput } from './feedback'

// Inbound chat triage
export { getInboundChats } from './inbound'
export type { ChatSession } from './inbound'
