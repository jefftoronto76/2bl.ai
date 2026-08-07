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
 * order the deleted InlineImage used; not something this pass changes.
 *
 * No Discard — not in the reference spec this was built to. A failed item
 * has one control: the retry badge, calling the real POST
 * /api/media/{id}/retry (already exists, already works).
 */

import { Feather, AlertTriangle } from 'lucide-react'
import type { MemorySourceKind } from '@/services/chat/ui/v1/useMemories'
import type { ClientMediaItem } from './chatStore'
import { memoryKindOf, KIND_ICONS } from './memory/memoryKinds'
import { sanitizeFailureReason } from '@/services/media/errorCopy'

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

export function UploadThumbnail({ item, sourceKind, filename, onEnlarge }: UploadThumbnailProps) {
  const kind = memoryKindOf(sourceKind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather
  const isImage = sourceKind === 'photo'
  const isUploading = !item || item.status === 'pending' || item.status === 'processing'
  const isFailed = item?.status === 'failed'
  const isReady = item?.status === 'ready'
  const src = item?.localPreviewUrl ?? item?.url ?? null
  const canEnlarge = isImage && isReady && !!src && !!onEnlarge
  // Historical items loaded on reload never carry width/height (client-only,
  // not persisted — see Design Handovers note in the plan this ships from),
  // so this is null there; the img falls back to its own intrinsic sizing
  // clamped by max-w-60/max-h-80 below, same as CSS-only object-contain.
  const boxSize = isImage
    ? thumbnailBoxSize(item?.width, item?.height) ?? (isUploading ? UPLOADING_PLACEHOLDER_BOX : null)
    : null

  const handleRetry = () => {
    if (!item) return
    void fetch(`/api/media/${item.id}/retry`, { method: 'POST' })
  }

  const retryLabel = isFailed ? `Retry — ${sanitizeFailureReason(item.error_message)}` : undefined

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
            aria-label={retryLabel}
            title={retryLabel}
            className="absolute bottom-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-red-400 text-white before:absolute before:-inset-[9px] before:content-['']"
          >
            <AlertTriangle size={12} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
