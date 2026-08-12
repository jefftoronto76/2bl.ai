// POST /api/webhooks/media-process
// Supabase Database Webhook receiver for media_items INSERT.
//
// INTENTIONAL NO-OP as of the Step 2 trigger-ordering fix: this used to call
// processMediaItem directly on every pending INSERT, but the INSERT this
// fires on happens in POST /api/media/upload-url — before the signed
// upload URL is even returned to the client, let alone before the client's
// PUT of the file bytes (a separate, later request) lands in Storage. On a
// slow connection (confirmed: reliable success on wifi, reliable failure on
// cellular) the PUT can easily outlast the pipeline's bounded wait for the
// object to appear, failing the job with "Storage object not available
// after N attempts" even though the upload was simply still in flight.
//
// The real trigger is now POST /api/media/[id]/start-processing, called by
// the client only once its own PUT has actually resolved — see that route's
// header comment. This route can't simply be deleted or have its Supabase
// trigger removed from here (DB webhook configuration lives in Supabase
// Studio, outside this codebase's control, and Supabase will keep POSTing
// to whatever URL is configured regardless), so it stays wired but inert:
// verify the signature, log receipt for observability, respond 200 so
// Supabase doesn't retry-storm it, and stop there.
//
// To test locally / on preview:
// curl -X POST https://{preview-url}/api/webhooks/media-process \
//   -H "Content-Type: application/json" \
//   -H "x-supabase-signature: <SUPABASE_WEBHOOK_SECRET>" \
//   -d '{"type":"INSERT","table":"media_items","schema":"public","record":{...},"old_record":null}'

import { timingSafeEqual } from 'crypto'
import type { MediaItem } from '@/services/media'

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

  console.log('[media-process] received INSERT — no-op, processing triggers from POST /api/media/[id]/start-processing instead', {
    media_item_id: record.id,
    type: record.type,
    tenant_id: record.tenant_id,
    status: record.status,
  })

  return Response.json({ ok: true, skipped: true })
}
