// POST /api/webhooks/media-process
// Supabase Database Webhook receiver for media_items INSERT.
// Verifies the shared-secret header, checks idempotency, then delegates
// to services/media/processor.ts for the full job lifecycle.
//
// To test locally / on preview without waiting for a real Supabase INSERT:
// curl -X POST https://{preview-url}/api/webhooks/media-process \
//   -H "Content-Type: application/json" \
//   -H "x-supabase-signature: <SUPABASE_WEBHOOK_SECRET>" \
//   -d '{"type":"INSERT","table":"media_items","schema":"public","record":{...},"old_record":null}'
// Replace {...} with a real media_items row at status=pending.

import { timingSafeEqual } from 'crypto'
import { processMediaItem } from '@/services/media/processor'
import type { MediaItem } from '@/services/media'

export const maxDuration = 900 // 15 min — Vercel Pro plan
export const runtime = 'nodejs'

interface SupabaseWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: Record<string, unknown>
  old_record: Record<string, unknown> | null
}

// Supabase Database Webhooks (pg_net) send the secret as a static header value,
// not as an HMAC digest. Compare directly with constant-time equality.
function verifySignature(signature: string): boolean {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[media-process] SUPABASE_WEBHOOK_SECRET is not set')
    return false
  }
  try {
    const secretBuf = Buffer.from(secret)
    const sigBuf = Buffer.from(signature)
    if (secretBuf.length !== sigBuf.length) return false
    return timingSafeEqual(secretBuf, sigBuf)
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const signature = req.headers.get('x-supabase-signature') ?? ''

  const valid = verifySignature(signature)
  if (!valid) {
    console.error('[media-process] signature verification failed')
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: SupabaseWebhookPayload
  try {
    const rawBody = await req.text()
    payload = JSON.parse(rawBody) as SupabaseWebhookPayload
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  // Only handle INSERT events on media_items
  if (payload.type !== 'INSERT' || payload.table !== 'media_items') {
    return Response.json({ ok: true, skipped: true })
  }

  const record = payload.record as unknown as MediaItem

  // Idempotency guard — if status is not 'pending' this is a duplicate delivery
  // (Supabase retries on non-2xx). Return 200 immediately without reprocessing.
  if (record.status !== 'pending') {
    console.log('[media-process] skipping non-pending record', {
      media_item_id: record.id,
      status: record.status,
    })
    return Response.json({ ok: true, skipped: true })
  }

  console.log('[media-process] processing', {
    media_item_id: record.id,
    type: record.type,
    tenant_id: record.tenant_id,
  })

  // Process asynchronously — do not await so Supabase gets a 200 immediately
  // while the background job runs. Vercel maxDuration keeps the function alive.
  void processMediaItem(record).catch((err) => {
    console.error('[media-process] processMediaItem threw unexpectedly', {
      media_item_id: record.id,
      error: err instanceof Error ? err.message : String(err),
    })
  })

  return Response.json({ ok: true })
}
