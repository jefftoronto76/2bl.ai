// app/admin/members/MemberDrawer.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
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
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconLink, IconSend, IconX } from '@tabler/icons-react';
import type { InviteFetchState, InviteLink, Membership, Role, UserRow } from './types';
import {
  INVITE_BASE_URL,
  INVITE_STAGE_META,
  PLAN_COLOR,
  PLAN_LABEL,
  ROLE_OPTIONS,
  STATUS_COLOR,
  cap,
} from './constants';
import { formatMonthYear, formatRelative } from './utils';
import { LinkTimeline, isStalled } from './LinkTimeline';

interface MemberDrawerProps {
  user: UserRow | null;
  opened: boolean;
  onClose: () => void;
}

/** Small tinted badge showing the furthest stage a link reached. */
function StageBadge({ reached }: { reached: InviteLink['reached'] }) {
  const c = INVITE_STAGE_META[reached].color;
  return (
    <Badge
      size="sm"
      radius="sm"
      variant="light"
      styles={{ root: { background: `color-mix(in srgb, ${c} 13%, #fff)`, color: c, textTransform: 'none', fontWeight: 600 } }}
    >
      {INVITE_STAGE_META[reached].label}
    </Badge>
  );
}

/**
 * Right-side detail drawer. Stacks one section per tenant membership: role,
 * status/plan/joined/last-active, and — new for Option B — the INVITE LINK
 * lifecycle timeline for any membership that has a tracked invite.
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
                {user.email}
              </Text>
            </div>
          </Group>
        ) : null
      }
    >
      {/* key on user.id so role + invite state reset cleanly between users */}
      {user ? <DrawerBody key={user.id} user={user} onDone={onClose} /> : null}
    </Drawer>
  );
}

/** Per-membership live invite detail, refetched when the drawer opens. */
type InviteEntry = { state: InviteFetchState; invite: InviteLink | null };

