'use client';

import { useState } from 'react';
import { Image as ImageIcon, Loader2, X } from 'lucide-react';
import type { MediaItemWithUrl } from '@/services/media/display-url';
import { MediaItemsGrid } from './media/MediaItemsGrid';
import { useMediaDelete } from './media/useMediaItemActions';
import { useMediaPagination } from './media/useMediaPagination';
import { ConfirmDeleteModal } from './v2/ConfirmDeleteModal';
import { AddToMemoryPanel } from './media/AddToMemoryPanel';

// Loading-state placeholder — previews MediaCard's real shape (thumbnail +
// two text lines) instead of a generic spinner, reusing the shimmer already
// shipped for in-progress uploads (UploadThumbnail.tsx / MessageList.tsx's
// `animate-upload-shimmer`, tailwind.config.js) rather than inventing a
// second shimmer animation. MediaPage.tsx carries the identical duplicate —
// no shared component exists for this loading-state region (see Design
// Handovers/ Aug 2026 Atomic Updates/10_media_list_skeleton/README.md).
function MediaCardSkeleton() {
  return (
    <div style={{ flex: '1 1 220px', minWidth: 180, maxWidth: 320 }}>
      <div className="border border-border rounded-xl bg-surface overflow-hidden flex flex-col">
        <div className="relative w-full bg-surface-2 overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 animate-upload-shimmer motion-reduce:animate-none"
            style={{
              backgroundImage:
                'linear-gradient(100deg, transparent 30%, rgb(var(--color-accent) / 0.28) 50%, transparent 70%)',
              backgroundSize: '200% 100%',
            }}
          />
        </div>
        <div className="p-3.5 flex flex-col gap-2">
          <div className="relative h-3 rounded-full bg-surface-2 overflow-hidden" style={{ width: '70%' }}>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 animate-upload-shimmer motion-reduce:animate-none"
              style={{
                backgroundImage:
                  'linear-gradient(100deg, transparent 30%, rgb(var(--color-accent) / 0.28) 50%, transparent 70%)',
                backgroundSize: '200% 100%',
              }}
            />
          </div>
          <div className="relative h-2.5 rounded-full bg-surface-2 overflow-hidden" style={{ width: '45%' }}>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 animate-upload-shimmer motion-reduce:animate-none"
              style={{
                backgroundImage:
                  'linear-gradient(100deg, transparent 30%, rgb(var(--color-accent) / 0.28) 50%, transparent 70%)',
                backgroundSize: '200% 100%',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface MediaGalleryProps {
  onClose: () => void;
  /**
   * Active chat session — scopes the fetch to this session's own media via
   * `/api/media?chat_id=`, matching the query param chatStore.tsx's own
   * hydration/polling already uses (services/media's listByChat). Null for a
   * brand-new, not-yet-saved chat — nothing to fetch yet, so the gallery just
   * shows empty rather than falling back to every account file (that's the
   * standalone page's job, see MediaPage.tsx). Stage 1
   * (media_stages_08_2026/stage-1-media-page-layout): this in-chat panel is
   * scoped to the active session; the standalone page is not.
   */
  sessionId: string | null;
  /** Shared toast — Stage 3's edit stub and (once wired) add-to-memory confirm both use it. */
  onFlash: (message: string) => void;
}

export function MediaGallery({ onClose, sessionId, onFlash }: MediaGalleryProps) {
  // Same incremental-pagination treatment as the account-wide MediaPage,
  // applied here too even though a single chat's media is naturally more
  // bounded — nothing in this codebase caps how many files one
  // conversation can accumulate, so a long-running chat can still hit the
  // same "sign every item upfront" cost this closes, just at a higher
  // attachment count than the account-wide page typically needs before it
  // shows up. Consistency also matters on its own: MediaItemsGrid/MediaCard
  // are shared with MediaPage, so a chat-scoped list behaving differently
  // (full fetch vs. incremental) would be a real, if invisible, gap the
  // next person touching either surface could easily reintroduce.
  const { items, setItems, loading, loadingMore, hasMore, sentinelRef } = useMediaPagination({
    queryKey: sessionId,
    buildUrl: ({ limit, cursor }) => {
      const params = new URLSearchParams({ chat_id: sessionId ?? '', limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return `/api/media?${params.toString()}`;
    },
  });
  const { pendingDelete, requestDelete, cancelDelete, confirmDelete } = useMediaDelete(setItems);
  const [addToMemoryItem, setAddToMemoryItem] = useState<MediaItemWithUrl | null>(null);

  const handleRetry = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'pending' as const } : item)),
    );
  };

  // Local-state only — see MediaCard.tsx's onRename doc comment for why.
  const handleRename = (id: string, name: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, original_filename: name } : item)),
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <h2 className="font-display text-[15px] text-text-primary">Media</h2>
        <button
          type="button"
          aria-label="Close media gallery"
          onClick={onClose}
          className="grid place-items-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div
            aria-busy="true"
            aria-label="Loading media"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <MediaCardSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
            <ImageIcon size={28} className="text-text-muted opacity-40" />
            <p className="font-body text-sm text-text-muted">
              No media yet. Attach a photo, audio file, or document to a message to get started.
            </p>
          </div>
        ) : (
          <>
            <MediaItemsGrid
              items={items}
              onRetry={handleRetry}
              onAddToMemory={setAddToMemoryItem}
              onEditStub={() => onFlash('Editing media is coming soon')}
              onDeleteRequest={requestDelete}
              onRename={handleRename}
            />
            {hasMore && <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />}
            {loadingMore && (
              <div className="flex justify-center py-4" aria-live="polite" aria-label="Loading more media">
                <Loader2 size={18} className="animate-spin text-text-muted" />
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDeleteModal
        item={pendingDelete ? { target: 'media', id: pendingDelete.id, title: pendingDelete.original_filename } : null}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        heading="Delete this file?"
        body={
          pendingDelete && (
            <>
              <span className="font-display italic text-base text-text-primary">
                &ldquo;{pendingDelete.original_filename}&rdquo;
              </span>{' '}
              will be removed from this list.
            </>
          )
        }
      />

      <AddToMemoryPanel item={addToMemoryItem} onClose={() => setAddToMemoryItem(null)} flash={onFlash} />
    </div>
  );
}
