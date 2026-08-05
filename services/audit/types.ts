export const AuditAction = {
  // Prompt
  PROMPT_COMPILE: 'prompt.compile',
  PROMPT_SAVE: 'prompt.save',
  // Blocks
  BLOCK_CREATE: 'block.create',
  BLOCK_UPDATE: 'block.update',
  BLOCK_DELETE: 'block.delete',
  // Sage parameters
  SAGE_PARAMETER_UPSERT: 'sage_parameter.upsert',
  SAGE_PARAMETER_DELETE: 'sage_parameter.delete',
  // Prompt sets
  PROMPT_SET_UPSERT: 'prompt_set.upsert',
  PROMPT_SET_DELETE: 'prompt_set.delete',
  PROMPT_SET_MASTER_SET: 'prompt_set.master_set',
  // Tenant settings
  TENANT_SETTINGS_UPDATE: 'tenant_settings.update',
  // Appearance (tenant_branding)
  APPEARANCE_UPDATE: 'appearance.update',
  // Invites
  INVITE_CREATE: 'invite.create',
  INVITE_DELETE: 'invite.delete',
  // Tenants (platform)
  TENANT_CREATE: 'tenant.create',
  TENANT_UPDATE: 'tenant.update',
  TENANT_DELETE: 'tenant.delete',
  // Sessions (visitor)
  SESSION_CREATE: 'session.create',
  SESSION_CLAIM: 'session.claim',
  CHAT_SESSION_TRANSFERRED: 'chat_session.transferred',
  // Media items (legacy strings — preserved for existing DB rows)
  MEDIA_ITEM_PROCESSING: 'media.item.processing',
  MEDIA_ITEM_PROCESSED: 'media.item.processed',
  MEDIA_ITEM_FAILED: 'media.item.failed',
  // Media upload pipeline
  MEDIA_UPLOAD_STARTED: 'media.upload_started',
  MEDIA_UPLOAD_COMPLETED: 'media.upload_completed',
  MEDIA_UPLOAD_FAILED: 'media.upload_failed',
  MEDIA_UPLOAD_DEDUPED: 'media.upload_deduped',
  // Media processing pipeline
  MEDIA_PROCESS_STARTED: 'media.process_started',
  MEDIA_PROCESS_COMPLETED: 'media.process_completed',
  MEDIA_PROCESS_FAILED: 'media.process_failed',
  MEDIA_URL_FAILED: 'media.url_failed',
  // Member-triggered retry of a failed media item (services/media/[id]/retry)
  MEDIA_RETRY_REQUESTED: 'media.retry_requested',
  MEDIA_RETRY_FAILED: 'media.retry_failed',
  // Anthropic AI calls within media processing
  AI_MEDIA_REQUEST_SENT: 'ai.media_request_sent',
  AI_MEDIA_RESPONSE_RECEIVED: 'ai.media_response_received',
  AI_MEDIA_REQUEST_FAILED: 'ai.media_request_failed',
  // Anthropic Files API — PDF text-extraction pipeline (services/content/assets.ts).
  // Distinct from the AI_MEDIA_* actions above: those bracket the whole PDF
  // extraction attempt (logged by services/media/processor.ts); these pinpoint
  // which specific internal step (upload, extraction, cleanup) succeeded or failed.
  MEDIA_FILE_UPLOAD_RECEIVED: 'media.file_upload_received',
  MEDIA_FILE_UPLOAD_FAILED: 'media.file_upload_failed',
  MEDIA_PDF_EXTRACTION_RECEIVED: 'media.pdf_extraction_received',
  MEDIA_PDF_EXTRACTION_FAILED: 'media.pdf_extraction_failed',
  MEDIA_FILE_CLEANUP_FAILED: 'media.file_cleanup_failed',
  // Deepgram STT calls within media processing
  STT_REQUEST_SENT: 'stt.request_sent',
  STT_RESPONSE_RECEIVED: 'stt.response_received',
  STT_REQUEST_FAILED: 'stt.request_failed',
  // Transcription
  TRANSCRIPTION_REQUESTED: 'transcription.requested',
  TRANSCRIPTION_SUCCEEDED: 'transcription.succeeded',
  TRANSCRIPTION_EMPTY: 'transcription.empty',
  TRANSCRIPTION_FAILED: 'transcription.failed',
  // Members
  MEMBER_CLAIM: 'member.claim',
  MEMBER_ROLE_UPDATED: 'member.role_updated',
  MEMBER_STATUS_UPDATED: 'member.status_updated',
  MEMBER_INVITE_CREATED: 'member.invite_created',
  MEMBER_INVITE_RESENT: 'member.invite_resent',
  MEMBER_INVITE_REVOKED: 'member.invite_revoked',
  MEMBER_INVITE_OPENED: 'member.invite_opened',
  MEMBER_INVITE_ACCEPTED: 'member.invite_accepted',
  MEMBER_HARD_DELETED: 'user.hard_deleted',
  // Conversations (Composer history)
  CONVERSATION_CREATE: 'conversation.create',
  CONVERSATION_UPDATE: 'conversation.update',
  // Memories (Heirloom) — MEMORY_ARCHIVIST_RUN is retired: the archivist
  // (a second model call to write up/revise a memory passage) was removed
  // entirely — both create and rewrite now do a verbatim, no-model-call
  // write. Kept in this enum only because real historical audit_events rows
  // already reference it (same precedent as PROMPT_SET_MASTER_SET above,
  // never dropped for the same reason) — nothing writes under this action
  // going forward.
  MEMORY_ARCHIVIST_RUN: 'memory.archivist_run',
  // The one write path left — logged by services/crm/memories.ts's
  // createMemoryFromAnchor, success or failure.
  MEMORY_CREATED: 'memory.created',
  MEMORY_KEPT: 'memory.kept',
  MEMORY_DISCARDED: 'memory.discarded',
  // Chat — media context resolution (services/chat/server)
  CHAT_MEDIA_CONTEXT_RESOLVED: 'chat.media_context_resolved',
  // Chat — Anthropic prompt-cache usage per turn (services/chat/server/index.ts)
  CHAT_PROMPT_CACHE_USAGE: 'chat.prompt_cache_usage',
} as const

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]

