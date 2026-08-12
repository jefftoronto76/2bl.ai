// POST /api/media/upload-url
// Creates a signed Supabase Storage upload URL + a media_items record at
// status=pending. The client PUTs the file binary directly to Supabase —
// the file never passes through this server (sidesteps Vercel's 4.5MB limit).
//
// Accepted types: audio/*, image/jpeg, image/png, image/gif, image/webp,
// application/pdf, .docx, .txt. HEIC is rejected — Claude vision does not
// support it.
//
// Dedup: if the client supplies a contentHash (SHA-256 of the file bytes,
// computed client-side in useMediaUpload.ts — bytes never reach this server),
// an existing media_items row from the same member, in the same chat, with
// the same hash is reused instead of creating an independent row. A match
// against a previously-failed row is reprocessed directly (same pattern as
// the retry endpoint), rather than staying a dead, permanently-failed row.

import { after } from 'next/server'
import { getCurrentUser } from '@/services/auth'
import { getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { createMediaItem, findDuplicateMediaItem, isMediaAuditEnabled, logMediaEvent, updateMediaItem, type MediaItemType } from '@/services/media'
import { buildMediaStoragePath, generateSignedUploadUrl } from '@/services/media/storage'
import { processMediaItem } from '@/services/media/processor'
import { AuditAction } from '@/services/audit/types'

// 15 min — Vercel Pro plan, matches the other processMediaItem trigger
// routes. This route only needs it for the dedup-reprocess branch below
// (a previously-failed duplicate match), which drives the same pipeline.
export const maxDuration = 900
export const runtime = 'nodejs'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

const ACCEPTED_MIME_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/m4a',
  'audio/x-m4a',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
])

