'use client';
// app/admin/members/MemberDrawer.tsx

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Avatar,
  Button,
  Divider,
  Drawer,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { IconAlertTriangle, IconLink, IconSend, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { InviteFetchState, InviteLink, Membership, Role, UserRow } from './types';
import { ROLE_OPTIONS, STATUS_COLOR, PLAN_COLOR, PLAN_LABEL, INVITE_STAGE_META, cap } from './constants';
import { formatMonthYear, formatRelative } from './utils';
import { inviteUrlFor } from './inviteLink';
import { LinkTimeline, isStalled } from './LinkTimeline';

interface MemberDrawerProps {
  user: UserRow | null;
  opened: boolean;
  onClose: () => void;
  inviteApiBase?: string;
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
 * Right-side detail drawer. Stacks one section per tenant membership, each with its
 * own Role dropdown. A single "Save changes" button writes every changed role in one
 * request (PATCH /api/platform/members/roles). For invited-only members the role
 * form is hidden. Any membership with a tracked invite (or status = 'invited') gets
 * an "Invite link" section: a lifecycle timeline (Created → Opened → Accepted) plus
 * Resend / Copy link / Revoke actions — refetched live on drawer open.
 */
export function MemberDrawer({ user, opened, onClose, inviteApiBase = '/api/platform/members' }: MemberDrawerProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="min(440px, 100vw)"
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
              <Text size="xs" c="dimmed" truncate>
                {user.memberships[0]?.invitedByName
                  ? `Invited by ${user.memberships[0].invitedByName}`
                  : 'Seeded · no inviter'}
              </Text>
            </div>
          </Group>
        ) : null
      }
    >
      {/* key on user.id so role + invite state reset cleanly between users */}
      {user ? <DrawerBody key={user.id} user={user} onDone={onClose} inviteApiBase={inviteApiBase} /> : null}
    </Drawer>
  );
}

/** Per-membership live invite detail, refetched when the drawer opens. */
type InviteEntry = { state: InviteFetchState; invite: InviteLink | null };

function DrawerBody({ user, onDone, inviteApiBase }: { user: UserRow; onDone: () => void; inviteApiBase: string }) {
  const router = useRouter();

  // ── role editing ──
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

  // ── invite-link live detail ──
  // Seed from the snapshot page.tsx embeds on each membership, then refetch on
  // open so the stage + opens count are fresh. Only memberships that have (or
  // could have) an invite are tracked. Keyed by memberId — invited-only rows
  // (no users.id) are the primary audience for this section.
  const invited = user.memberships.filter((m) => m.invite || m.status === 'invited');
  const [entries, setEntries] = useState<Record<string, InviteEntry>>(() =>
    Object.fromEntries(invited.map((m) => [m.memberId, { state: 'ready' as InviteFetchState, invite: m.invite ?? null }]))
  );
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = useCallback(
    async (m: Membership) => {
      setEntries((p) => ({ ...p, [m.memberId]: { ...p[m.memberId], state: 'loading', invite: p[m.memberId]?.invite ?? null } }));
      try {
        const res = await fetch(`${inviteApiBase}/invite/${m.memberId}`);
        if (!res.ok) throw new Error();
        const invite = (await res.json()) as InviteLink;
        setEntries((p) => ({ ...p, [m.memberId]: { state: 'ready', invite } }));
      } catch {
        // fall back to the embedded snapshot if we have one; else surface the error
        setEntries((p) => ({
          ...p,
          [m.memberId]: { state: m.invite ? 'ready' : 'error', invite: m.invite ?? null },
        }));
      }
    },
    [inviteApiBase]
  );

  useEffect(() => {
    invited.forEach(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function resend(m: Membership) {
    setResendingId(m.memberId);
    try {
      const res = await fetch(`${inviteApiBase}/invite/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: m.memberId }),
      });
      if (!res.ok) throw new Error('Could not regenerate invite link.');
      notifications.show({
        color: 'green',
        title: 'Invite link regenerated',
        message: 'A fresh link is ready to copy below.',
      });
      await load(m);
      router.refresh();
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Could not resend',
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setResendingId(null);
    }
  }

  function copyLink(m: Membership) {
    const token = entries[m.memberId]?.invite?.token;
    if (!token) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    void navigator.clipboard.writeText(inviteUrlFor(token, m.tenantDomain, origin));
    notifications.show({ color: 'green', title: 'Copied', message: 'Invite link copied to clipboard.' });
  }

  async function revoke(m: Membership) {
    const now = new Date().toISOString();
    setEntries((p) => ({
      ...p,
      [m.memberId]: p[m.memberId]?.invite
        ? { state: 'ready', invite: { ...p[m.memberId].invite!, revokedAt: now } }
        : p[m.memberId],
    }));
    notifications.show({ color: 'green', title: 'Invite link revoked.', message: '' });
    try {
      const res = await fetch(`${inviteApiBase}/invite/${m.memberId}/revoke`, { method: 'POST' });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      // reconcile with the server's real state rather than trusting the optimistic stamp
      await load(m);
      notifications.show({
        color: 'red',
        title: 'Could not revoke',
        message: 'The invite may already have been accepted.',
      });
    }
  }

  return (
    <Stack gap="lg" mt="md">
      {user.memberships.map((m) => {
        const entry = entries[m.memberId];
        const showInvite = !!entry;
        const stalled = entry?.invite ? isStalled(entry.invite) : false;
        return (
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

            {/* Invite link — lifecycle timeline + actions */}
            {showInvite && (
              <>
                <Divider my={4} />
                <Group justify="space-between" align="center">
                  <Group gap={8} align="center">
                    <Text fw={600} size="sm">
                      Invite link
                    </Text>
                    {stalled && (
                      <Badge
                        size="sm"
                        radius="sm"
                        variant="light"
                        color="orange"
                        tt="none"
                        leftSection={<IconAlertTriangle size={11} />}
                      >
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

                {entry.state === 'ready' && entry.invite && !entry.invite.revokedAt && entry.invite.reached !== 'accepted' && (
                  <Group gap="sm" grow mt={4}>
                    <Button
                      size="xs"
                      variant={stalled ? 'filled' : 'light'}
                      leftSection={<IconSend size={15} />}
                      loading={resendingId === m.memberId}
                      onClick={() => resend(m)}
                    >
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
