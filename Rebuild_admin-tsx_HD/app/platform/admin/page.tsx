'use client'

// Platform · Tenants — collapsible tenant tree grouped by parent, with a new/edit
// modal (validation, slug auto-gen, cascade-delete confirmation).
// Route: /platform/admin · mirrors TenantList.tsx
//
// TODO: replace the TENANTS fixture with the live `tenants` query and wire onSave /
// onDelete to your mutations. The tree/modal logic is data-source agnostic.

import { useMemo, useState } from 'react'
import { ActionIcon, Button, Card, Stack, Table, Text, Title, Group } from '@mantine/core'
import { IconChevronRight, IconPlus } from '@tabler/icons-react'
import { TENANTS } from '@/components/admin/lib/fixtures'
import { BADGE_COLORS, TintBadge, typeColor } from '@/components/admin/lib/badges'
import { notify } from '@/components/admin/lib/primitives'
import type { Tenant } from '@/components/admin/lib/types'
import { TenantModal, type TenantModalState } from './TenantModal'

interface VisibleNode {
  tenant: Tenant
  depth: number
  childCount: number
}

function useVisibleNodes(tenants: Tenant[], expandedIds: Set<string>): VisibleNode[] {
  return useMemo(() => {
    const ids = new Set(tenants.map((t) => t.id))
    const childrenByParent = new Map<string, Tenant[]>()
    for (const t of tenants) {
      const pid = t.parent_id && ids.has(t.parent_id) ? t.parent_id : null
      if (pid) {
        const arr = childrenByParent.get(pid) ?? []
        arr.push(t)
        childrenByParent.set(pid, arr)
      }
    }
    const roots = tenants.filter((t) => !(t.parent_id && ids.has(t.parent_id)))
    const out: VisibleNode[] = []
    const walk = (node: Tenant, depth: number) => {
      const kids = childrenByParent.get(node.id) ?? []
      out.push({ tenant: node, depth, childCount: kids.length })
      if (expandedIds.has(node.id)) for (const k of kids) walk(k, depth + 1)
    }
    for (const r of roots) walk(r, 0)
    return out
  }, [tenants, expandedIds])
}

function TypeBadge({ type }: { type: Tenant['type'] }) {
  if (!type) return <Text span c="dimmed">—</Text>
  return <TintBadge tint={BADGE_COLORS[typeColor(type)]}>{type}</TintBadge>
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>(TENANTS) // TODO: replace with query
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['sbl', 'sage']))
  const [modal, setModal] = useState<TenantModalState | null>(null)
  const visible = useVisibleNodes(tenants, expandedIds)

  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const commit = (next: Tenant[]) => setTenants([...next].sort((a, b) => a.name.localeCompare(b.name)))

  const onSave = (t: Tenant) => {
    const exists = tenants.some((x) => x.id === t.id)
    if (exists) {
      commit(tenants.map((x) => (x.id === t.id ? t : x)))
      notify({ color: 'green', title: 'Tenant updated', message: `${t.name} saved.` })
    } else {
      commit([...tenants, t])
      notify({ color: 'green', title: 'Tenant created', message: `${t.name} is ready.` })
    }
    setModal(null)
  }
  const onDelete = (t: Tenant) => {
    const drop = new Set([t.id])
    let grew = true
    while (grew) {
      grew = false
      for (const x of tenants) if (x.parent_id && drop.has(x.parent_id) && !drop.has(x.id)) { drop.add(x.id); grew = true }
    }
    commit(tenants.filter((x) => !drop.has(x.id)))
    notify({ color: 'green', title: 'Tenant deleted', message: `${t.name} was removed.` })
    setModal(null)
  }

  return (
    <Stack gap="lg" data-screen-label="Platform · Tenants">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <Stack gap={4}>
          <Title order={1} size="h2">Tenants</Title>
          <Text c="dimmed">Every tenant on the platform, grouped by parent.</Text>
        </Stack>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ mode: 'new' })}>New tenant</Button>
      </Group>

      <Card withBorder radius="md" p={0} style={{ backgroundColor: 'transparent', overflow: 'hidden' }}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="lg" striped="odd">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Domain</Table.Th>
              <Table.Th>Slug</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visible.map(({ tenant, depth, childCount }) => {
              const expanded = expandedIds.has(tenant.id)
              return (
                <Table.Tr key={tenant.id} style={{ cursor: 'pointer' }} onClick={() => setModal({ mode: 'edit', tenant })}>
                  <Table.Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: depth * 22 }}>
                      <span style={{ width: 22, display: 'inline-flex', justifyContent: 'center' }}>
                        {childCount > 0 && (
                          <ActionIcon
                            variant="subtle" color="gray" size="sm"
                            aria-label={expanded ? 'Collapse' : 'Expand'}
                            onClick={(e) => { e.stopPropagation(); toggle(tenant.id) }}
                          >
                            <IconChevronRight size={15} style={{ transition: 'transform 150ms', transform: expanded ? 'rotate(90deg)' : 'none' }} />
                          </ActionIcon>
                        )}
                      </span>
                      <Text fw={500} style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{tenant.name}</Text>
                      {childCount > 0 && <Text c="dimmed" style={{ fontSize: 'var(--mantine-font-size-xs)' }}>({childCount})</Text>}
                    </div>
                  </Table.Td>
                  <Table.Td><TypeBadge type={tenant.type} /></Table.Td>
                  <Table.Td>
                    {tenant.domain
                      ? <Text style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{tenant.domain}</Text>
                      : <Text span c="dimmed">—</Text>}
                  </Table.Td>
                  <Table.Td>
                    {tenant.slug
                      ? <Text style={{ fontSize: 'var(--mantine-font-size-sm)', fontFamily: 'var(--mantine-font-family-monospace)' }}>{tenant.slug}</Text>
                      : <Text span c="dimmed">—</Text>}
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Card>

      {modal && (
        <TenantModal
          mode={modal.mode}
          tenant={modal.tenant}
          tenants={tenants}
          onClose={() => setModal(null)}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </Stack>
  )
}
