'use client'

// Platform · Members — dashboard header + directory: search, status filter,
// bulk actions, per-row action menu, and a per-membership role drawer.
// Route: /platform/members
//
// TODO: replace the USERS fixture with the live member directory query and wire the
// mutations (upgrade/suspend/reactivate/delete/invite) to your endpoints. Notifications
// stand in for those round-trips.

import { useMemo, useState } from 'react'
import {
  ActionIcon, Button, Card, Checkbox, Group, Menu, Paper, SegmentedControl,
  SimpleGrid, Stack, Table, Text, TextInput, Title,
} from '@mantine/core'
import {
  IconArrowUp, IconDots, IconPlayerPause, IconPlayerPlay, IconRestore, IconSearch,
  IconSend, IconTrash, IconUserPlus, IconX,
} from '@tabler/icons-react'
import { USERS } from '@/components/admin/lib/fixtures'
import { PLAN_BADGE, ROLE_BADGE, STATUS_BADGE, STATUS_COLOR, TintBadge } from '@/components/admin/lib/badges'
import { Donut, StatTile, notify } from '@/components/admin/lib/primitives'
import type { MemberPlan, MemberStatus, Membership, User } from '@/components/admin/lib/types'
import { Avatar, DetailDrawer } from './MemberDrawer'

const STATUS_ORDER: { key: string; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'invited', label: 'Invited' },
  { key: 'suspended', label: 'Suspended' }, { key: 'deleted', label: 'Deleted' },
]
const primaryStatus = (u: User): MemberStatus =>
  u.memberships.every((m) => m.status === 'deleted') ? 'deleted' : u.memberships[0].status
const bumpPlan = (p: MemberPlan): MemberPlan => (p === 'free' ? 'pro' : 'team')

function TenantPills({ memberships }: { memberships: Membership[] }) {
  const names = memberships.map((m) => m.tenant)
  const shown = names.slice(0, 3)
  const extra = names.length - shown.length
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {shown.map((n) => (
        <span key={n} title={n} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'var(--mantine-color-gray-1)', color: 'var(--mantine-color-gray-7)', whiteSpace: 'nowrap' }}>{n}</span>
      ))}
      {extra > 0 && (
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'var(--mantine-color-gray-1)', color: 'var(--mantine-color-gray-6)' }}>+{extra} more</span>
      )}
    </div>
  )
}

function Dashboard({ users }: { users: User[] }) {
  const dist = useMemo(() => {
    const d: Record<MemberStatus, number> = { active: 0, invited: 0, suspended: 0, deleted: 0 }
    for (const u of users) d[primaryStatus(u)]++
    return d
  }, [users])
  const total = users.length
  const segments = (['active', 'invited', 'suspended', 'deleted'] as MemberStatus[])
    .filter((k) => dist[k] > 0)
    .map((k) => ({ key: k, label: STATUS_BADGE[k].label, value: dist[k], color: STATUS_COLOR[k] }))
  const tenantsRepresented = new Set(users.flatMap((u) => u.memberships.map((m) => m.tenant))).size

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <SimpleGrid cols={2} spacing="md">
        <StatTile label="Total members" value={total} sub={`across ${tenantsRepresented} tenants`} />
        <StatTile label="Active" value={dist.active} accent={STATUS_COLOR.active} />
        <StatTile label="Invited / Accepted" value={`${dist.invited + dist.active} / ${dist.active}`} sub={`${dist.invited} pending`} accent={STATUS_COLOR.invited} />
        <StatTile label="Suspended" value={dist.suspended} accent={STATUS_COLOR.suspended} />
      </SimpleGrid>
      <Card withBorder radius="md" p="lg" style={{ background: 'transparent' }}>
        <Stack gap={4} align="center" justify="center" style={{ height: '100%' }}>
          <Donut segments={segments} total={total} centerSub="members" />
          <Text c="dimmed" size="xs">Hover a segment for its breakdown</Text>
        </Stack>
      </Card>
    </SimpleGrid>
  )
}