function DrawerBody({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const router = useRouter();

  // ── role editing (unchanged from the shipped drawer) ──
  const initial = useMemo(
    () => Object.fromEntries(user.memberships.map((m) => [m.tenantId, m.role])) as Record<string, Role>,
    [user]
  );
  const [roles, setRoles] = useState<Record<string, Role>>(initial);
  const [saving, setSaving] = useState(false);

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

  // ── ‹invite tracking› live detail ──
  // Seed from the snapshot page.tsx embeds on each membership, then refetch on
  // open so the stage + opens count are fresh. Only memberships that have (or
  // could have) an invite are tracked.
  const invited = user.memberships.filter((m) => m.invite || m.status === 'invited');
  const [entries, setEntries] = useState<Record<string, InviteEntry>>(() =>
    Object.fromEntries(invited.map((m) => [m.tenantId, { state: 'ready', invite: m.invite ?? null }]))
  );

  const load = useCallback(
    async (m: Membership) => {
      setEntries((p) => ({ ...p, [m.tenantId]: { ...p[m.tenantId], state: 'loading' } }));
      try {
        const res = await fetch(`/api/platform/members/${user.id}/invite?tenant_id=${m.tenantId}`);
        if (!res.ok) throw new Error();
        const invite = (await res.json()) as InviteLink;
        setEntries((p) => ({ ...p, [m.tenantId]: { state: 'ready', invite } }));
      } catch {
        // fall back to the embedded snapshot if we have one; else surface the error
        setEntries((p) => ({
          ...p,
          [m.tenantId]: { state: m.invite ? 'ready' : 'error', invite: m.invite ?? null },
        }));
      }
    },
    [user.id]
  );

  useEffect(() => {
    invited.forEach(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function resend(m: Membership) {
    notifications.show({ color: 'green', title: 'Invite resent', message: `Sent to ${user.email}.` });
    try {
      await fetch('/api/platform/members/invite/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, tenant_id: m.tenantId }),
      });
    } catch {
      /* toast already shown; server reconciles */
    }
  }

  async function copyLink(m: Membership) {
    const token = entries[m.tenantId]?.invite?.token;
    if (!token) return;
    await navigator.clipboard?.writeText(`${INVITE_BASE_URL}/invite/${token}`);
    notifications.show({ color: 'brand', title: 'Link copied', message: 'Invite link on your clipboard.' });
  }

  async function revoke(m: Membership) {
    setEntries((p) => ({
      ...p,
      [m.tenantId]: { state: 'ready', invite: p[m.tenantId]?.invite ? { ...p[m.tenantId].invite!, revokedAt: new Date().toISOString() } : null },
    }));
    notifications.show({ color: 'red', title: 'Invite revoked', message: `${user.email} can no longer use this link.` });
    try {
      await fetch(`/api/platform/members/${user.id}/invite?tenant_id=${m.tenantId}`, { method: 'DELETE' });
      router.refresh();
    } catch {
      /* optimistic; server reconciles */
    }
  }

  return (
    <Stack gap="lg" mt="md">
      {user.memberships.map((m) => {
        const entry = entries[m.tenantId];
        const showInvite = !!entry;
        const stalled = entry?.invite ? isStalled(entry.invite) : false;
        return (
          <Stack gap="xs" key={m.tenantId}>
            <Divider label={m.tenantName} labelPosition="center" />

            <SimpleGrid cols={2} spacing="xs" verticalSpacing={8}>
              <Text size="sm" c="dimmed">Status</Text>
              <Badge color={STATUS_COLOR[m.status]} variant="light" tt="none" size="sm" w="fit-content">
                {cap(m.status)}
              </Badge>

              <Text size="sm" c="dimmed">Plan</Text>
              <Badge color={PLAN_COLOR[m.plan]} variant="light" tt="none" size="sm" w="fit-content">
                {PLAN_LABEL[m.plan]}
              </Badge>

              <Text size="sm" c="dimmed">Joined</Text>
              <Text size="sm">{formatMonthYear(m.joined)}</Text>

              <Text size="sm" c="dimmed">Last active</Text>
              <Text size="sm">{formatRelative(m.lastActive)}</Text>
            </SimpleGrid>

            <Select
              label="Role"
              data={ROLE_OPTIONS}
              value={roles[m.tenantId]}
              onChange={(v) => v && setRoles((prev) => ({ ...prev, [m.tenantId]: v as Role }))}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />

            {/* ‹invite tracking› — Option B */}
            {showInvite && (
              <>
                <Divider my={4} />
                <Group justify="space-between" align="center">
                  <Group gap={8} align="center">
                    <Text fw={600} size="sm">Invite link</Text>
                    {stalled && (
                      <Badge size="sm" radius="sm" variant="light" color="orange" tt="none"
                        leftSection={<IconAlertTriangle size={11} />}>
                        Stalled
                      </Badge>
                    )}
                  </Group>
                  {entry.invite && !entry.invite.revokedAt && <StageBadge reached={entry.invite.reached} />}
                </Group>

                {stalled && (
                  <Text size="xs" c="dimmed" mt={-2}>
                    Opened but not accepted for {formatRelative(entry.invite!.openedAt)} — consider resending.
                  </Text>
                )}

                <LinkTimeline invite={entry.invite} state={entry.state} onRetry={() => load(m)} />

                {entry.state === 'ready' && entry.invite && !entry.invite.revokedAt && (
                  <Group gap="sm" grow mt={4}>
                    <Button size="xs" variant={stalled ? 'filled' : 'light'} leftSection={<IconSend size={15} />} onClick={() => resend(m)}>
                      Resend
                    </Button>
                    <Button size="xs" variant="default" leftSection={<IconLink size={15} />} onClick={() => copyLink(m)}>
                      Copy link
                    </Button>
                    <Button size="xs" variant="subtle" color="red" leftSection={<IconX size={15} />} onClick={() => revoke(m)}>
                      Revoke
                    </Button>
                  </Group>
                )}
              </>
            )}
          </Stack>
        );
      })}

      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" color="gray" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={saving} disabled={!dirty}>
          Save changes
        </Button>
      </Group>
    </Stack>
  );
}
