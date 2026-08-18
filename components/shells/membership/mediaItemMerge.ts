import type { ClientMediaItem } from './chatStore'

/**
 * Merges a fresh media item (from GET /api/media or a Realtime payload) over a
 * previously-known one. `localPreviewUrl` only ever comes from the initial
 * upload (Realtime/API responses never carry it) and `url` only comes from
 * the API's batch signing (Realtime payloads never carry it) — both are
 * preserved from the previous entry when the incoming one doesn't have them,
 * rather than being clobbered to undefined/null. Same reasoning for
 * `width`/`height` — client-captured only, never present on a Realtime/API
 * refresh payload.
 */
export function mergeMediaItem(
  prev: ClientMediaItem | undefined,
  incoming: ClientMediaItem,
): ClientMediaItem {
  return {
    ...incoming,
    localPreviewUrl: prev?.localPreviewUrl ?? incoming.localPreviewUrl,
    url: incoming.url ?? prev?.url ?? null,
    width: incoming.width ?? prev?.width,
    height: incoming.height ?? prev?.height,
  }
}

/**
 * Merges a batch of fresh media items (catch-up fetch, poll fetch, or a
 * single-item Realtime/optimistic-upload call wrapped in an array) over the
 * existing list, then re-sorts the result by created_at ascending.
 *
 * The sort is load-bearing, not cosmetic: `listByChat` (services/media/index.ts)
 * returns items oldest-first, but a client-side merge that only appends
 * unmatched items onto the end of the array — the shape all three call sites
 * used before this helper existed — silently drops that order the moment an
 * item arrives late. A missed Realtime event caught by a later poll, or a
 * catch-up fetch racing a fresh upload, both produce a fetched item whose
 * created_at is EARLIER than items already in the array; appending it put it
 * chronologically last anyway, which is what visually "jumped" the item out
 * of place once merged. Sorting after every merge — regardless of whether
 * this call updated an existing entry in place or appended a new one —
 * guarantees the array's order matches created_at rather than merge order,
 * so it never depends on catching every arrival-order case individually.
 *
 * Array.prototype.sort is stable (guaranteed since ES2019 / all supported
 * runtimes here), so two items sharing a created_at keep their prior
 * relative order rather than the sort itself introducing new churn.
 */
export function mergeMediaItems(
  prev: ClientMediaItem[],
  incoming: ClientMediaItem[],
): ClientMediaItem[] {
  const merged = [...prev]
  for (const item of incoming) {
    const idx = merged.findIndex((m) => m.id === item.id)
    if (idx >= 0) merged[idx] = mergeMediaItem(merged[idx], item)
    else merged.push(mergeMediaItem(undefined, item))
  }
  merged.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
  return merged
}
