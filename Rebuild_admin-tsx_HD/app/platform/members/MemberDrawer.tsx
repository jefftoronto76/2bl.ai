'use client'

// Member detail drawer — avatar header + per-membership status/plan/joined/last-active
// and an editable Role select per membership. Save is enabled only when a role changed.

import { useState } from 'react'
import { ActionIcon, Box, Button, Divider, Drawer, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { PLAN_BADGE, ROLE_BADGE, STATUS_BADGE, TintBadge, avatarColor } from '@/components/admin/lib/badges'
import { ROLE_OPTIONS } from '@/components/admin/lib/fixtures'
import { initials } from '@/components/admin/lib/types'
import type { MemberRole, User } from '@/components/admin/lib/types'

export function Avatar({ user, lg }: { user: User; lg?: boolean }) {
  const av = avatarColor(user.id)
  const s = lg ? 44 : 32
  return (
    <span style={{ width: s, height: s, flex: `0 0 ${s}px`, borderRadius: 999, background: av.bg, color: av.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: lg ? 15 : 12, fontWeight: 600 }}>
      {initials(user.name)}
    </span>
  )
}

interface DetailDrawerProps {
  user: User
  onClose: () => void
  onSaveRoles: (id: string, roles: MemberRole[]) => void
}

export function DetailDrawer({ user, onClose, onSaveRoles }: DetailDrawerProps) {
  const [roles, setRoles] = useState<MemberRole[]>(user.memberships.map((m) => m.role))
  const dirty = roles.some((r, i) => r !== user.memberships[i].role)
  return (
    <Drawer opened onClose={onClose} position="right" size={420} padding={0} withCloseButton={false} title={null}>
      <Stack gap={0} style={{ height: '100vh' }}>
        <Group gap="sm" wrap="nowrap" p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
          <Avatar user={user} lg />
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600}>{user.name}</Text>
            <Text c="dimmed" size="sm" truncate>{user.email}</Text>
          </Stack>
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Close"><IconX size={18} /></ActionIcon>
        </Group>
        <Box style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <Stack gap="lg">
            {user.memberships.map((m, i) => (
              <Stack key={m.tenant} gap="sm">
                <Divider label={m.tenant} labelPosition="center" />
                <SimpleGrid cols={2} spacing="xs" verticalSpacing={6}>
                  <Text c="dimmed" size="sm">Status</Text>
                  <div><TintBadge tint={STATUS_BADGE[m.status]}>{STATUS_BADGE[m.status].label}</TintBadge></div>
                  <Text c="dimmed" size="sm">Plan</Text>
                  <div><TintBadge tint={PLAN_BADGE[m.plan]}>{PLAN_BADGE[m.plan].label}</TintBadge></div>
                  <Text c="dimmed" size="sm">Joined</Text>
                  <Text size="sm">{m.joined}</Text>
                  <Text c="dimmed" size="sm">Last active</Text>
                  <Text size="sm">{m.lastActive}</Text>
                </SimpleGrid>
                <Select
                  label="Role" data={ROLE_OPTIONS} value={roles[i]} allowDeselect={false}
                  onChange={(v) => setRoles((prev) => prev.map((r, j) => (j === i ? (v as MemberRole) : r)))}
                />
              </Stack>
            ))}
          </Stack>
        </Box>
        <Group justify="flex-end" gap="sm" p="md" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
          <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
          <Button disabled={!dirty} onClick={() => onSaveRoles(user.id, roles)}>Save changes</Button>
        </Group>
      </Stack>
    </Drawer>
  )
}

export const ROLE_TINTS = ROLE_BADGE
