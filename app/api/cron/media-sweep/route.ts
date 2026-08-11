// GET /api/cron/media-sweep
// Vercel Cron target (see vercel.json's "crons" entry) — defense-in-depth
// recovery for a media_items job stuck at status='processing' with no path
// back to a terminal state, regardless of cause. Delegates the actual query
// + per-row update to services/media's sweepStaleProcessingItems(); this
// route's only job is auth and logging one MEDIA_PROCESS_FAILED audit event
// per row it swept, so the audit trail says *why* a row resolved instead of
// silently changing status. See System Docs/Utilities/Media.md's
// "stale-processing sweep" section for the full design/threshold rationale.
//
// To test on preview without waiting for the cron schedule:
// curl https://{preview-url}/api/cron/media-sweep -H "Authorization: Bearer <CRON_SECRET>"

import { timingSafeEqual } from 'crypto'
import {
  sweepStaleProcessingItems,
  STALE_PROCESSING_ERROR_MESSAGE,
  isMediaAuditEnabled,
  logMediaEvent,
} from '@/services/media'
import { AuditAction } from '@/services/audit/types'

export const maxDuration = 60
export const runtime = 'nodejs'

// Vercel Cron sends this exact header (Authorization: Bearer <CRON_SECRET>)
// automatically on every invocation once CRON_SECRET is set on the project —
// same shared-secret pattern as media-process/route.ts's own
// verifySignature, just against a Bearer header instead of a custom one.
function verifyCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[media-sweep] CRON_SECRET is not set')
    return false
  }
  const header = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  try {
    const headerBuf = Buffer.from(header)
    const expectedBuf = Buffer.from(expected)
    if (headerBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(headerBuf, expectedBuf)
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const swept = await sweepStaleProcessingItems()

  for (const item of swept) {
    console.log('[media-sweep] flipped stale processing row to failed', {
      media_item_id: item.id,
      type: item.type,
      stalled_since: item.created_at,
    })

    if (isMediaAuditEnabled()) {
      await logMediaEvent({
        tenant_id: item.tenant_id,
        member_id: item.member_id,
        media_item_id: item.id,
        action: AuditAction.MEDIA_PROCESS_FAILED,
        outcome: 'failure',
        correlation_id: crypto.randomUUID(),
        metadata: {
          mime_type: item.mime_type,
          original_filename: item.original_filename,
          file_size_bytes: item.file_size_bytes,
          timestamp: new Date().toISOString(),
          type: item.type,
          error_message: STALE_PROCESSING_ERROR_MESSAGE,
          pipeline_step: 'stale_processing_sweep',
          stalled_since: item.created_at,
        },
      })
    }
  }

  return Response.json({ ok: true, swept: swept.length })
}
