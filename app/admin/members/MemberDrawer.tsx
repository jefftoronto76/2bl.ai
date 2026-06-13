'use client';
// app/admin/members/MemberDrawer.tsx

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconCopy, IconSend } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { Role, UserRow } from './types';
import { ROLE_OPTIONS, STATUS_COLOR, PLAN_COLOR, PLAN_LABEL, cap } from './constants';
import { formatMonthYear, formatRelative } from './utils';

interface MemberDrawerProps {
  user: UserRow | null;
  opened: boolean;
  onClose: () => void;
}

/**
 * Right-side detail drawer. Stacks one section per tenant membership, each with its
 * own Role dropdown. A single "Save changes" button writes every changed role in one
 * request (PATCH /api/platform/members/roles). For invited-only members the role
 * form is hidden; instead the invite URL and a regenerate-link button are shown.
 */
export function MemberDrawer({ user, opened, onClose }: MemberDrawerProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={440}
      padding="lg"
      title={
        user ? (
          <Group gap="sm" wrap="nowrap">
            <Avatar name={user.name} color="initials" radius="xl" size={40} />
            <div style={{ minWidth: 0 }}>
              <Text fw={600} lh={1.2} truncate>
                {user.name}
              </Text>
              <Text size="sm" c="dimmed" truncate>
                {user.email || 'Invite pending'}
              </Text>
            </div>
          </Group>
        ) : null
      }
    >
      {/* key on user.id so role edit state resets cleanly between users */}
      {user ? <DrawerBody key={user.id} user={user} onDone={onClose} /> : null}
    </Drawer>
  );
}

function DrawerBody({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const router = useRouter();
  const initial = useMemo(
    () => Object.fromEntries(user.memberships.map((m) => [m.tenantId, m.role])) as Record<string, Role>,
    [user]
  );
  const [roles, setRoles] = useState<Record<string, Role>>(initial);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  // Per-membership token map — allows updating displayed token after regenerate without a full refresh.
  const [tokenMap, setTokenMap] = useState<Record<string, string | null>>(
    () => Object.fromEntries(user.memberships.map((m) => [m.memberId, m.token]))
  );

  const changes = user.memberships
    .filter((m) => roles[m.tenantId] !== m.role)
    .map((m) => ({ tenant_id: m.tenantId, role: roles[m.tenantId] }));
  const dirty = changes.length > 0;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/platform/members/roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, changes }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save role changes.');
      }
      notifications.show({
        color: 'green',
        title: 'Roles updated',
        message: `${changes.length} role${changes.length > 1 ? 's' : ''} updated for ${user.name}.`,
      });
      onDone();
      router.refresh();
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Could not save roles',
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleResend(memberId: string) {
    setResending(true);
    try {
      const res = await fetch('/api/platform/members/invite/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId }),
      });
      if (!res.ok) throw new Error('Could not regenerate invite link.');
      const data = (await res.json()) as { token: string };
      setTokenMap((prev) => ({ ...prev, [memberId]: data.token }));
      notifications.show({
        color: 'green',
        title: 'Invite link regenerated',
        message: 'Copy the updated link below.',
      });
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Could not regenerate',
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setResending(false);
    }
  }

  function copyLink(token: string, tenantDomain: string | null) {
    const base = tenantDomain ? `https://${tenantDomain}` : window.location.origin;
    const url = `${base}?invite=${token}`;
    void navigator.clipboard.writeText(url);
    notifications.show({ color: 'green', title: 'Copied', message: 'Invite link copied to clipboard.' });
  }

  return (
    <Stack gap="lg" mt="md">
      {user.memberships.map((m) => (
        <Stack gap="xs" key={m.tenantId}>
          <Divider label={m.tenantName} labelPosition="center" />

          <SimpleGrid cols={2} spacing="xs" verticalSpacing={8}>
            <Text size="sm" c="dimmed">
              Status
            </Text>
            <Badge color={STATUS_COLOR[m.status]} variant="light" tt="none" size="sm" w="fit-content">
              {cap(m.status)}
            </Badge>

            {!user.isInviteOnly && (
              <>
                <Text size="sm" c="dimmed">
                  Plan
                </Text>
                <Badge color={PLAN_COLOR[m.plan]} variant="light" tt="none" size="sm" w="fit-content">
                  {PLAN_LABEL[m.plan]}
                </Badge>

                <Text size="sm" c="dimmed">
                  Joined
                </Text>
                <Text size="sm">{formatMonthYear(m.joined)}</Text>

                <Text size="sm" c="dimmed">
                  Last active
                </Text>
                <Text size="sm">{formatRelative(m.lastActive)}</Text>
              </>
            )}

            {m.invitedName && (
              <>
                <Text size="sm" c="dimmed">
                  Invited as
                </Text>
                <Text size="sm">{m.invitedName}</Text>
              </>
            )}
          </SimpleGrid>

          {/* Invite link section — rendered when a token is present */}
          {(() => {
            const token = tokenMap[m.memberId];
            if (!token) return null;
            const base = m.tenantDomain ? `https://${m.tenantDomain}` : (typeof window !== 'undefined' ? window.location.origin : '');
            const inviteUrl = `${base}?invite=${token}`;
            return (
              <Stack gap={6} mt={4}>
                <Text
                  size="xs"
                  c="dimmed"
                  fw={500}
                  tt="uppercase"
                  style={{ letterSpacing: '0.06em', fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10 }}
                >
                  Invite link
                </Text>
                <Group gap="xs" wrap="nowrap">
                  <TextInput
                    readOnly
                    value={inviteUrl}
                    size="xs"
                    style={{ flex: 1 }}
                    styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11 } }}
                  />
                  <ActionIcon
                    variant="default"
                    size="lg"
                    aria-label="Copy invite link"
                    onClick={() => copyLink(token, m.tenantDomain)}
                  >
                    <IconCopy size={15} />
                  </ActionIcon>
                </Group>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  leftSection={<IconSend size={13} />}
                  loading={resending}
                  onClick={() => handleResend(m.memberId)}
                >
                  Regenerate link
                </Button>
              </Stack>
            );
          })()}

          {!user.isInviteOnly && (
            <Select
              label="Role"
              data={ROLE_OPTIONS}
              value={roles[m.tenantId]}
              onChange={(v) => v && setRoles((prev) => ({ ...prev, [m.tenantId]: v as Role }))}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />
          )}
        </Stack>
      ))}

      {!user.isInviteOnly && (
        <Group justify="flex-end" mt="xs">
          <Button variant="subtle" color="gray" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </Group>
      )}
    </Stack>
  );
}
