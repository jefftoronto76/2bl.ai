'use client';

// Standalone top-level Media page (Stage 1,
// Design Handovers/media_stages_08_2026/stage-1-media-page-layout/).
// Independent of any chat session — shows every media file across the
// account. Distinct from MediaGallery.tsx, the in-chat panel scoped to the
// active session.
//
// The design reference (production-reference/chat-widget-canvas.jsx) uses
// `position: fixed; inset: 0` since its prototype has no transformed
// ancestor. Real ChatHero mounts inside ChatDrawerV2, whose root carries
// `translate-x-*` (a `transform`) — that establishes a new containing block,
// so a `fixed` descendant here would resolve against the drawer's own box,
// not the browser viewport, and (worse) get clipped by the drawer's
// `overflow-hidden` ancestors in a way that doesn't match "full-screen
// overlay" intent. `position: absolute; inset: 0` against the drawer's own
// `relative` body is the same fix already used by ChatHero's mobile Media
// bottom sheet and mobile memory overlay (search `absolute inset-0 z-40` in
// ChatHero.tsx) — this reuses that established pattern rather than inventing
// a second one, just at a higher z so it layers above both.
//
// Always mounted (not conditionally rendered) so the slide transform can
// animate on open/close; `inert` while closed keeps it out of the tab order
// and a11y tree the same way ChatDrawerV2 does for its own closed state.

import { useEffect, useRef, useState } from 'react';
import { Feather, Loader2, Image as ImageIcon, Upload, X } from 'lucide-react';
import type { MediaItemWithUrl } from '@/services/media/display-url';
import { MediaItemsGrid } from './media/MediaItemsGrid';

interface MediaPageProps {
  open: boolean;
  onClose: () => void;
  onFlash: (message: string) => void;
}

export function MediaPage({ open, onClose, onFlash }: MediaPageProps) {
  const [items, setItems] = useState<MediaItemWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!open || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetch('/api/media')
      .then((r) => r.json())
      .then((data: { items?: MediaItemWithUrl[] }) => {
        setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch((err) => console.error('[MediaPage] fetch failed:', err))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleRetry = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'pending' as const } : item)),
    );
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Media"
        inert={!open}
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-0 z-40 flex flex-col bg-background transition-transform duration-[450ms] ease-[cubic-bezier(.22,1,.36,1)] ${
          open ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
        }`}
      >
        <header className="flex items-center justify-between px-[18px] h-14 border-b border-border flex-shrink-0">
          <span className="flex items-center gap-2">
            <span className="w-[26px] h-[26px] rounded-md bg-accent-soft border border-accent/35 grid place-items-center text-accent">
              <Feather size={14} />
            </span>
            <span className="font-display font-semibold text-base text-text-primary">
              Heirloom
            </span>
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onFlash('Upload is coming soon')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-accent hover:bg-accent-hover text-background font-body text-[12.5px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Upload size={14} />
              Upload
            </button>
            <button
              type="button"
              aria-label="Close media page"
              onClick={onClose}
              className="grid place-items-center w-9 h-9 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto flex justify-center">
          <div className="w-full max-w-[780px] px-6 py-7">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-text-muted">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
                <ImageIcon size={28} className="text-text-muted opacity-40" />
                <p className="font-body text-sm text-text-muted">
                  No media yet. Attach a photo, audio file, or document to a message to get started.
                </p>
              </div>
            ) : (
              <MediaItemsGrid items={items} onRetry={handleRetry} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
