// Pure sort logic for the Blocks table's clickable column headers
// (Title / Type / Last updated). No React/Mantine — kept separate from
// BlocksTable.tsx so it's unit-testable in isolation; the `SortLabel`
// header button is presentational and single-use, so it stays inline in
// BlocksTable.tsx instead of living here.

import { ORDERED_TYPES, type BlockType } from '@/services/prompt/block-types'

export type SortField = 'title' | 'type' | 'updated'
export type SortDir = 'asc' | 'desc'

// Fields whose first click should default to descending (newest first
// reads better than oldest first). Title/Type default to ascending (A→Z).
export const DATE_SORT_FIELDS = new Set<SortField>(['updated'])

export interface SortableBlock {
  title: string
  type: BlockType | string
  updated_at: string
}

/**
 * `sortBy: null` is the table's default (unsorted / authored) order —
 * matches the original list untouched, same convention as the type/status
 * filters leaving the list alone when set to 'all'.
 *
 * Returns a new array; never mutates `list`. Type sorts by
 * `ORDERED_TYPES` position (compile order), not alphabetically.
 */
export function sortBlocks<T extends SortableBlock>(
  list: T[],
  sortBy: SortField | null,
  sortDir: SortDir,
): T[] {
  if (!sortBy) return list
  const dir = sortDir === 'desc' ? -1 : 1
  return [...list].sort((a, b) => {
    let av: string | number
    let bv: string | number
    if (sortBy === 'title') {
      av = a.title.toLowerCase()
      bv = b.title.toLowerCase()
    } else if (sortBy === 'type') {
      av = ORDERED_TYPES.indexOf(a.type as BlockType)
      bv = ORDERED_TYPES.indexOf(b.type as BlockType)
    } else {
      av = a.updated_at
      bv = b.updated_at
    }
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
}

/**
 * Clicking a header: the same field flips direction; a different field
 * takes over at its own default direction (descending for date fields,
 * ascending otherwise).
 */
export function nextSortState(
  current: { sortBy: SortField | null; sortDir: SortDir },
  field: SortField,
): { sortBy: SortField; sortDir: SortDir } {
  if (current.sortBy === field) {
    return { sortBy: field, sortDir: current.sortDir === 'asc' ? 'desc' : 'asc' }
  }
  return { sortBy: field, sortDir: DATE_SORT_FIELDS.has(field) ? 'desc' : 'asc' }
}
