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
// the same hash is reused instead of creating an independent row.
//
// This route NEVER auto-reprocesses a matched row, for any status —
// previously a `failed` match was silently reset to pending and
// reprocessed here, transparently, with no member-visible signal beyond a
// small warning icon. That looked safe but wasn't: it assumed the original
// file bytes were still in Storage without checking, and a confirmed
// production case (an upload interrupted mid-PUT on cellular, whose row
// still reached 'processing') showed it retrying forever against a file
// that was never actually there, always failing with the same misleading
// "Storage object not available" message. Every match is now just reported
// honestly (real status, untouched) so the member can see what actually
// happened and choose to retry via POST /api/media/[id]/retry (which does
// verify Storage first — see verifyAndReprocess, services/media/processor.ts).
//
// One exception: a `failed` match whose file is confirmed missing skips the
// "report as duplicate" response entirely and instead falls through to an
// ordinary fresh-upload response (reusing the same row/storage_path) — the
// client already has real bytes in hand right now, mid-attach, so there's
// no reason to make the member click a doomed retry badge first when a real
// upload can just happen immediately.

import { getCurrentUser } from '@/services/auth'
import { getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { createMediaItem, findDuplicateMediaItem, isMediaAuditEnabled, logMediaEvent, updateMediaItem, type MediaItemType } from '@/services/media'
import { buildMediaStoragePath, generateSignedUploadUrl, objectExists } from '@/services/media/storage'
import { AuditAction } from '@/services/audit/types'

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
      // A `failed` match whose file never actually reached Storage isn't a
      // real duplicate to report — there is nothing to point the member at.
      // Skip the dedup response entirely and fall through to an ordinary
      // fresh upload, reusing this row's id/storage_path instead of minting
      // a new one, since the client has real bytes in hand right now.
      if (existing.status === 'failed' && !(await objectExists(existing.storage_path))) {
        await updateMediaItem(existing.id, {
          status: 'pending',
          error_message: null,
          derived_content: null,
          classification: null,
          processed_at: null,
        })

        const { signedUrl } = await generateSignedUploadUrl(existing.storage_path)

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
              reprocessed: false,
              needs_reupload: true,
              fresh_upload_fallback: true,
              timestamp: new Date().toISOString(),
            },
          })
        }

        console.log('[media/upload-url] duplicate matched a failed row with no file in Storage — falling back to a fresh upload against the same row', {
          mediaItemId: existing.id,
          chatId,
          memberId,
          tenantId,
        })

        return Response.json({ signedUrl, mediaItemId: existing.id })
      }

      // Every other match (ready/pending/processing, or a failed match
      // whose file IS present) is just reported honestly — this route never
      // auto-reprocesses. A failed match keeps its real 'failed' status (not
      // silently reset to 'pending') so the client can show a real retry
      // affordance instead of silently reprocessing behind the member's back.
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
            reprocessed: false,
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

      return Response.json({ mediaItemId: existing.id, duplicate: true, status: existing.status })
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
