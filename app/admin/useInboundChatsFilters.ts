'use client'

// Filter state + predicate logic for the Inbound Chats table's sticky
// filter bar. Local component state only (no URL sync, unlike Blocks'
// useBlocksFilters) — there's no shareable-link requirement here, and the
// session drawer selection already isn't URL-tied, so keeping this local
// avoids an abstraction the screen doesn't need yet.

import { useMemo, useState } from 'react'
import type { ChatSession } from '@/services/crm/inbound'
import type { SessionStatus } from '@/services/crm/status'

export type InboundStatusFilter = 'all' | SessionStatus

// Matches InboundChatsTable's own TTFT_FLAG_MS / InboundChartsDashboard's
// TTFT_FLAG_MS — kept as a separate constant since none of these files share
// a home for UI thresholds yet.
const TTFT_FLAG_MS = 1000

export interface UseInboundChatsFiltersReturn {
  query: string
  setQuery: (value: string) => void
  statusFilter: InboundStatusFilter
  setStatusFilter: (value: InboundStatusFilter) => void
  negativeOnly: boolean
  setNegativeOnly: (value: boolean) => void
  slowOnly: boolean
  setSlowOnly: (value: boolean) => void
  dateFrom: string
  setDateFrom: (value: string) => void
  dateTo: string
  setDateTo: (value: string) => void
  hasActiveFilter: boolean
  clearAll: () => void
  filtered: ChatSession[]
  counts: Record<InboundStatusFilter, number>
}

export function useInboundChatsFilters(rows: ChatSession[]): UseInboundChatsFiltersReturn {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<InboundStatusFilter>('all')
  const [negativeOnly, setNegativeOnly] = useState(false)
  const [slowOnly, setSlowOnly] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const counts = useMemo(() => {
    const c: Record<InboundStatusFilter, number> = {
      all: rows.length,
      in_progress: 0,
      active: 0,
      abandoned: 0,
    }
    for (const r of rows) {
      const status = r.derived_status
      if (status in c) c[status as InboundStatusFilter]++
    }
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const from = dateFrom ? new Date(dateFrom) : null
    // Inclusive of the whole "to" day, not just midnight.
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null

    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.derived_status !== statusFilter) return false
      if (negativeOnly && (r.feedback_counts?.down ?? 0) === 0) return false
      if (slowOnly && !(r.ttft_ms != null && r.ttft_ms > TTFT_FLAG_MS)) return false

      if (q) {
        const haystack = `${r.visitor_name ?? ''} ${r.email ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }

      if (from || to) {
        const activity = new Date(r.updated_at ?? r.created_at)
        if (from && activity < from) return false
        if (to && activity > to) return false
      }

      return true
    })
  }, [rows, query, statusFilter, negativeOnly, slowOnly, dateFrom, dateTo])

  const hasActiveFilter =
    query.trim() !== '' ||
    statusFilter !== 'all' ||
    negativeOnly ||
    slowOnly ||
    dateFrom !== '' ||
    dateTo !== ''

  function clearAll() {
    setQuery('')
    setStatusFilter('all')
    setNegativeOnly(false)
    setSlowOnly(false)
    setDateFrom('')
    setDateTo('')
  }

  return {
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    negativeOnly,
    setNegativeOnly,
    slowOnly,
    setSlowOnly,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    hasActiveFilter,
    clearAll,
    filtered,
    counts,
  }
}
