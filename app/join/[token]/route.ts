// GET /join/[token]
// Public, unauthenticated redirect for a durable story invite link.
// Distinct route, distinct table (story_invite_links, not members) from
// /invite/[token] — zero shared code path with the single-use admin/member
// invite mechanism. 302s to the same host's `/?join=TOKEN`; app/heirloom/
// page.tsx picks the query param up as its own, independent branch.
//
// 404 — token doesn't exist. 410 — link was revoked or has expired.

import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

interface RouteContext {
  params: Promise<{ token: string }>
}

export async function GET(req: Request, context: RouteContext) {
  const { token } = await context.params

  if (!token) {
    return new Response('Not found', { status: 404 })
  }

  const supabase = getAdminClient()

  const { data: row, error } = await supabase
    .from('story_invite_links')
    .select('id, tenant_id, story_id, revoked_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error) {
    console.error('[join/[token]] lookup failed:', error.message, { token: token.slice(0, 8) + '…' })
    return new Response('Not found', { status: 404 })
  }

  if (!row) {
    console.warn('[join/[token]] token not found', { token: token.slice(0, 8) + '…' })
    return new Response('Not found', { status: 404 })
  }

  const link = row as {
    id: string
    tenant_id: string
    story_id: string
    revoked_at: string | null
    expires_at: string | null
  }

  if (link.revoked_at) {
    console.warn('[join/[token]] revoked', { linkId: link.id, token: token.slice(0, 8) + '…' })
    return new Response('This invite link has been revoked.', { status: 410 })
  }

  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
    console.warn('[join/[token]] expired', { linkId: link.id, token: token.slice(0, 8) + '…' })
    return new Response('This invite link has expired.', { status: 410 })
  }

  void logEvent({
    action: AuditAction.STORY_INVITE_LINK_OPENED,
    tenant_id: link.tenant_id,
    actor_type: 'anonymous',
    target_type: 'story_invite_link',
    target_id: link.id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { story_id: link.story_id },
  })

  console.log('[join/[token]] redirecting', { linkId: link.id, storyId: link.story_id })

  return Response.redirect(new URL(`/?join=${token}`, req.url), 302)
}