function classifyMimeType(mimeType: string): MediaItemType | null {
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('image/')) return 'image'
  if (
    mimeType === 'application/pdf' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'text/plain'
  )
    return 'document'
  return null
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    return Response.json({ error: 'Tenant not found' }, { status: 400 })
  }

  let body: {
    filename?: unknown
    mimeType?: unknown
    fileSize?: unknown
    chatId?: unknown
    contentHash?: unknown
  } = {}
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const filename =
    typeof body.filename === 'string' && body.filename.trim().length > 0
      ? body.filename.trim()
      : null
  const mimeType =
    typeof body.mimeType === 'string' && body.mimeType.trim().length > 0
      ? body.mimeType.trim().toLowerCase()
      : null
  const fileSize = typeof body.fileSize === 'number' ? body.fileSize : null
  const chatId = typeof body.chatId === 'string' ? body.chatId : null
  // Optional — null when the client couldn't compute one (best-effort, see
  // useMediaUpload.ts's sha256Hex). No hash means no dedup check for this upload.
  const contentHash = typeof body.contentHash === 'string' ? body.contentHash : null

  if (!filename) return Response.json({ error: 'filename is required' }, { status: 400 })
  if (!mimeType) return Response.json({ error: 'mimeType is required' }, { status: 400 })
  if (fileSize === null) return Response.json({ error: 'fileSize is required' }, { status: 400 })

  // HEIC rejection — clear user-friendly message
  if (mimeType === 'image/heic' || mimeType === 'image/heif' || filename.toLowerCase().endsWith('.heic')) {
    return Response.json(
      {
        error:
          "iPhone photos in HEIC format aren't supported yet — try exporting as JPG from your Photos app.",
      },
      { status: 415 },
    )
  }

  if (!ACCEPTED_MIME_TYPES.has(mimeType)) {
    return Response.json({ error: `File type not supported: ${mimeType}` }, { status: 415 })
  }

  if (fileSize > MAX_FILE_SIZE) {
    return Response.json({ error: 'File exceeds the 50 MB size limit' }, { status: 413 })
  }

  const type = classifyMimeType(mimeType)
  if (!type) {
    return Response.json({ error: 'Unable to classify file type' }, { status: 415 })
  }

  // Resolve members.id for this user + tenant
  const supabase = getAdminClient()
  const { data: memberRow, error: memberErr } = await supabase
    .from('members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('clerk_id', user.providerUserId)
    .single()

  if (memberErr || !memberRow) {
    console.error('[media/upload-url] members lookup failed', {
      clerkUserId: user.providerUserId,
      tenantId,
      error: memberErr?.message,
    })
    return Response.json({ error: 'Member record not found' }, { status: 403 })
  }

  const memberId = memberRow.id

  if (contentHash) {
    const existing = await findDuplicateMediaItem({ tenantId, memberId, chatId, contentHash })
    if (existing) {
      // A previously-failed match is reprocessed directly (same pattern as
      // POST /api/media/[id]/retry) rather than reused as a dead row — the
      // original bytes are assumed still in Storage, matching retry's own
      // assumption. ready/pending/processing matches need no action at all.
      if (existing.status === 'failed') {
        await updateMediaItem(existing.id, {
          status: 'pending',
          error_message: null,
          derived_content: null,
          classification: null,
          processed_at: null,
        })
        // after() keeps this invocation alive until the promise settles —
        // a bare `void` here had the same permanently-stuck-at-'processing'
        // risk Step 1 fixed for the webhook/retry routes, just missed on
        // this third direct-call site at the time.
        after(() =>
          processMediaItem(existing).catch((err) => {
            console.error('[media/upload-url] dedup reprocess threw unexpectedly', {
              mediaItemId: existing.id,
              error: err instanceof Error ? err.message : String(err),
            })
          }),
        )
      }

      if (isMediaAuditEnabled()) {
        await logMediaEvent({
          tenant_id: tenantId,
          member_id: memberId,
          media_item_id: existing.id,
          action: AuditAction.MEDIA_UPLOAD_DEDUPED,
          outcome: 'success',
          correlation_id: crypto.randomUUID(),
          metadata: {
            original_filename: filename,
            mime_type: mimeType,
            file_size_bytes: fileSize,
            chat_id: chatId,
            matched_previous_status: existing.status,
            reprocessed: existing.status === 'failed',
            timestamp: new Date().toISOString(),
          },
        })
      }

      console.log('[media/upload-url] duplicate detected, reusing existing item', {
        mediaItemId: existing.id,
        matchedPreviousStatus: existing.status,
        chatId,
        memberId,
        tenantId,
      })

      // Report the item's ACTUAL current status back to the client — a
      // failed match was just reset to pending above (and reprocessing
      // kicked off), so that's what's reported for that case; ready/pending/
      // processing matches are untouched and reported as-is. The client uses
      // this to seed its local media-item state correctly instead of
      // assuming every dedup response means "brand new, still pending" —
      // that assumption previously reset an already-`ready` item back to
      // `pending` client-side on every re-attach.
      const status = existing.status === 'failed' ? 'pending' : existing.status

      return Response.json({ mediaItemId: existing.id, duplicate: true, status })
    }
  }

  const mediaItemId = crypto.randomUUID()
  const storagePath = buildMediaStoragePath(tenantId, memberId, mediaItemId, filename)

  // Create the media_items record first (status=pending), then get the upload URL.
  // If URL generation fails the row exists but won't be processed (stays pending
  // and can be retried).
  await createMediaItem({
    id: mediaItemId,
    tenant_id: tenantId,
    member_id: memberId,
    chat_id: chatId,
    type,
    original_filename: filename,
    storage_path: storagePath,
    file_size_bytes: fileSize,
    mime_type: mimeType,
    content_hash: contentHash,
  })

  const { signedUrl } = await generateSignedUploadUrl(storagePath)

  console.log('[media/upload-url] created', {
    mediaItemId,
    type,
    filename,
    chatId,
    memberId,
    tenantId,
  })

  return Response.json({ signedUrl, mediaItemId })
}
