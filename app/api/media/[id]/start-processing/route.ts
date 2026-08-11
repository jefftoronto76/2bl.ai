// POST /api/media/[id]/start-processing
// The client calls this immediately after its signed-URL PUT of the file
// bytes to Supabase Storage resolves successfully (services/media/useMediaUpload.ts)
// — this is now the ONLY trigger for a fresh upload's processing.
//
// Why this replaced the Supabase Database Webhook as the trigger: the
// webhook fires on the media_items INSERT, which happens in
// POST /api/media/upload-url — before the signed URL is even returned to
// the client, let alone before the client's PUT lands in Storage (a
// separate, later request). On a slow connection (confirmed: reliable on
// wifi, reliable failure on cellular) the PUT can easily outlast
// waitForStorageObject's bounded wait, failing the job with "Storage object
// not available after N attempts" even though the upload was simply still
// in flight. Triggering from here instead means processing never starts
// before the file is actually in Storage — the client only calls this once
// its own PUT request has resolved with an ok response.
// app/api/webhooks/media-process/route.ts is now an intentional no-op on
// INSERT for exactly this reason — it can't be made to fire later, since
// Supabase Database Webhook timing isn't something this codebase controls.
//
// This also absorbs what a separate 'upload_completed' audit event used to
// log on its own via POST /api/events/media — folded in here rather than
// left on that generic endpoint, since that route short-circuits entirely
// when ENABLE_MEDIA_AUDIT_LOGGING is off, which would have silently
// disabled processing too if the trigger lived there instead of here.
//
// Member-authenticated (not a shared-secret pattern like the webhook/cron
// routes) since this is called directly from the member's own browser, not
// server-to-server — ownership of the media_items row is verified the same
// way retry/route.ts already does.
//
// A client that closes/crashes between the PUT resolving and this call ever
// firing leaves the row at 'pending' with no trigger — see
// sweepStalePendingItems (services/media/index.ts), the stale-processing
// sweep's pending-row counterpart, for that recovery path.

import { after } from 'next/server'
import { getCurrentUser, getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { getMediaItem, isMediaAuditEnabled, logMediaEvent } from '@/services/media'
import { processMediaItem } from '@/services/media/processor'
import { AuditAction } from '@/services/audit/types'

export const maxDuration = 900 // 15 min — Vercel Pro plan, matches the other processMediaItem trigger routes
export const runtime = 'nodejs'

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

  if (isMediaAuditEnabled()) {
    await logMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.MEDIA_UPLOAD_COMPLETED,
      outcome: 'success',
      correlation_id: crypto.randomUUID(),
      metadata: {
        mime_type: item.mime_type,
        original_filename: item.original_filename,
        file_size_bytes: item.file_size_bytes,
        timestamp: new Date().toISOString(),
      },
    })
  }

  // processMediaItem re-fetches the item and re-verifies status === 'pending'
  // before doing anything (its own idempotency guard), so calling it here is
  // harmless even on a duplicate/retried request from a flaky connection.
  // after() keeps this invocation alive until the promise settles — see
  // app/api/webhooks/media-process/route.ts's own comment for why a bare
  // `void` here would silently risk the same permanently-stuck-at-'processing'
  // failure mode Step 1 fixed for the other trigger routes.
  after(() =>
    processMediaItem(item).catch((err) => {
      console.error('[media/start-processing] processMediaItem threw unexpectedly', {
        media_item_id: item.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }),
  )

  return Response.json({ ok: true })
}
