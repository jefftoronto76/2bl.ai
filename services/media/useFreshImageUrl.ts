'use client'

import { useEffect, useState } from 'react'

/**
 * `sessionImages` (ChatHero.tsx) carries a signed download URL fetched once,
 * at session load or on a Realtime media_items update — but
 * generateSignedDownloadUrl (services/media/storage.ts) issues it with a
 * 60-second expiry. Any consumer rendering that url more than 60s after it
 * was fetched shows a broken image, which is the common case, not an edge
 * case, for a tab left open a couple minutes. This hook re-resolves a
 * specific media item's url via GET /api/media/[id]/url right at display
 * time, showing fallbackUrl (the possibly-stale sessionImages value)
 * immediately while the fresh fetch is in flight so there's no loading
 * flicker for the common case where the stale url still works.
 */
export function useFreshImageUrl(
  mediaItemId: string | undefined,
  fallbackUrl?: string,
): { url: string | undefined; isLoading: boolean } {
  const [url, setUrl] = useState<string | undefined>(fallbackUrl)
  const [isLoading, setIsLoading] = useState(!!mediaItemId)

  useEffect(() => {
    if (!mediaItemId) {
      setUrl(fallbackUrl)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setUrl(fallbackUrl)
    setIsLoading(true)

    fetch(`/api/media/${mediaItemId}/url`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Fresh image url fetch failed: ${res.status}`)
        const body = await res.json()
        if (!cancelled) setUrl(body.url)
      })
      .catch((err) => {
        console.error('[media/useFreshImageUrl] fresh url fetch failed, using fallback:', err)
        if (!cancelled) setUrl(fallbackUrl)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
    // fallbackUrl intentionally excluded — it's only a seed value for the
    // in-flight fetch; re-running the fetch every time it changes identity
    // would cause redundant network calls with no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaItemId])

  return { url, isLoading }
}
