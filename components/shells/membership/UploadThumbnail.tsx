'use client'

/**
 * UploadThumbnail — the inline upload rendering for every attachment type
 * (image, audio, document), built to the same bar as Claude.ai's own chat:
 * the image/icon renders inline as part of the message, full stop. No
 * separate card, no eyebrow text, no status line, no quick actions, no
 * story chips, no Keep/Discard footer.
 *
 * Root-cause commitment (see the commit that deleted UploadCard.tsx and the
 * card family this replaces): the persistent visual element — the <img> for
 * images, the icon for audio/document — occupies the exact same JSX
 * position and element TYPE across every status. React's reconciliation is
 * type-based; if this ever branched into rendering a different element type
 * per status (a full card here, a placeholder <div> there), React would
 * tear down and rebuild the whole subtree on every status change — which is
 * exactly the bug this replaces. Shimmer and the failure badge are additive
 * siblings, conditionally rendered as children, never a wrapper whose own
 * type changes. Even the <img> itself is never swapped for a placeholder —
 * it always renders, falling back to a 1x1 transparent pixel until a real
 * `src` resolves, so the shimmer sits over an empty image slot rather than
 * the tree changing shape.
 *
 * `sourceKind` (and therefore `isImage`/the icon) is derived once from the
 * upload's own `type` field, which never changes for a given attachment —
 * only `item.status` changes across an upload's lifecycle, and status only
 * ever adds/removes the two small overlay siblings below.
 *
 * Image src prefers item.localPreviewUrl (an instant, local blob: URL, no
 * expiry — set synchronously at attach time in ChatInput.tsx) over
 * item.url (the batch-fetched signed URL from GET /api/media, 60s expiry —
 * services/media/storage.ts's generateSignedDownloadUrl). Same fallback
 * order the deleted InlineImage used. When localPreviewUrl isn't available —
 * a page reload, or loading a session's history where no local blob ever
 * existed — item.url's 60s expiry becomes a real bug, so that fallback path
 * runs through useFreshImageUrl (services/media/useFreshImageUrl.ts) to
 * re-resolve it at display time, same mechanism as the memory panel's
 * BlockCanvas.tsx. The hook is only fed a mediaItemId when localPreviewUrl
 * is absent, so a live local blob never triggers a wasted re-fetch.
 *
 * No Discard — not in the reference spec this was built to. A failed item
 * has one control: the retry badge, calling the real POST
 * /api/media/{id}/retry — UNLESS the item needs a re-upload (isNeedsReupload,
 * services/media/errorCopy.ts): a reprocess attempt already confirmed no
 * file exists in Storage to retry against, so retrying again is guaranteed
 * to fail identically forever. That state renders a disabled, differently-
 * worded badge instead of a live retry action — see handleRetry below.
 *
 * duplicateLabel (small pill, top-left) is the one deliberate exception to
 * this file's own "no eyebrow text, no status line" rule above — added for
 * the duplicate-upload-surfacing fix, where showing the real thumbnail with
 * NO indication it's a reused item (not a fresh upload) would say nothing
 * at all to the member. Rendered as an additive overlay sibling, same
 * pattern as the shimmer/failure-badge/ready-checkmark below, not a
 * wrapper — the persistent-element-identity rule above still holds.
 */

import { useState } from 'react'
import { Feather, AlertTriangle, Check } from 'lucide-react'
import type { MemorySourceKind } from '@/services/chat/ui/v1/useMemories'
import type { ClientMediaItem } from './chatStore'
import { memoryKindOf, KIND_ICONS } from './memory/memoryKinds'
import { sanitizeFailureReason, isNeedsReupload } from '@/services/media/errorCopy'
import { useFreshImageUrl } from '@/services/media/useFreshImageUrl'

// 1x1 transparent PNG — keeps the <img> element itself always present (never
// swapped for a placeholder <div>) even before a real src resolves.
const BLANK_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export interface UploadThumbnailProps {
  item: ClientMediaItem | undefined
  sourceKind: MemorySourceKind
  filename: string
  /** Image + ready only. Omitted entirely until the lightbox lands. */
  onEnlarge?: (src: string, filename: string) => void
  /**
   * Small pill overlay (top-left) shown alongside the real thumbnail for a
   * content-hash duplicate match — e.g. "Already uploaded", "Already being
   * processed", "Matches a previous upload that failed". Omitted for a
   * genuinely fresh upload. See MessageList.tsx's MEDIA_UPLOAD_DUPLICATE
   * rendering for how the text is chosen per status.
   */
  duplicateLabel?: string
}

// Thumbnail bounding box — an image is scaled (never upscaled) to fit within
// this box while preserving its real aspect ratio, replacing the old fixed
// 192x144 crop. Placeholder for the shimmer phase when dimensions aren't
// known yet (rare: send fired before the pick-time decode in ChatInput.tsx
// resolved) matches the previous fixed box so the shimmer doesn't collapse.
const THUMB_MAX_W = 240
const THUMB_MAX_H = 320
const UPLOADING_PLACEHOLDER_BOX = { width: 192, height: 144 }

