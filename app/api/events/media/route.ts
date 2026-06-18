// POST /api/events/media
// Receives client-side upload lifecycle events from useMediaUpload and writes
// them to audit_events. Resolves all metadata server-side from the media_items
// record — the client only supplies mediaItemId and the event name.
//
// Gated by ENABLE_MEDIA_AUDIT_LOGGING (see services/media/index.ts).

import { getCurrentUser, getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { AuditAction } from '@/services/audit/types'
import { isMediaAuditEnabled, logMediaEvent } from '@/services/media'

type UploadEvent = 'upload_started' | 'upload_completed' | 'upload_failed'

const EVENT_ACTION: Record<UploadEvent, AuditAction> = {
  upload_started: AuditAction.MEDIA_UPLOAD_STARTED,
  upload_completed: AuditAction.MEDIA_UPLOAD_COMPLETED,
  upload_failed: AuditAction.MEDIA_UPLOAD_FAILED,
}

export async function POST(req: Request) {
  if (!isMediaAuditEnabled()) {
    return Response.json({ ok: true })
  }

  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    return Response.json({ error: 'Tenant not found' }, { status: 400 })
  }

  let body: { mediaItemId?: unknown; event?: unknown; error_message?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const mediaItemId = typeof body.mediaItemId === 'string' ? body.mediaItemId : null
  const event = typeof body.event === 'string' ? body.event : null
  const errorMessage = typeof body.error_message === 'string' ? body.error_message : null

  if (!mediaItemId) return Response.json({ error: 'mediaItemId is required' }, { status: 400 })
  if (!event || !(event in EVENT_ACTION)) {
    return Response.json({ error: 'Invalid event type' }, { status: 400 })
  }

  const action = EVENT_ACTION[event as UploadEvent]
  const outcome: 'success' | 'failure' = event === 'upload_failed' ? 'failure' : 'success'

  // Look up the media_items record to build the authoritative metadata envelope.
  // Scoped by tenantId to prevent cross-tenant reads.
  const supabase = getAdminClient()
  const { data: item, error: itemErr } = await supabase
    .from('media_items')
    .select('id, tenant_id, member_id, mime_type, original_filename, file_size_bytes')
    .eq('id', mediaItemId)
    .eq('tenant_id', tenantId)
    .single()

  if (itemErr || !item) {
    return Response.json({ error: 'Media item not found' }, { status: 404 })
  }

  const metadata: Record<string, unknown> = {
    mime_type: item.mime_type,
    original_filename: item.original_filename,
    file_size_bytes: item.file_size_bytes,
    timestamp: new Date().toISOString(),
  }
  if (errorMessage) metadata.error_message = errorMessage

  await logMediaEvent({
    tenant_id: item.tenant_id,
    member_id: item.member_id,
    media_item_id: item.id,
    action,
    outcome,
    correlation_id: req.headers.get('x-correlation-id') ?? crypto.randomUUID(),
    metadata,
  })

  return Response.json({ ok: true })
}
