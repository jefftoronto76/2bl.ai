'use client'

/**
 * PhotoUploadActions — the action row under a ready photo upload (Photo
 * Bookmark, 2026-08-08). Adapted (not copied) from the real designed
 * reference, Design Handovers/design_handoff_memory_canvas_08_2026/PhotoUploadActions.tsx —
 * placement corrected per a second, more recent design reference
 * (chat-widget-canvas.jsx's UploadThumb): this renders BELOW the thumbnail
 * as its own row, right-aligned under the image, NOT an overlay on top of
 * it (the original reference's own doc comment describes an overlay that
 * the newer reference supersedes).
 *
 * Bookmark and "+" (add to a memory) are hover-gated on the WHOLE
 * THUMBNAIL's hover state — the `group` ancestor MessageList.tsx wraps
 * around both the thumbnail and this row, not a `group` on this row alone —
 * with the [@media(hover:none)] fallback kept, same convention as every
 * other hover-gated action in this app tonight (BlockCanvas.tsx's remove
 * button, MemoryCard.tsx's title-edit pencil). GPS is a STATUS, not an
 * action: renders first, never hover-gated, no onClick. Wired to a real
 * signal (2026-08-08, GPS Extraction) — MessageList.tsx passes
 * `mediaItem.latitude`/`.longitude` (services/media/processor.ts's
 * extractGpsCoordinates) — so this renders whenever the photo's own EXIF
 * actually carried GPS data; most photos won't (screenshots, downloads,
 * location services off), so it stays absent for the common case.
 *
 * Icon hit targets are 28px (h-7 w-7) circular, per the design spec.
 */

import { Bookmark, Plus, MapPin } from 'lucide-react'

const actionBtn =
  'grid h-7 w-7 shrink-0 place-items-center rounded-full border-none bg-transparent text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-text-muted'

export interface PhotoUploadActionsProps {
  /** Only rendered once the underlying media item is 'ready' — nothing to bookmark/add before then (matches PhotoUploadActions.tsx's own `upload.status !== 'ready'` guard). */
  isReady: boolean
  onBookmark: () => void
  onAddToMemory: () => void
  /** Mirrors UserMessageActions.tsx's own hasMemory/keepDisabled convention for the whole-message bookmark — same filled-icon + disabled treatment once this exact photo already has a memory. */
  hasMemory?: boolean
  keepDisabled?: boolean
  /** Always false/undefined today — see the doc comment above. */
  gpsFound?: boolean
}

export function PhotoUploadActions({
  isReady,
  onBookmark,
  onAddToMemory,
  hasMemory,
  keepDisabled,
  gpsFound,
}: PhotoUploadActionsProps) {
  if (!isReady) return null
  return (
    <div className="flex justify-end gap-0.5 pt-1">
      {/* GPS badge first in DOM so it never gets clipped by hover-opacity on the group */}
      {gpsFound && (
        <span
          title="GPS data found"
          aria-label="GPS data found"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-accent"
        >
          <MapPin size={14} aria-hidden />
        </span>
      )}
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          onClick={onBookmark}
          disabled={keepDisabled}
          aria-label={hasMemory ? 'Memory kept from this photo' : 'Bookmark as a memory'}
          title={hasMemory ? 'Memory kept from this photo' : 'Bookmark as a memory'}
          className={actionBtn}
        >
          <Bookmark size={14} aria-hidden fill={hasMemory ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          onClick={onAddToMemory}
          aria-label="Add to a memory"
          title="Add to a memory"
          className={actionBtn}
        >
          <Plus size={14} aria-hidden />
        </button>
      </div>
    </div>
  )
}
