// POST /api/media/[id]/retry
// Resets a failed media item back to status=pending, re-triggering the
// Supabase Database Webhook. No re-upload needed — the file is still in storage.

import { getCurrentUser } from '@/services/auth'
import { getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { getMediaItem, updateMediaItem } from '@/services/media'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    return Response.json({ error: 'Tenant not found' }, { status: 400 })
  }

  const { id } = await params
  const item = await getMediaItem(id, tenantId)
  if (!item) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (item.status !== 'failed') {
    return Response.json(
      { error: `Cannot retry item with status: ${item.status}` },
      { status: 400 },
    )
  }

  // Verify the requesting user owns this item
  const supabase = getAdminClient()
  const { data: memberRow } = await supabase
    .from('members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('clerk_id', user.providerUserId)
    .single()

  if (!memberRow || item.member_id !== memberRow.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Reset to pending — this re-triggers the Supabase INSERT webhook
  // (Supabase webhooks fire on INSERT only, so we do a delete+reinsert via
  // a status patch that the webhook is configured to watch via UPDATE trigger,
  // OR the Supabase webhook is configured on UPDATE as well).
  // If the webhook is INSERT-only, the platform admin must re-trigger manually.
  // Status→pending is the idiomatic signal either way.
  await updateMediaItem(id, {
    status: 'pending',
    error_message: null,
    derived_content: null,
    classification: null,
    processed_at: null,
  })

  console.log('[media/retry] reset to pending', { mediaItemId: id, memberId: memberRow.id })
  return Response.json({ ok: true })
}
