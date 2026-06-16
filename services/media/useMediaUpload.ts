'use client'

import { useState } from 'react'

export type MediaUploadType = 'audio' | 'image' | 'document'

export interface UploadResult {
  mediaItemId: string
  type: MediaUploadType
  filename: string
}

function classifyFile(file: File): MediaUploadType {
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('image/')) return 'image'
  return 'document'
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

    try {
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
        }),
      })

      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Upload URL request failed: ${urlRes.status}`)
      }

      const { signedUrl, mediaItemId } = await urlRes.json()

      // Step 2: PUT the file binary directly to Supabase Storage
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      if (!uploadRes.ok) {
        throw new Error(`Storage upload failed: ${uploadRes.status}`)
      }

      return {
        mediaItemId,
        type: classifyFile(file),
        filename: file.name,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setError(msg)
      console.error('[media/useMediaUpload] upload failed:', err)
      return null
    } finally {
      setIsUploading(false)
    }
  }

  return { upload, isUploading, error }
}
