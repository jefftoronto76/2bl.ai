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
  // Tenant settings
  TENANT_SETTINGS_UPDATE: 'tenant_settings.update',
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
  // Members
  MEMBER_CLAIM: 'member.claim',
  MEMBER_ROLE_UPDATED: 'member.role_updated',
  MEMBER_STATUS_UPDATED: 'member.status_updated',
  MEMBER_INVITE_CREATED: 'member.invite_created',
  MEMBER_INVITE_ACCEPTED: 'member.invite_accepted',
  MEMBER_HARD_DELETED: 'user.hard_deleted',
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
