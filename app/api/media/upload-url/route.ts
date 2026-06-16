// POST /api/media/upload-url
// Creates a signed Supabase Storage upload URL + a media_items record at
// status=pending. The client PUTs the file binary directly to Supabase —
// the file never passes through this server (sidesteps Vercel's 4.5MB limit).
//
// Accepted types: audio/*, image/jpeg, image/png, image/gif, image/webp,
// application/pdf, .docx, .txt. HEIC is rejected — Claude vision does not
// support it.

import { getCurrentUser } from '@/services/auth'
import { getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { createMediaItem, type MediaItemType } from '@/services/media'
import { buildMediaStoragePath, generateSignedUploadUrl } from '@/services/media/storage'

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
