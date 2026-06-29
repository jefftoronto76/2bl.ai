'use client'

// Stat tiles + status donut for the platform Members page header.
// Accepts live UserRow[] from the server component; no fixture data.

import { useMemo } from 'react'
import { Card, Stack, Text } from '@mantine/core'
import { Donut, DonutLegend, StatTile } from '@/components/admin/lib/primitives'
import type { UserRow } from '@/app/admin/members/types'
import type { MemberStatus } from '@/app/admin/members/types'

// Ordered for consistent donut rendering.
const STATUSES: MemberStatus[] = ['active', 'invited', 'waitlist', 'suspended', 'deleted']

const STATUS_LABEL: Record<MemberStatus, string> = {
  active:    'Active',
  invited:   'Invited',
  waitlist:  'Waitlist',
  suspended: 'Suspended',
  deleted:   'Deleted',
}

const STATUS_COLOR: Record<MemberStatus, string> = {
  active:    'var(--mantine-color-brand-6)',
  invited:   'var(--mantine-color-blue-7)',
  waitlist:  'var(--mantine-color-yellow-6)',
  suspended: 'var(--mantine-color-orange-7)',
  deleted:   'var(--mantine-color-gray-6)',
}

export function MembersDashboard({ users }: { users: UserRow[] }) {
  const { dist, tenantsRepresented } = useMemo(() => {
    const d: Record<MemberStatus, number> = { active: 0, invited: 0, waitlist: 0, suspended: 0, deleted: 0 }
    const tenants = new Set<string>()
    for (const u of users) {
      for (const m of u.memberships) {
        if (m.status in d) d[m.status as MemberStatus]++
        if (m.tenantName) tenants.add(m.tenantName)
      }
    }
    return { dist: d, tenantsRepresented: tenants.size }
  }, [users])

  const total = users.length
  const segments = STATUSES
    .filter((k) => dist[k] > 0)
    .map((k) => ({ key: k, label: STATUS_LABEL[k], value: dist[k], color: STATUS_COLOR[k] }))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--mantine-spacing-md)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--mantine-spacing-md)' }}>
        <StatTile label="Total members" value={total} sub={`across ${tenantsRepresented} tenants`} />
        <StatTile label="Active" value={dist.active} accent={STATUS_COLOR.active} />
        <StatTile
          label="Invited / Active"
          value={`${dist.invited + dist.active} / ${dist.active}`}
          sub={`${dist.invited} pending`}
          accent={STATUS_COLOR.invited}
        />
        <StatTile label="Suspended" value={dist.suspended} accent={STATUS_COLOR.suspended} />
      </div>
      <Card withBorder radius="md" p="lg" style={{ background: 'transparent' }}>
        <Stack gap="sm" align="center">
          <Donut segments={segments} total={total} centerSub="members" size={160} />
          <DonutLegend segments={segments} total={total} />
          <Text c="dimmed" size="xs">Hover a segment for its breakdown</Text>
        </Stack>
      </Card>
    </div>
  )
}