export const AuthEventType = {
  SIGN_UP: 'sign_up',
  SIGN_IN: 'sign_in',
  SIGN_IN_FAILED: 'sign_in_failed',
  OTP_SENT: 'otp_sent',
  OTP_VERIFIED: 'otp_verified',
  SESSION_CREATED: 'session_created',
  SESSION_REVOKED: 'session_revoked',
  USER_DELETED: 'user_deleted',
  ADMIN_ACCESS: 'admin_access',
  ADMIN_ACCESS_FAILED: 'admin_access_failed',
} as const

export type AuthEventType = (typeof AuthEventType)[keyof typeof AuthEventType]

export interface AuditEventInput {
  action: AuditAction
  tenant_id?: string | null
  product_id?: string | null
  actor_id?: string | null
  actor_type?: 'user' | 'system' | 'anonymous'
  actor_email?: string | null
  clerk_user_id?: string | null
  target_type?: string | null
  target_id?: string | null
  outcome?: 'success' | 'failure'
  ip_address?: string | null
  user_agent?: string | null
  correlation_id?: string | null
  changes?: { before?: unknown; after?: unknown } | null
  metadata?: Record<string, unknown>
}

export interface AuthEventInput {
  event_type: AuthEventType
  tenant_id?: string | null
  clerk_user_id?: string | null
  actor_id?: string | null
  email?: string | null
  outcome?: 'success' | 'failure'
  failure_reason?: string | null
  ip_address?: string | null
  user_agent?: string | null
  correlation_id?: string | null
  svix_event_id?: string | null
  metadata?: Record<string, unknown>
}