export default function MembersPage() {
  const [users, setUsers] = useState<User[]>(USERS) // TODO: replace with query
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: users.length, active: 0, invited: 0, suspended: 0, deleted: 0 }
    for (const u of users) {
      const seen = new Set(u.memberships.map((m) => m.status))
      for (const s of ['active', 'invited', 'suspended', 'deleted']) if (seen.has(s as MemberStatus)) c[s]++
    }
    return c
  }, [users])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (filter !== 'all' && !u.memberships.some((m) => m.status === filter)) return false
      if (!q) return true
      return (u.name + ' ' + u.email + ' ' + u.memberships.map((m) => m.tenant).join(' ')).toLowerCase().includes(q)
    })
  }, [users, query, filter])

  const visibleIds = visible.map((u) => u.id)
  const selectedVisible = visibleIds.filter((id) => selected.has(id))
  const allChecked = visibleIds.length > 0 && selectedVisible.length === visibleIds.length
  const someChecked = selectedVisible.length > 0 && !allChecked

  const toggleOne = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (allChecked) visibleIds.forEach((id) => n.delete(id))
      else visibleIds.forEach((id) => n.add(id))
      return n
    })
  const clearSel = () => setSelected(new Set())

  const mapUser = (id: string, fn: (m: Membership) => Membership, toast?: Parameters<typeof notify>[0]) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, memberships: u.memberships.map(fn) } : u)))
    if (toast) notify(toast)
  }
  const removeUser = (id: string, toast?: Parameters<typeof notify>[0]) => {
    setUsers((prev) => prev.filter((u) => u.id !== id))
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
    if (toast) notify(toast)
  }

  const selArr = () => users.filter((u) => selected.has(u.id))
  const bulkUpgrade = () => {
    const targets = selArr().filter((u) => u.memberships.some((m) => m.plan !== 'team' && m.status !== 'deleted'))
    if (!targets.length) return notify({ color: 'green', title: 'Nothing to upgrade', message: 'Selected members are already on Team.' })
    const ids = new Set(targets.map((u) => u.id))
    setUsers((prev) => prev.map((u) => ids.has(u.id) ? { ...u, memberships: u.memberships.map((m) => (m.plan !== 'team' && m.status !== 'deleted') ? { ...m, plan: bumpPlan(m.plan) } : m) } : u))
    notify({ color: 'green', title: 'Plans upgraded', message: `${targets.length} member${targets.length > 1 ? 's' : ''} upgraded.` })
  }
  const bulkStatus = (pred: (m: Membership) => boolean, to: MemberStatus, title: string) => {
    const targets = selArr().filter((u) => u.memberships.some(pred))
    if (!targets.length) return notify({ color: 'green', title: 'No eligible members', message: 'Nothing in the selection applies.' })
    const ids = new Set(targets.map((u) => u.id))
    setUsers((prev) => prev.map((u) => ids.has(u.id) ? { ...u, memberships: u.memberships.map((m) => (pred(m) ? { ...m, status: to } : m)) } : u))
    notify({ color: 'green', title, message: `${targets.length} member${targets.length > 1 ? 's' : ''} updated.` })
  }

  function RowMenu({ u }: { u: User }) {
    const st = primaryStatus(u)
    const items: React.ReactNode[] = []
    if ((st === 'active' || st === 'suspended') && u.memberships.some((m) => m.plan !== 'team' && m.status !== 'deleted'))
      items.push(<Menu.Item key="up" leftSection={<IconArrowUp size={16} />} onClick={() => mapUser(u.id, (m) => (m.plan !== 'team' && m.status !== 'deleted') ? { ...m, plan: bumpPlan(m.plan) } : m, { color: 'green', title: 'Plan upgraded', message: `${u.name}'s memberships upgraded.` })}>Upgrade plan</Menu.Item>)
    if (st === 'active') items.push(<Menu.Item key="susp" leftSection={<IconPlayerPause size={16} />} onClick={() => mapUser(u.id, (m) => m.status === 'active' ? { ...m, status: 'suspended' } : m, { color: 'green', title: 'Member suspended', message: `${u.name} can no longer sign in.` })}>Suspend</Menu.Item>)
    if (st === 'suspended') items.push(<Menu.Item key="react" leftSection={<IconPlayerPlay size={16} />} onClick={() => mapUser(u.id, (m) => m.status === 'suspended' ? { ...m, status: 'active' } : m, { color: 'green', title: 'Member reactivated', message: `${u.name} is active again.` })}>Reactivate</Menu.Item>)
    if (st === 'invited') {
      items.push(<Menu.Item key="resend" leftSection={<IconSend size={16} />} onClick={() => notify({ color: 'green', title: 'Invite resent', message: `Sent to ${u.email}.` })}>Resend invite</Menu.Item>)
      items.push(<Menu.Divider key="d1" />)
      items.push(<Menu.Item key="revoke" color="red" leftSection={<IconX size={16} />} onClick={() => removeUser(u.id, { color: 'green', title: 'Invite revoked', message: `${u.email} was removed.` })}>Revoke invite</Menu.Item>)
    } else if (st === 'deleted') {
      items.push(<Menu.Item key="restore" leftSection={<IconRestore size={16} />} onClick={() => mapUser(u.id, (m) => ({ ...m, status: 'active' }), { color: 'green', title: 'Member restored', message: `${u.name} was restored.` })}>Restore</Menu.Item>)
      items.push(<Menu.Divider key="d2" />)
      items.push(<Menu.Item key="delperm" color="red" leftSection={<IconTrash size={16} />} onClick={() => removeUser(u.id, { color: 'green', title: 'Member deleted', message: `${u.name} was permanently removed.` })}>Delete permanently</Menu.Item>)
    } else {
      items.push(<Menu.Divider key="d3" />)
      items.push(<Menu.Item key="del" color="red" leftSection={<IconTrash size={16} />} onClick={() => mapUser(u.id, (m) => ({ ...m, status: 'deleted' }), { color: 'green', title: 'Member deleted', message: `${u.name} moved to deleted.` })}>Delete</Menu.Item>)
    }
    return (
      <Menu position="bottom-end" withinPortal shadow="md" width={190}>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label="Member actions" onClick={(e) => e.stopPropagation()}><IconDots size={18} /></ActionIcon>
        </Menu.Target>
        <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
          <Menu.Label>Actions</Menu.Label>
          {items}
        </Menu.Dropdown>
      </Menu>
    )
  }

  const saveRoles = (id: string, roles: User['memberships'][number]['role'][]) => {
    const u = users.find((x) => x.id === id)
    if (!u) return
    const changed = roles.filter((r, i) => r !== u.memberships[i].role).length
    setUsers((prev) => prev.map((x) => (x.id === id ? { ...x, memberships: x.memberships.map((m, i) => ({ ...m, role: roles[i] })) } : x)))
    notify({ color: 'green', title: 'Roles updated', message: `${changed} role${changed > 1 ? 's' : ''} updated for ${u.name}.` })
    setDetail(null)
  }
  const detailUser = detail ? users.find((u) => u.id === detail) : null

  return (
    <Stack gap="lg" data-screen-label="Platform · Members">
      <Stack gap={4}>
        <Title order={1} size="h2">Members</Title>
        <Text c="dimmed">Everyone with access across all tenants.</Text>
      </Stack>

      <Dashboard users={users} />

      <Group gap="sm" wrap="wrap" align="center">
        <TextInput
          value={query} onChange={(e) => setQuery(e.currentTarget.value)} placeholder="Search name, email, or tenant"
          leftSection={<IconSearch size={15} />} style={{ flex: '1 1 260px', minWidth: 220 }}
          rightSection={query ? <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setQuery('')}><IconX size={13} /></ActionIcon> : null}
        />
        <SegmentedControl
          value={filter} onChange={setFilter}
          data={STATUS_ORDER.map((s) => ({
            value: s.key,
            label: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {s.label}<span style={{ fontSize: 11, color: 'var(--mantine-color-dimmed)' }}>{counts[s.key]}</span>
              </span>
            ),
          }))}
        />
        <div style={{ flex: 1 }} />
        <Button leftSection={<IconUserPlus size={16} />} onClick={() => notify({ color: 'green', title: 'Invite member', message: 'Invite flow would open here.' })}>Invite member</Button>
      </Group>

      {selectedVisible.length > 0 && (
        <Paper withBorder radius="md" p="xs" style={{ background: 'var(--mantine-color-gray-0)' }}>
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text fw={500} size="sm" pl={8}>{selectedVisible.length} selected</Text>
            <Group gap={6} wrap="wrap">
              <Button size="xs" variant="default" leftSection={<IconArrowUp size={15} />} onClick={bulkUpgrade}>Upgrade</Button>
              <Button size="xs" variant="default" leftSection={<IconPlayerPause size={15} />} onClick={() => bulkStatus((m) => m.status === 'active', 'suspended', 'Members suspended')}>Suspend</Button>
              <Button size="xs" variant="default" leftSection={<IconPlayerPlay size={15} />} onClick={() => bulkStatus((m) => m.status === 'suspended' || m.status === 'deleted', 'active', 'Members reactivated')}>Reactivate</Button>
              <Button size="xs" variant="default" color="red" leftSection={<IconTrash size={15} />} onClick={() => bulkStatus((m) => m.status !== 'deleted', 'deleted', 'Members deleted')}>Delete</Button>
              <ActionIcon variant="subtle" color="gray" onClick={clearSel} aria-label="Clear selection"><IconX size={16} /></ActionIcon>
            </Group>
          </Group>
        </Paper>
      )}

      {visible.length === 0 ? (
        <Card withBorder radius="md" p="xl" style={{ background: 'transparent' }}>
          <Stack gap={4} align="center">
            <Text fw={500}>No members found</Text>
            <Text c="dimmed" size="sm">{query ? `Nothing matches "${query}".` : 'No members in this view.'}</Text>
          </Stack>
        </Card>
      ) : (
        <Card withBorder radius="md" p={0} style={{ backgroundColor: 'transparent', overflow: 'visible' }}>
          <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 40 }}><Checkbox size="xs" checked={allChecked} indeterminate={someChecked} onChange={toggleAll} aria-label="Select all" /></Table.Th>
                <Table.Th>Member</Table.Th>
                <Table.Th>Tenant</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Plan</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Last active</Table.Th>
                <Table.Th style={{ width: 40 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((u) => {
                const p = u.memberships[0]
                const deleted = primaryStatus(u) === 'deleted'
                return (
                  <Table.Tr key={u.id} style={{ cursor: 'pointer', opacity: deleted ? 0.55 : 1 }} onClick={() => setDetail(u.id)}>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Checkbox size="xs" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} aria-label={`Select ${u.name}`} />
                    </Table.Td>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <Avatar user={u} />
                        <Stack gap={0} style={{ minWidth: 0 }}>
                          <Text fw={500} size="sm" truncate>{u.name}</Text>
                          <Text c="dimmed" size="xs" truncate>{u.email}</Text>
                        </Stack>
                      </Group>
                    </Table.Td>
                    <Table.Td><TenantPills memberships={u.memberships} /></Table.Td>
                    <Table.Td><TintBadge tint={ROLE_BADGE[p.role]}>{ROLE_BADGE[p.role].label}</TintBadge></Table.Td>
                    <Table.Td><TintBadge tint={PLAN_BADGE[p.plan]}>{PLAN_BADGE[p.plan].label}</TintBadge></Table.Td>
                    <Table.Td><TintBadge tint={STATUS_BADGE[p.status]}>{STATUS_BADGE[p.status].label}</TintBadge></Table.Td>
                    <Table.Td><Text c="dimmed" size="sm">{p.lastActive}</Text></Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}><RowMenu u={u} /></Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {detailUser && <DetailDrawer user={detailUser} onClose={() => setDetail(null)} onSaveRoles={saveRoles} />}
    </Stack>
  )
}
