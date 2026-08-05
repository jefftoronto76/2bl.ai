// POST /api/media/[id]/retry
// Resets a failed media item back to status=pending, then drives processing
// directly — no re-upload needed, the file is still in storage. Does NOT
// depend on the Supabase Database Webhook: that webhook only fires (and is
// only handled) on INSERT, so this route's UPDATE would never be picked up
// through that path. processMediaItem re-fetches the item itself and
// re-verifies status === 'pending' before doing anything, so calling it
// directly here is safe even under concurrent retry clicks.

import { getCurrentUser } from '@/services/auth'
import { getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { getMediaItem, updateMediaItem } from '@/services/media'
import { processMediaItem } from '@/services/media/processor'

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

  await updateMediaItem(id, {
    status: 'pending',
    error_message: null,
    derived_content: null,
    classification: null,
    processed_at: null,
  })

  // Fire-and-forget, matching app/api/webhooks/media-process/route.ts's own
  // pattern — respond to the client immediately, let processing run in the
  // background. `item` already carries the id/tenant_id processMediaItem
  // needs; it re-fetches a fresh copy itself before doing anything.
  void processMediaItem(item).catch((err) => {
    console.error('[media/retry] processMediaItem threw unexpectedly', {
      mediaItemId: id,
      error: err instanceof Error ? err.message : String(err),
    })
  })

  console.log('[media/retry] reset to pending, reprocessing', { mediaItemId: id, memberId: memberRow.id })
  return Response.json({ ok: true })
}
