'use client'

import { useState } from 'react'
import type { MediaItemStatus } from '@/services/media/types'

export type MediaUploadType = 'audio' | 'image' | 'document'

export interface UploadResult {
  mediaItemId: string
  type: MediaUploadType
  filename: string
  /**
   * The item's actual status as of this response — 'pending' for a freshly
   * created row (createMediaItem always creates one at 'pending'), or the
   * server-reported status of the reused row on a duplicate match (never a
   * hardcoded guess — see the route's dedup branch). Callers must seed their
   * local media-item state from this, not assume every result means "brand
   * new and pending": a duplicate can reuse an already-`ready` item.
   */
  status: MediaItemStatus
  /**
   * True when this reused an existing media_items row (a content-hash
   * match) instead of a new upload actually happening — false for both a
   * genuinely fresh upload AND the "matched a failed row with no file in
   * Storage" fallback (upload-url/route.ts), since that case behaves
   * exactly like a fresh upload from here down (a real PUT happens). Only
   * an actual reused-row response sets this. ChatInput.tsx uses it to
   * render duplicate-specific messaging instead of treating this like a
   * brand new attach.
   */
  duplicate: boolean
}

function classifyFile(file: File): MediaUploadType {
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('image/')) return 'image'
  return 'document'
}

/**
 * SHA-256 of the file's bytes, hex-encoded. Computed client-side because file
 * bytes never pass through the Next.js server (the client PUTs directly to
 * Supabase Storage) — this is the only place a content hash can be produced.
 * Sent to /api/media/upload-url so the server can detect a duplicate upload
 * (same member, same chat, identical content) before creating a new row.
 * Best-effort: returns null if the Web Crypto API is unavailable (e.g. a
 * non-secure context) rather than blocking the upload over a missing hash.
 */
async function sha256Hex(file: File): Promise<string | null> {
  try {
    const buffer = await file.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch (err) {
    console.error('[media/useMediaUpload] content hash failed, proceeding without dedup:', err)
    return null
  }
}

/**
 * Reusable hook for uploading a file through the signed-URL media pipeline.
 * The hook is upload-only — it does not send guide turns or inject messages.
 * The caller (ChatInput) handles acknowledgement and chat flow.
 */
export function useMediaUpload(
  sessionId: string | null,
  memberId: string | null,
): {
  upload: (file: File) => Promise<UploadResult | null>
  isUploading: boolean
  error: string | null
} {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File): Promise<UploadResult | null> => {
    setError(null)
    setIsUploading(true)

    let mediaItemId: string | null = null

    try {
      const contentHash = await sha256Hex(file)

      // Step 1: get a signed upload URL + create the media_items record server-side
      const urlRes = await fetch('/api/media/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          fileSize: file.size,
          chatId: sessionId,
          memberId,
          contentHash,
        }),
      })

      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Upload URL request failed: ${urlRes.status}`)
      }

      const result = await urlRes.json()
      mediaItemId = result.mediaItemId

      // The server found an identical-content item already uploaded by this
      // member in this chat — reuses that row, reported honestly (real
      // status, never silently reprocessed — see the route's own header
      // comment). Nothing left to upload; skip the Storage PUT entirely.
      if (result.duplicate) {
        if (!mediaItemId) throw new Error('mediaItemId unexpectedly null on a duplicate response')
        return {
          mediaItemId,
          type: classifyFile(file),
          filename: file.name,
          status: (result.status as MediaItemStatus | undefined) ?? 'pending',
          duplicate: true,
        }
      }

      const { signedUrl } = result

      // Fire upload_started after the media_items record exists so the event
      // route can resolve metadata. Best-effort — never blocks the upload.
      void fetch('/api/events/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaItemId, event: 'upload_started' }),
      })

      // Step 2: PUT the file binary directly to Supabase Storage
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      if (!uploadRes.ok) {
        throw new Error(`Storage upload failed: ${uploadRes.status}`)
      }

      // Triggers processing directly — this is now the ONLY trigger for a
      // fresh upload's processing (see
      // app/api/media/[id]/start-processing/route.ts and
      // app/api/webhooks/media-process/route.ts's now-inert INSERT handler).
      // Also logs media.upload_completed itself, replacing the old
      // /api/events/media call for that event. Best-effort — never blocks
      // the upload; a lost call here is recovered by
      // sweepStalePendingItems (services/media/index.ts).
      void fetch(`/api/media/${mediaItemId}/start-processing`, { method: 'POST' })

      if (!mediaItemId) throw new Error('mediaItemId unexpectedly null after upload')
      return {
        mediaItemId,
        type: classifyFile(file),
        filename: file.name,
        // A freshly created row is always 'pending' — createMediaItem
        // (services/media/index.ts) hardcodes this server-side. Also true
        // for the "matched a failed row with no file in Storage" fallback,
        // which resets that row to 'pending' before returning this same
        // non-duplicate response shape.
        status: 'pending',
        duplicate: false,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setError(msg)
      console.error('[media/useMediaUpload] upload failed:', err)
      if (mediaItemId) {
        void fetch('/api/events/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mediaItemId, event: 'upload_failed', error_message: msg }),
        })
      }
      return null
    } finally {
      setIsUploading(false)
    }
  }

  return { upload, isUploading, error }
}
