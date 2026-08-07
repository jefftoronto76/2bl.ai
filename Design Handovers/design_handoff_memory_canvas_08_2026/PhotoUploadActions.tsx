'use client';

/**
 * PhotoUploadActions — the row under a ready photo attachment.
 *
 * Three icons, in order: Bookmark · Add-to-memory · GPS-found.
 * Bookmark and Add-to-memory are ACTIONS — hover-gated, matching every other
 * message-action row in the product (`[@media(hover:none)]` keeps them visible
 * on touch, same convention as MemoryOffer / SidebarMemoryCount elsewhere in
 * this handoff set).
 *
 * TRANSITION on bookmark click (reuses package 3's, not redefined here):
 * the button itself has no click micro-animation — clicking it inserts a new
 * `running` pill into the transcript, which resolves to the `draft` card with
 * the 260ms rise transition specified in design_handoff_memories §5
 * (opacity 0→1, translateY 10px→0, scale .98→1, `cubic-bezier(.22,1,.36,1)`).
 * Do not add a separate animation on this button — the payoff is the card
 * appearing, not the icon.
 *
 * The GPS badge is a STATUS, not an action — it renders whenever `gpsFound` is
 * true regardless of hover, and has no onClick. Do not add hover-gating to it;
 * that was a deliberate distinction from the design pass, not an oversight.
 */

import { Bookmark, Plus, MapPin } from 'lucide-react';
import type { Upload } from './types';

const actionBtn =
  'grid h-7 w-7 shrink-0 place-items-center rounded-lg border-none bg-transparent text-text-secondary transition-colors hover:bg-black/[0.06] hover:text-text-primary';

export function PhotoUploadActions({
  upload,
  onBookmark,
  onAddToMemory,
}: {
  upload: Upload;
  onBookmark: () => void;
  onAddToMemory: () => void;
}) {
  if (upload.status !== 'ready') return null;
  return (
    <div className="flex items-center gap-0.5 pr-0.5">
      {/* GPS badge first in DOM so it never gets clipped by hover-opacity on the group */}
      {upload.gpsFound && <GpsFoundBadge />}
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button aria-label="Bookmark as a memory" title="Bookmark as a memory" onClick={onBookmark} className={actionBtn}>
          <Bookmark size={14} />
        </button>
        <button aria-label="Add to a memory" title="Add to a memory" onClick={onAddToMemory} className={actionBtn}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export function GpsFoundBadge() {
  return (
    <span
      title="GPS data found"
      aria-label="GPS data found"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-accent"
    >
      <MapPin size={14} />
    </span>
  );
}
