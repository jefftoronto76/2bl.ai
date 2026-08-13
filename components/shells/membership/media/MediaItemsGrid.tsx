'use client';

// Shared grid — Stage 1 scope (Design Handovers/media_stages_08_2026/
// stage-1-media-page-layout/README_stage.md): flex-wrap, not CSS grid, so
// columns scale by available width. Each card: flex 1 1 220px, min 180,
// max 320 — at the 780px container cap (MediaPage.tsx / MediaGallery.tsx)
// that's 3 columns. Used by both the standalone page and the in-chat panel;
// Stage 2 owns what renders inside each MediaCard.

import type { MediaItemWithUrl } from '@/services/media/display-url';
import { MediaCard } from './MediaCard';

export function MediaItemsGrid({
  items,
  onRetry,
}: {
  items: MediaItemWithUrl[];
  onRetry: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {items.map((item) => (
        <div key={item.id} style={{ flex: '1 1 220px', minWidth: 180, maxWidth: 320 }}>
          <MediaCard item={item} onRetry={onRetry} />
        </div>
      ))}
    </div>
  );
}
