'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { BLOCK_TYPES, type BlockType } from '@/services/prompt/block-types'

export type TypeFilter = 'all' | BlockType
export type StatusFilter = 'all' | 'active' | 'disabled'

const VALID_STATUS_FILTERS: readonly StatusFilter[] = [
  'all',
  'active',
  'disabled',
]

export interface UseBlocksFiltersReturn {
  query: string
  setQuery: (value: string) => void
  typeFilter: TypeFilter
  setTypeFilter: (value: TypeFilter) => void
  statusFilter: StatusFilter
  setStatusFilter: (value: StatusFilter) => void
  clearAll: () => void
}

/**
 * URL-synced filter state for the Blocks admin page.
 *
 * Reads `?q=`, `?type=`, and `?status=` from the current URL; writes
 * back via `router.replace` with `scroll: false` so the viewport
 * doesn't jump on param changes.
 *
 * Filtering is synchronous — consumers read `query` directly and
 * re-filter on every render. Only the URL write is debounced (200ms)
 * so per-keystroke typing doesn't thrash browser history. Type and
 * status setters write immediately (discrete SegmentedControl clicks).
 *
 * Default values ('all' / empty string) are stripped from the URL for
 * clean shareable links. Unknown URL values (e.g. `?type=foo`) fall
 * back to 'all' rather than leaking bad data through the type system.
 *
 * Known limitation: external URL changes (browser back/forward to a
 * different filter URL) do NOT re-sync the local query input. The
 * initializer only runs on mount. Page refresh does re-initialize
 * correctly. Revisit if browser-back mid-search becomes a real use.
 */
export function useBlocksFilters(): UseBlocksFiltersReturn {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [query, setQueryLocal] = useState<string>(
    () => params.get('q') ?? '',
  )

  // Narrow raw URL strings into typed unions. Unknown values fall back
  // to 'all' — anything could be in the URL.
  const rawType = params.get('type')
  const typeFilter: TypeFilter =
    rawType && (BLOCK_TYPES as readonly string[]).includes(rawType)
      ? (rawType as BlockType)
      : 'all'

  const rawStatus = params.get('status')
  const statusFilter: StatusFilter =
    rawStatus &&
    (VALID_STATUS_FILTERS as readonly string[]).includes(rawStatus)
      ? (rawStatus as StatusFilter)
      : 'all'

  const writeParam = useCallback(
    (key: string, value: string | null) => {
      console.log('[useBlocksFilters] url write', { key, value })
      const next = new URLSearchParams(params.toString())
      if (value === null || value === '' || value === 'all') {
        next.delete(key)
      } else {
        next.set(key, value)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, params],
  )

  // Debounce URL writes for query. Skip the initial mount — `query` is
  // already seeded from the URL, re-writing would be wasted work.
  const isFirstQueryRun = useRef(true)
  useEffect(() => {
    if (isFirstQueryRun.current) {
      isFirstQueryRun.current = false
      return
    }
    const t = setTimeout(() => {
      writeParam('q', query.trim() === '' ? null : query)
    }, 200)
    return () => clearTimeout(t)
  }, [query, writeParam])

  const setQuery = useCallback((value: string) => {
    setQueryLocal(value)
  }, [])

  const setTypeFilter = useCallback(
    (value: TypeFilter) => {
      writeParam('type', value === 'all' ? null : value)
    },
    [writeParam],
  )

  const setStatusFilter = useCallback(
    (value: StatusFilter) => {
      writeParam('status', value === 'all' ? null : value)
    },
    [writeParam],
  )

  const clearAll = useCallback(() => {
    setQueryLocal('')
    const next = new URLSearchParams(params.toString())
    next.delete('q')
    next.delete('type')
    next.delete('status')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, params])

  return {
    query,
    setQuery,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    clearAll,
  }
}
