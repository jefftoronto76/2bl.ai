// app/admin/members/LinkTimeline.tsx
'use client';

import { Alert, Box, Button, Skeleton, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { InviteFetchState, InviteLink, InviteStage } from './types';
import {
  INVITE_STAGES,
  INVITE_STAGE_META,
  INVITE_STALL_DAYS,
  inviteStageIndex,
} from './constants';
import { formatRelative } from './utils';

const meta = (s: InviteStage) => INVITE_STAGE_META[s];
const tsFor = (invite: InviteLink, s: InviteStage): string | null =>
  ({ sent: invite.sentAt, delivered: invite.deliveredAt ?? null, opened: invite.openedAt, accepted: invite.acceptedAt } as const)[s] ?? null;

/**
 * The dimmed sub-line under each stage label. "Opened" is special: it shows the
 * cumulative open count + most recent timestamp — "3× · last 2d ago" — because
 * repeat opens are useful context. Other stages show a single relative timestamp.
 */
function subLine(
  s: InviteStage,
  done: boolean,
  current: boolean,
  ts: string | null,
  invite: InviteLink
): string {
  if (!done) return current ? 'waiting' : 'not yet';
  if (s === 'opened') {
    const n = invite.opens ?? (invite.openedAt ? 1 : 0);
    const last = invite.openedAt ? `last ${formatRelative(invite.openedAt)}` : 'last just now';
    return n > 0 ? `${n}× · ${last}` : 'just now';
  }
  if (ts) return formatRelative(ts);
  return current ? 'just now' : meta(s).hint;
}

/**
 * A link is STALLED when it has been opened but not accepted for longer than
 * INVITE_STALL_DAYS — the cue to resend / follow up.
 */
export function isStalled(invite: InviteLink): boolean {
  if (invite.revokedAt) return false;
  if (invite.reached !== 'opened' || !invite.openedAt) return false;
  const days = (Date.now() - new Date(invite.openedAt).getTime()) / 86_400_000;
  return days >= INVITE_STALL_DAYS;
}

/**
 * Vertical invite-lifecycle timeline for the member detail drawer (Option B).
 * Handles the three async states the drawer can be in:
 *   • 'loading' → skeleton rows (drawer refetches live invite detail on open)
 *   • 'error'   → inline alert + Retry
 *   • 'ready'   → the timeline
 */
export function LinkTimeline({
  invite,
  state = 'ready',
  onRetry,
}: {
  invite: InviteLink | null;
  state?: InviteFetchState;
  onRetry?: () => void;
}) {
  if (state === 'loading') {
    return (
      <Stack gap={14} py={4}>
        {INVITE_STAGES.map((s, i) => (
          <Skeleton key={s} height={12} width={`${72 - i * 12}%`} radius="sm" />
        ))}
      </Stack>
    );
  }

  if (state === 'error') {
    return (
      <Alert
        variant="light"
        color="red"
        radius="md"
        icon={<IconAlertTriangle size={16} />}
        title="Couldn’t load invite activity"
      >
        <Text size="sm" c="dimmed">
          The link’s status couldn’t be fetched.
        </Text>
        {onRetry && (
          <Button size="xs" variant="default" mt="xs" onClick={onRetry}>
            Retry
          </Button>
        )}
      </Alert>
    );
  }

  if (!invite || invite.revokedAt) {
    return (
      <Text size="sm" c="dimmed">
        {invite?.revokedAt ? 'Invite link revoked.' : 'No tracked invite for this member.'}
      </Text>
    );
  }

  const ri = inviteStageIndex(invite.reached);

  return (
    <Stack gap={0}>
      {INVITE_STAGES.map((s, i) => {
        const done = i <= ri;
        const current = i === ri;
        const isLast = i === INVITE_STAGES.length - 1;
        const c = meta(s).color;
        const ts = tsFor(invite, s);
        return (
          <Box key={s} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', columnGap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  marginTop: 3,
                  boxSizing: 'border-box',
                  background: done ? c : 'transparent',
                  border: done ? `1px solid ${c}` : '1.5px solid var(--mantine-color-gray-3)',
                }}
              />
              {!isLast && (
                <span
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 20,
                    background: i < ri ? c : 'var(--mantine-color-gray-2)',
                  }}
                />
              )}
            </div>
            <div style={{ paddingBottom: isLast ? 0 : 14 }}>
              <Text size="sm" fw={done ? 600 : 400} c={done ? undefined : 'dimmed'}>
                {meta(s).label}
              </Text>
              <Text size="xs" c="dimmed">
                {subLine(s, done, current, ts, invite)}
              </Text>
            </div>
          </Box>
        );
      })}
    </Stack>
  );
}
