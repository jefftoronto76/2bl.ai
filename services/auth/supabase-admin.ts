import { createClient } from '@supabase/supabase-js'

// Gate 3 (Design Handovers/identity-tracking-proposal.md) — the identity
// audit trigger (members/users, deployed directly in Studio) reads
// `x-identity-source` off the PostgREST request via
// `current_setting('request.headers', true)::json ->> 'x-identity-source'`.
// A call site that writes name/email/phone should pass its own source so
// the resulting audit_events rows are attributable; anything else can omit
// it — 'unattributed' is a safe default, not an error. `correlationId`
// (when known — e.g. from an incoming request's own x-correlation-id
// header) rides alongside for the same reason existing AuditAction logging
// threads it through.
export type IdentitySource =
  | 'api_members_sync'
  | 'clerk_webhook'
  | 'sync_member'
  | 'link_invited_member'
  | 'accept_invite'
  | 'accept_story_invite'
  | 'sync_user'
  | 'ensure_clerk_user'
  | 'claim_membership'
  | 'members_admin'
  | 'chat_marker_capture'
  | 'waitlist_request'
  | 'unattributed'

export function getAdminClient(
  source: IdentitySource = 'unattributed',
  ctx?: { correlationId?: string | null },
) {
  const headers: Record<string, string> = { 'x-identity-source': source }
  if (ctx?.correlationId) headers['x-correlation-id'] = ctx.correlationId

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { headers } },
  )
}
