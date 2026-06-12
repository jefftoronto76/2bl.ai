// app/admin/members/MembersList.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Checkbox,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconDots,
  IconPlayerPause,
  IconPlayerPlay,
  IconRotateClockwise,
  IconSearch,
  IconSend,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { MemberStatus, TenantOption, UserRow } from './types';
import { ROLE_COLOR, STATUS_COLOR, PLAN_COLOR, PLAN_LABEL, STATUS_FILTERS, cap } from './constants';
import type { StatusFilter } from './constants';
import { formatRelative, primaryStatus } from './utils';
import { TenantPills } from './TenantPills';
import { MemberDrawer } from './MemberDrawer';
import { InviteMemberModal } from './InviteMemberModal';

interface MembersListProps {
  users: UserRow[];
  tenants: TenantOption[];
}

export function MembersList({ users, tenants }: MembersListProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailUser, setDetailUser] = useState<UserRow | null>(null);

  // Status filter counts: a user is counted under a status if ANY membership has it.
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: users.length, active: 0, invited: 0, suspended: 0, deleted: 0 };
    for (const u of users) {
      const seen = new Set(u.memberships.map((m) => m.status));
      (['active', 'invited', 'suspended', 'deleted'] as MemberStatus[]).forEach((s) => {
        if (seen.has(s)) c[s] += 1;
      });
    }
    return c;
  }, [users]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== 'all' && !u.memberships.some((m) => m.status === filter)) return false;
      if (!q) return true;
      const hay = `${u.name} ${u.email} ${u.memberships.map((m) => m.tenantName).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, query, filter]);

  const visibleIds = visible.map((u) => u.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allChecked = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const someChecked = selectedVisible.length > 0 && !allChecked;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  // Status changes apply across ALL of a user's memberships (matching the approved
  // prototype). The API should resolve eligibility server-side.
  async function setStatus(userIds: string[], status: MemberStatus, verb: string) {
    try {
      const res = await fetch('/api/platform/members/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: userIds, status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Could not ${verb}.`);
      }
      notifications.show({
        color: 'green',
        title: `Member${userIds.length > 1 ? 's' : ''} ${verb}`,
        message: `${userIds.length} member${userIds.length > 1 ? 's' : ''} updated.`,
      });
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      notifications.show({ color: 'red', title: 'Action failed', message: err instanceof Error ? err.message : 'Network error' });
    }
  }

  async function deletePermanently(userId: string, name: string) {
    try {
      const res = await fetch(`/api/platform/members/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not delete member.');
      }
      notifications.show({ color: 'green', title: 'Member deleted', message: `${name} was permanently removed.` });
      router.refresh();
    } catch (err) {
      notifications.show({ color: 'red', title: 'Could not delete', message: err instanceof Error ? err.message : 'Network error' });
    }
  }

  async function resendInvite(email: string) {
    try {
      const res = await fetch('/api/platform/members/invite/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Could not resend invite.');
      notifications.show({ color: 'green', title: 'Invite resent', message: `Sent to ${email}.` });
    } catch (err) {
      notifications.show({ color: 'red', title: 'Could not resend', message: err instanceof Error ? err.message : 'Network error' });
    }
  }

  // ── Per-row action menu (depends on the user's aggregate status) ─────────────
  function RowMenu({ user }: { user: UserRow }) {
    const st = primaryStatus(user);
    return (
      <Menu position="bottom-end" withinPortal shadow="md" width={200}>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`Actions for ${user.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <IconDots size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
          <Menu.Label>Actions</Menu.Label>
          {st === 'active' && (
            <Menu.Item leftSection={<IconPlayerPause size={16} />} onClick={() => setStatus([user.id], 'suspended', 'suspended')}>
              Suspend
            </Menu.Item>
          )}
          {st === 'suspended' && (
            <Menu.Item leftSection={<IconPlayerPlay size={16} />} onClick={() => setStatus([user.id], 'active', 'reactivated')}>
              Reactivate
            </Menu.Item>
          )}
          {st === 'invited' && (
            <>
              <Menu.Item leftSection={<IconSend size={16} />} onClick={() => resendInvite(user.email)}>
                Resend invite
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconX size={16} />} onClick={() => deletePermanently(user.id, user.name)}>
                Revoke invite
              </Menu.Item>
            </>
          )}
          {st === 'deleted' ? (
            <>
              <Menu.Item leftSection={<IconRotateClockwise size={16} />} onClick={() => setStatus([user.id], 'active', 'restored')}>
                Restore
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => deletePermanently(user.id, user.name)}>
                Delete permanently
              </Menu.Item>
            </>
          ) : st !== 'invited' ? (
            <>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => setStatus([user.id], 'deleted', 'deleted')}>
                Delete
              </Menu.Item>
            </>
          ) : null}
        </Menu.Dropdown>
      </Menu>
    );
  }

  const headerCheckbox = (
    <Checkbox
      aria-label="Select all"
      checked={allChecked}
      indeterminate={someChecked}
      onChange={toggleAll}
    />
  );

  return (
    <Stack gap="md">
      {/* Toolbar */}
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
          <TextInput
            placeholder="Search name, email, or tenant"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={{ base: '100%', sm: 280 }}
          />
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as StatusFilter)}
            data={STATUS_FILTERS.map((s) => ({
              value: s.value,
              label: (
                <Group gap={6} wrap="nowrap">
                  <span>{s.label}</span>
                  <Text span size="xs" c="dimmed">{counts[s.value]}</Text>
                </Group>
              ),
            }))}
          />
        </Group>
        <InviteMemberModal tenants={tenants} />
      </Group>

      {/* Bulk action bar */}
      {selectedVisible.length > 0 && (
        <Group
          justify="space-between"
          p="xs"
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px solid var(--mantine-color-green-3)',
            backgroundColor: 'var(--mantine-color-green-0)',
          }}
        >
          <Text size="sm" fw={600} c="green.8" pl="xs">
            {selectedVisible.length} selected
          </Text>
          <Group gap="xs">
            <Button size="xs" variant="default" leftSection={<IconPlayerPause size={15} />} onClick={() => setStatus(selectedVisible, 'suspended', 'suspended')}>
              Suspend
            </Button>
            <Button size="xs" variant="default" leftSection={<IconPlayerPlay size={15} />} onClick={() => setStatus(selectedVisible, 'active', 'reactivated')}>
              Reactivate
            </Button>
            <Button size="xs" variant="default" color="red" leftSection={<IconTrash size={15} />} onClick={() => setStatus(selectedVisible, 'deleted', 'deleted')}>
              Delete
            </Button>
            <ActionIcon variant="subtle" color="gray" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
              <IconX size={16} />
            </ActionIcon>
          </Group>
        </Group>
      )}

      {visible.length === 0 ? (
        <Center mih={160}>
          <Stack gap={4} align="center">
            <Text fw={600} c="dimmed">No members found</Text>
            <Text size="sm" c="dimmed">
              {query ? `Nothing matches “${query}”.` : 'No members in this view.'}
            </Text>
          </Stack>
        </Center>
      ) : (
        <>
          {/* Desktop: table */}
          <Box visibleFrom="md">
            <Table striped highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40}>{headerCheckbox}</Table.Th>
                  <Table.Th>Member</Table.Th>
                  <Table.Th>Tenant</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Plan</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Last active</Table.Th>
                  <Table.Th w={52} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((u) => {
                  const p = u.memberships[0];
                  const deleted = primaryStatus(u) === 'deleted';
                  return (
                    <Table.Tr
                      key={u.id}
                      onClick={() => setDetailUser(u)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${u.name}`}
                      style={{ cursor: 'pointer', opacity: deleted ? 0.6 : 1 }}
                    >
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${u.name}`}
                          checked={selected.has(u.id)}
                          onChange={() => toggleOne(u.id)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <Avatar name={u.name} color="initials" radius="xl" size={32} />
                          <div style={{ minWidth: 0 }}>
                            <Text fw={500} lh={1.25} truncate>{u.name}</Text>
                            <Text size="xs" c="dimmed" truncate>{u.email}</Text>
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td><TenantPills memberships={u.memberships} /></Table.Td>
                      <Table.Td>
                        {p && <Badge color={ROLE_COLOR[p.role]} variant="light" tt="none" size="sm">{cap(p.role)}</Badge>}
                      </Table.Td>
                      <Table.Td>
                        {p && <Badge color={PLAN_COLOR[p.plan]} variant="light" tt="none" size="sm">{PLAN_LABEL[p.plan]}</Badge>}
                      </Table.Td>
                      <Table.Td>
                        {p && <Badge color={STATUS_COLOR[p.status]} variant="light" tt="none" size="sm">{cap(p.status)}</Badge>}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{formatRelative(p?.lastActive ?? null)}</Text>
                      </Table.Td>
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <RowMenu user={u} />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Box>

          {/* Mobile: card stack */}
          <Stack gap="sm" hiddenFrom="md">
            {visible.map((u) => {
              const p = u.memberships[0];
              const deleted = primaryStatus(u) === 'deleted';
              return (
                <Card
                  key={u.id}
                  withBorder
                  radius="md"
                  padding="sm"
                  onClick={() => setDetailUser(u)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${u.name}`}
                  style={{ cursor: 'pointer', opacity: deleted ? 0.6 : 1 }}
                >
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                      <Checkbox
                        aria-label={`Select ${u.name}`}
                        checked={selected.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Avatar name={u.name} color="initials" radius="xl" size={32} />
                      <div style={{ minWidth: 0 }}>
                        <Text fw={600} truncate>{u.name}</Text>
                        <Text size="xs" c="dimmed" truncate>{u.email}</Text>
                      </div>
                    </Group>
                    <Box onClick={(e) => e.stopPropagation()}>
                      <RowMenu user={u} />
                    </Box>
                  </Group>

                  {p && (
                    <Group gap={6} mt="sm">
                      <Badge color={ROLE_COLOR[p.role]} variant="light" tt="none" size="sm">{cap(p.role)}</Badge>
                      <Badge color={PLAN_COLOR[p.plan]} variant="light" tt="none" size="sm">{PLAN_LABEL[p.plan]}</Badge>
                      <Badge color={STATUS_COLOR[p.status]} variant="light" tt="none" size="sm">{cap(p.status)}</Badge>
                    </Group>
                  )}

                  <Box mt="xs"><TenantPills memberships={u.memberships} /></Box>

                  <Group justify="space-between" mt="xs">
                    <Text size="xs" c="dimmed">Last active</Text>
                    <Text size="xs" c="dimmed">{formatRelative(p?.lastActive ?? null)}</Text>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        </>
      )}

      <MemberDrawer user={detailUser} opened={detailUser !== null} onClose={() => setDetailUser(null)} />
    </Stack>
  );
}
