Diff against the Blocks table component (post `blocks_filters_DH_June 2026`) and
the `Block` fixture type.

```diff
@@ components/admin/lib/types.ts — Block
 export interface Block {
   id: string
   title: string
   type: BlockType
   status: 'active' | 'disabled'
   order: number
+  created_at: string
   updated_at: string
   author: string
   body: string
 }

@@ components/admin/lib/fixtures.ts — BLOCKS
 export const BLOCKS: Block[] = [
-  { id: 'b1', title: 'Sage persona & voice', type: 'identity', status: 'active', order: 1, updated_at: '2026-06-12T10:00:00', author: 'Jeff Lougheed', body: '…' },
+  { id: 'b1', title: 'Sage persona & voice', type: 'identity', status: 'active', order: 1, created_at: '2026-03-02T09:00:00', updated_at: '2026-06-12T10:00:00', author: 'Jeff Lougheed', body: '…' },
   // …created_at backfilled the same way for the remaining 8 blocks (see UK-3)
 ]

@@ BlocksTable.tsx — imports
-import { IconCheck, IconChevronRight, ... } from '@tabler/icons-react'
+import { IconCheck, IconChevronRight, IconArrowsSort, IconSortAscending, IconSortDescending, ... } from '@tabler/icons-react'

@@ BlocksTable.tsx — module scope
+const dateShort = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
+
+type SortField = 'title' | 'type' | 'created' | 'updated'
+const DATE_SORT_FIELDS = new Set<SortField>(['created', 'updated'])
+
+// null sortBy = original (unsorted) order.
+function sortBlocks(list: Block[], sortBy: SortField | null, sortDir: 'asc' | 'desc') {
+  if (!sortBy) return list
+  const dir = sortDir === 'desc' ? -1 : 1
+  return [...list].sort((a, b) => {
+    let av: string | number, bv: string | number
+    if (sortBy === 'title') { av = a.title.toLowerCase(); bv = b.title.toLowerCase() }
+    else if (sortBy === 'type') { av = ORDERED_BLOCK_TYPES.indexOf(a.type); bv = ORDERED_BLOCK_TYPES.indexOf(b.type) }
+    else if (sortBy === 'created') { av = a.created_at; bv = b.created_at }
+    else { av = a.updated_at; bv = b.updated_at }
+    if (av < bv) return -1 * dir
+    if (av > bv) return 1 * dir
+    return 0
+  })
+}
+
+function SortLabel({ field, children, sortBy, sortDir, onSort }: {
+  field: SortField; children: React.ReactNode; sortBy: SortField | null; sortDir: 'asc' | 'desc'; onSort: (f: SortField) => void
+}) {
+  const on = sortBy === field
+  return (
+    <button type="button" onClick={() => onSort(field)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', padding: 0, color: on ? 'var(--mantine-color-text)' : 'inherit' }}>
+      {children}
+      {on ? (sortDir === 'asc' ? <IconSortAscending size={13} /> : <IconSortDescending size={13} />) : <IconArrowsSort size={13} style={{ opacity: 0.35 }} />}
+    </button>
+  )
+}

@@ BlocksTable() — state
   const [typeFilter, setTypeFilter] = useState<'all' | BlockType>('all')
   const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all')
+  const [sortBy, setSortBy] = useState<SortField | null>(null)
+  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
   const [copiedId, setCopiedId] = useState<string | null>(null)

@@ BlocksTable() — reset on prompt-set switch
   useEffect(() => {
     if (firstRun.current) { firstRun.current = false; return }
-    setTypeFilter('all'); setStatusFilter('all'); setQuery(''); setSelected(new Set()); setExpanded(new Set())
+    setTypeFilter('all'); setStatusFilter('all'); setQuery(''); setSelected(new Set()); setExpanded(new Set())
+    setSortBy(null); setSortDir('asc')
   }, [promptSet])

@@ BlocksTable() — derive rows
-  const maxTok = filtered.length ? Math.max(0, ...filtered.map((b) => tokensFor(b.body))) : 0
+  const sorted = sortBlocks(filtered, sortBy, sortDir)
+  const maxTok = sorted.length ? Math.max(0, ...sorted.map((b) => tokensFor(b.body))) : 0
   // …allExpanded / filteredSel / allSel / toggleSelAll / onToggleExpandAll now read
   // from `sorted` instead of `filtered` (rendered order == sorted order)
+
+  const onSort = (field: SortField) => {
+    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
+    else { setSortBy(field); setSortDir(DATE_SORT_FIELDS.has(field) ? 'desc' : 'asc') }
+  }

@@ Table.Thead
                   <Table.Th style={{ width: 28 }} />
-                  <Table.Th>Title</Table.Th>
-                  <Table.Th>Type</Table.Th>
+                  <Table.Th><SortLabel field="title" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Title</SortLabel></Table.Th>
+                  <Table.Th><SortLabel field="type" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Type</SortLabel></Table.Th>
+                  <Table.Th><SortLabel field="updated" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Last updated</SortLabel></Table.Th>
                   <Table.Th>Tokens</Table.Th>
                   <Table.Th>Status</Table.Th>
                   <Table.Th>Actions</Table.Th>

@@ Table.Tbody
-                {filtered.map((b) => (
+                {sorted.map((b) => (
                   <Row key={b.id} block={b} ... />
                 ))}

@@ Row() — title cell / new Dates cell
           <Group gap={6} align="baseline">
             {orderPrefix(block.order) && <Text ...>{orderPrefix(block.order)}</Text>}
             <Text fw={500} size="sm">{block.title}</Text>
           </Group>
-          <Text c="dimmed" size="xs">Updated {relTime(block.updated_at)}</Text>
         </Table.Td>
         <Table.Td><TypeBadge type={block.type} /></Table.Td>
+        <Table.Td>
+          <Text size="xs">Created {dateShort(block.created_at)}</Text>
+          <Text size="xs" c="dimmed">Updated {relTime(block.updated_at)}</Text>
+        </Table.Td>
         <Table.Td>
           <Group gap={8} wrap="nowrap" align="center">
             <Text size="sm" style={{ ... minWidth: 42 }}>{tok.toLocaleString()}</Text>

@@ Row() — expanded panel colSpan (one more column now)
-      {expanded && <Table.Tr><Table.Td colSpan={7} p={0}><ExpandPanel block={block} /></Table.Td></Table.Tr>}
+      {expanded && <Table.Tr><Table.Td colSpan={8} p={0}><ExpandPanel block={block} /></Table.Td></Table.Tr>}
```

Note: the "Dates" column header cell itself has no visible label — it's the
`SortLabel field="updated"` button rendering "Last updated" directly, so there's
no redundant column title above it.
