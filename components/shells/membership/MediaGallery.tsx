'use client';

import { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, X } from 'lucide-react';
import type { MediaItemWithUrl } from '@/services/media/display-url';
import { MediaItemsGrid } from './media/MediaItemsGrid';

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
}

export function MediaGallery({ onClose, sessionId }: MediaGalleryProps) {
  const [items, setItems] = useState<MediaItemWithUrl[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/media?chat_id=${sessionId}`)
      .then((r) => r.json())
      .then((data: { items?: MediaItemWithUrl[] }) => {
        setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch((err) => console.error('[MediaGallery] fetch failed:', err))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleRetry = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'pending' as const } : item)),
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
  );
}
