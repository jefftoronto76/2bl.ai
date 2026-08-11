// GET /api/cron/media-sweep
// Vercel Cron target (see vercel.json's "crons" entry) — defense-in-depth
// recovery for media_items rows with no path back to a terminal state,
// regardless of cause. Two independent sweeps:
//
// 1. Stale 'processing' rows (sweepStaleProcessingItems) — a job that
//    started but never finished. Flipped straight to 'failed'.
// 2. Stale 'pending' rows (sweepStalePendingItems) — a row whose upload
//    trigger (POST /api/media/[id]/start-processing) never fired, e.g. the
//    client closed/crashed right after its Storage PUT resolved. Split by
//    whether the file actually made it to Storage: if it did, only the
//    trigger call was lost, so processing is retriggered here instead of
//    failing a row that has everything it needs; if it didn't, the upload
//    was genuinely abandoned and the row is flipped to 'failed'.
//
// This route's job is auth, running both sweeps, and logging one audit
// event per row each sweep touches, so the audit trail says *why* a row
// resolved instead of silently changing status. See
// System Docs/Utilities/Media.md's sweep sections for the full
// design/threshold rationale.
//
// To test on preview without waiting for the cron schedule:
// curl https://{preview-url}/api/cron/media-sweep -H "Authorization: Bearer <CRON_SECRET>"

import { timingSafeEqual } from 'crypto'
import { after } from 'next/server'
import {
  sweepStaleProcessingItems,
  sweepStalePendingItems,
  STALE_PROCESSING_ERROR_MESSAGE,
  STALE_PENDING_ERROR_MESSAGE,
  isMediaAuditEnabled,
  logMediaEvent,
} from '@/services/media'
import { processMediaItem } from '@/services/media/processor'
import { AuditAction } from '@/services/audit/types'

// 15 min — Vercel Pro plan, matches the other processMediaItem trigger
// routes. Only reached when sweepStalePendingItems finds a recovered row to
// retrigger (below) — the common case (nothing stale, or only 'failed'
// flips) returns in milliseconds regardless of this ceiling.
export const maxDuration = 900
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

  const staleProcessing = await sweepStaleProcessingItems()

  for (const item of staleProcessing) {
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

  const { recovered, abandoned } = await sweepStalePendingItems()

  for (const item of abandoned) {
    console.log('[media-sweep] flipped abandoned pending row to failed (file never reached Storage)', {
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
          error_message: STALE_PENDING_ERROR_MESSAGE,
          pipeline_step: 'stale_pending_sweep',
          stalled_since: item.created_at,
        },
      })
    }
  }

  for (const item of recovered) {
    console.log('[media-sweep] file present in Storage for a stale pending row — retriggering processing', {
      media_item_id: item.id,
      type: item.type,
      stalled_since: item.created_at,
    })

    // Same after() wrap as every other processMediaItem trigger site —
    // this route's own invocation must stay alive until the retriggered
    // job settles, not just the response that follows.
    after(() =>
      processMediaItem(item).catch((err) => {
        console.error('[media-sweep] retriggered processMediaItem threw unexpectedly', {
          media_item_id: item.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }),
    )
  }

  return Response.json({
    ok: true,
    swept: staleProcessing.length,
    pendingRecovered: recovered.length,
    pendingAbandoned: abandoned.length,
  })
}