function thumbnailBoxSize(width?: number, height?: number): { width: number; height: number } | null {
  if (!width || !height) return null
  const scale = Math.min(THUMB_MAX_W / width, THUMB_MAX_H / height, 1)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export function UploadThumbnail({ item, sourceKind, filename, onEnlarge, duplicateLabel }: UploadThumbnailProps) {
  const kind = memoryKindOf(sourceKind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather
  const isImage = sourceKind === 'photo'
  const isUploading = !item || item.status === 'pending' || item.status === 'processing'
  const isFailed = item?.status === 'failed'
  const isReady = item?.status === 'ready'
  const hasLocalPreview = !!item?.localPreviewUrl
  const { url: freshUrl } = useFreshImageUrl(hasLocalPreview ? undefined : item?.id, item?.url ?? undefined)
  const src = item?.localPreviewUrl ?? freshUrl ?? null
  const canEnlarge = isImage && isReady && !!src && !!onEnlarge
  // Historical items loaded on reload never carry width/height (client-only,
  // not persisted — see Design Handovers note in the plan this ships from),
  // so this is null there; the img falls back to its own intrinsic sizing
  // clamped by max-w-60/max-h-80 below, same as CSS-only object-contain.
  const boxSize = isImage
    ? thumbnailBoxSize(item?.width, item?.height) ?? (isUploading ? UPLOADING_PLACEHOLDER_BOX : null)
    : null

  // The DB-persisted signal (survives a reload/different session — set by
  // verifyAndReprocess whenever it ran, in THIS session or another one) OR
  // this session's own just-confirmed retry response, whichever fires
  // first. Retry's own JSON response is checked directly here for instant
  // feedback rather than waiting on chatStore's ~3s poll to pick up the new
  // error_message — see handleRetry below.
  const [confirmedNeedsReupload, setConfirmedNeedsReupload] = useState(false)
  const needsReupload = confirmedNeedsReupload || isNeedsReupload(item?.error_message ?? null)

  const handleRetry = async () => {
    if (!item || needsReupload) return
    try {
      const res = await fetch(`/api/media/${item.id}/retry`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (body?.needsReupload) setConfirmedNeedsReupload(true)
    } catch (err) {
      console.error('[UploadThumbnail] retry failed:', err)
    }
  }

  const retryLabel = isFailed
    ? needsReupload
      ? 'This file is missing — attach it again to retry'
      : `Retry — ${sanitizeFailureReason(item.error_message)}`
    : undefined

  return (
    <div className="flex justify-end">
      <div
        className={
          isImage
            ? 'relative max-w-60 max-h-80 overflow-hidden rounded-2xl rounded-br-sm border border-border bg-surface'
            : 'relative flex max-w-[75%] items-center gap-2.5 overflow-hidden rounded-2xl rounded-br-sm border border-border bg-surface px-3.5 py-2.5'
        }
      >
        {isImage ? (
          <img
            src={src ?? BLANK_PIXEL}
            alt={filename}
            onClick={canEnlarge ? () => onEnlarge!(src!, filename) : undefined}
            className={`block max-w-60 max-h-80 object-contain${canEnlarge ? ' cursor-zoom-in' : ''}`}
            style={boxSize ? { width: boxSize.width, height: boxSize.height } : undefined}
          />
        ) : (
          <>
            <span className="flex-shrink-0 text-accent"><Icon size={16} aria-hidden /></span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-body text-text-primary leading-tight">
              {filename}
            </span>
          </>
        )}

        {isUploading && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 animate-upload-shimmer motion-reduce:animate-none"
            style={{
              backgroundImage:
                'linear-gradient(100deg, transparent 30%, rgb(var(--color-accent) / 0.28) 50%, transparent 70%)',
              backgroundSize: '200% 100%',
            }}
          />
        )}

        {isFailed && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={needsReupload}
            aria-label={retryLabel}
            title={retryLabel}
            className={`absolute bottom-1.5 right-1.5 grid size-6 place-items-center rounded-full text-white before:absolute before:-inset-[9px] before:content-[''] ${
              needsReupload ? 'bg-text-muted cursor-not-allowed' : 'bg-red-400'
            }`}
          >
            <AlertTriangle size={12} aria-hidden />
          </button>
        )}

        {duplicateLabel && (
          <span
            className="absolute top-1.5 left-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-full bg-black/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-white"
            title={duplicateLabel}
          >
            {duplicateLabel}
          </span>
        )}

        {/* Persistent — no fade/timer, stays for as long as the thumbnail
            renders in the 'ready' status. Same size/corner treatment as the
            failure badge (mirrored to bottom-left), independent of it —
            the two are mutually exclusive statuses but never share state or
            a conditional. Not a <button>: unlike the retry badge, this has
            no action, so it's a decorative, non-focusable confirmation. */}
        {isReady && (
          <span
            aria-hidden="true"
            data-testid="ready-checkmark"
            className="absolute bottom-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-green-400 text-white"
          >
            <Check size={12} aria-hidden />
          </span>
        )}
      </div>
    </div>
  )
}
