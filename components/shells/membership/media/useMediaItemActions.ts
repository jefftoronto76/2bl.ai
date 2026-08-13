'use client';

// Shared state for MediaCard's delete flow — used identically by MediaGallery
// (in-chat panel) and MediaPage (standalone page), Stage 3 of
// media_stages_08_2026. Confirming removes the item from local state only:
// there is no DELETE /api/media/[id] endpoint today (confirmed absent in
// this stage's investigation — see System Docs/Known Gaps.md), so this
// mirrors the design prototype's own "no backend call" behavior rather than
// inventing one. A page refresh brings the item back until a real endpoint
// exists.

import { useCallback, useState } from 'react';
import type { MediaItemWithUrl } from '@/services/media/display-url';

export function useMediaDelete(setItems: React.Dispatch<React.SetStateAction<MediaItemWithUrl[]>>) {
  const [pendingDelete, setPendingDelete] = useState<MediaItemWithUrl | null>(null);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    setItems((prev) => prev.filter((i) => i.id !== pendingDelete.id));
    setPendingDelete(null);
  }, [pendingDelete, setItems]);

  return {
    pendingDelete,
    requestDelete: setPendingDelete,
    cancelDelete: () => setPendingDelete(null),
    confirmDelete,
  };
}
