// Blocks table — sort additions. Splice into the existing Blocks table component
// (components/admin/prompt-studio/BlocksTable.tsx, or admin-tsx/app/admin/prompt-studio/blocks/page.tsx).
// Assumes `Block` has a `created_at: string` field alongside the existing `updated_at`
// (see DIFF.md for the fixture/type addition) and that `ORDERED_BLOCK_TYPES` / `relTime`
// already exist in the file.

import { IconArrowsSort, IconSortAscending, IconSortDescending } from '@tabler/icons-react'
import type { Block, BlockType } from '@/components/admin/lib/types'

export const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export type SortField = 'title' | 'type' | 'created' | 'updated'
export const DATE_SORT_FIELDS = new Set<SortField>(['created', 'updated'])

// null sortBy = original (unsorted / authored) order.
export function sortBlocks(list: Block[], sortBy: SortField | null, sortDir: 'asc' | 'desc') {
  if (!sortBy) return list
  const dir = sortDir === 'desc' ? -1 : 1
  return [...list].sort((a, b) => {
    let av: string | number, bv: string | number
    if (sortBy === 'title') { av = a.title.toLowerCase(); bv = b.title.toLowerCase() }
    else if (sortBy === 'type') { av = ORDERED_BLOCK_TYPES.indexOf(a.type); bv = ORDERED_BLOCK_TYPES.indexOf(b.type) }
    else if (sortBy === 'created') { av = a.created_at; bv = b.created_at }
    else { av = a.updated_at; bv = b.updated_at }
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
}

// Clicking a header: same field flips direction; a different field takes over,
// defaulting to descending for the date field (newest first reads better first click).
export function makeOnSort(
  sortBy: SortField | null,
  setSortBy: (f: SortField) => void,
  setSortDir: (updater: (d: 'asc' | 'desc') => 'asc' | 'desc') => void,
) {
  return (field: SortField) => {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(field); setSortDir(() => (DATE_SORT_FIELDS.has(field) ? 'desc' : 'asc')) }
  }
}

export function SortLabel({ field, children, sortBy, sortDir, onSort }: {
  field: SortField
  children: React.ReactNode
  sortBy: SortField | null
  sortDir: 'asc' | 'desc'
  onSort: (f: SortField) => void
}) {
  const on = sortBy === field
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent',
        cursor: 'pointer', font: 'inherit', padding: 0, color: on ? 'var(--mantine-color-text)' : 'inherit',
      }}
    >
      {children}
      {on
        ? (sortDir === 'asc' ? <IconSortAscending size={13} /> : <IconSortDescending size={13} />)
        : <IconArrowsSort size={13} style={{ opacity: 0.35 }} />}
    </button>
  )
}

/* ── Usage inside the table component ──

const [sortBy, setSortBy] = useState<SortField | null>(null)
const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
const onSort = makeOnSort(sortBy, setSortBy, setSortDir)
const sorted = sortBlocks(filtered, sortBy, sortDir)
// render `sorted` instead of `filtered` in Table.Tbody, and base maxTok/allExpanded/
// filteredSel/allSel/toggleSelAll/onToggleExpandAll off `sorted` too.

<Table.Thead>
  <Table.Tr>
    <Table.Th style={{ width: 40 }}>...</Table.Th>
    <Table.Th style={{ width: 28 }} />
    <Table.Th><SortLabel field="title" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Title</SortLabel></Table.Th>
    <Table.Th><SortLabel field="type" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Type</SortLabel></Table.Th>
    <Table.Th><SortLabel field="updated" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Last updated</SortLabel></Table.Th>
    <Table.Th>Tokens</Table.Th>
    <Table.Th>Status</Table.Th>
    <Table.Th>Actions</Table.Th>
  </Table.Tr>
</Table.Thead>

// In Row(): replace the "Updated {relTime(...)}" line under the title with a new
// Dates <Table.Td> right after the Type cell:
<Table.Td>
  <Text size="xs">Created {dateShort(block.created_at)}</Text>
  <Text size="xs" c="dimmed">Updated {relTime(block.updated_at)}</Text>
</Table.Td>

// And bump the expanded row's colSpan from 7 to 8 (one more column now).
*/
