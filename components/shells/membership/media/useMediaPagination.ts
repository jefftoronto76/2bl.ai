'use client';

// Shared incremental-fetch pagination for GET /api/media's two consumers —
// MediaPage.tsx (account-wide) and MediaGallery.tsx (chat-scoped). Both
// used to fetch their full result set in one shot, generating a signed
// display URL for every item before anything rendered — the real,
// undesigned bottleneck closed by this change (see System Docs/Known
// Gaps.md). This hook owns the shared parts: reset-and-refetch on scope
// change, first-page vs. next-page loading flags (so a scrolled-in page
// never re-triggers the caller's full skeleton), a scroll-driven sentinel
// (same create-ref/IntersectionObserver/disconnect shape as
// services/shared/useReveal.ts, the only existing precedent in this
// codebase — but re-observing on every intersection rather than
// disconnecting after the first, since more pages can exist after each
// load), and id-based de-duplication so a page fetched twice — a fast
// double-scroll, a remount, a query racing a reset — can never append a
// duplicate card.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItemWithUrl } from '@/services/media/display-url';

export const MEDIA_PAGE_SIZE = 24;

interface MediaPageResponse {
  items?: MediaItemWithUrl[];
  hasMore?: boolean;
  nextCursor?: string | null;
}

export function useMediaPagination(params: {
  /**
   * Identifies the current list scope — a chat session id for
   * MediaGallery, a fixed constant for MediaPage's account-wide list.
   * Null means "nothing to fetch yet" (MediaGallery's no-session-selected
   * case). Changing the value resets state and refetches from page one.
   */
  queryKey: string | null;
  /** Builds the GET /api/media URL for one page. */
  buildUrl: (query: { limit: number; cursor: string | null }) => string;
}) {
  const { queryKey, buildUrl } = params;
  // Ref, not a dependency — buildUrl is a fresh closure every render
  // (it captures sessionId/status), and re-running the fetch effect on
  // every render (rather than only on a real scope change) would refetch
  // page one on every keystroke/rerender upstream.
  const buildUrlRef = useRef(buildUrl);
  buildUrlRef.current = buildUrl;

  const [items, setItems] = useState<MediaItemWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const hasMoreRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const fetchingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const applyHasMore = useCallback((value: boolean) => {
    hasMoreRef.current = value;
    setHasMore(value);
  }, []);

  const appendPage = useCallback(
    (data: MediaPageResponse) => {
      const incoming = Array.isArray(data.items) ? data.items : [];
      const fresh = incoming.filter((item) => !seenIdsRef.current.has(item.id));
      fresh.forEach((item) => seenIdsRef.current.add(item.id));
      if (fresh.length > 0) setItems((prev) => [...prev, ...fresh]);
      cursorRef.current = data.nextCursor ?? null;
      applyHasMore(Boolean(data.hasMore));
    },
    [applyHasMore],
  );

  const fetchNextPage = useCallback(() => {
    if (fetchingRef.current || !hasMoreRef.current) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    fetch(buildUrlRef.current({ limit: MEDIA_PAGE_SIZE, cursor: cursorRef.current }))
      .then((r) => r.json())
      .then((data: MediaPageResponse) => appendPage(data))
      .catch((err) => console.error('[useMediaPagination] next page fetch failed:', err))
      .finally(() => {
        fetchingRef.current = false;
        setLoadingMore(false);
      });
  }, [appendPage]);

  useEffect(() => {
    setItems([]);
    seenIdsRef.current = new Set();
    cursorRef.current = null;
    applyHasMore(false);
    fetchingRef.current = false;

    if (!queryKey) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    fetch(buildUrlRef.current({ limit: MEDIA_PAGE_SIZE, cursor: null }))
      .then((r) => r.json())
      .then((data: MediaPageResponse) => {
        if (cancelled) return;
        appendPage(data);
      })
      .catch((err) => console.error('[useMediaPagination] first page fetch failed:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // appendPage/applyHasMore are stable (useCallback with stable deps);
    // buildUrl is intentionally excluded — see buildUrlRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage]);

  return { items, setItems, loading, loadingMore, hasMore, sentinelRef };
}
