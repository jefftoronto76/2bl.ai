// app/admin/settings/AppearanceHistory.tsx
//
// Read-only audit trail rendered at the bottom of the Settings › Appearance
// section. One row per field change, newest first: avatar (auto-initials),
// "<Actor> changed <Field>", a before → after diff, and an absolute timestamp.
//
// Data comes from getAppearanceHistory() (server) and is passed in as `log`.

'use client';

import { Avatar, Card, Group, Stack, Text } from '@mantine/core';
import type { AppearanceChange } from './types';
import { AppearanceDiffValue } from './AppearanceDiff';
import { formatAuditTime } from './utils';

export function AppearanceHistory({ log }: { log: AppearanceChange[] }) {
  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" align="baseline" mb={log.length ? 'xs' : 0}>
        <Text fw={600} size="sm">
          Change history
        </Text>
        <Text ff="monospace" size="xs" c="dimmed">
          {log.length} {log.length === 1 ? 'change' : 'changes'}
        </Text>
      </Group>

      {log.length === 0 ? (
        <Text size="sm" c="dimmed">
          No changes recorded yet.
        </Text>
      ) : (
        <Stack gap={0}>
          {log.map((e, i) => (
            <Group
              key={e.id}
              align="flex-start"
              wrap="nowrap"
              gap="sm"
              py="sm"
              style={{ borderTop: i === 0 ? undefined : '1px solid var(--mantine-color-gray-2)' }}
            >
              <Avatar name={e.actor} color="initials" radius="xl" size={28} />

              <Stack gap={5} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" lh={1.35}>
                  <Text span fw={600}>
                    {e.actor}
                  </Text>{' '}
                  changed{' '}
                  <Text span fw={600}>
                    {e.field}
                  </Text>
                </Text>
                <Group gap={7} align="center" wrap="wrap" c="gray.5">
                  <AppearanceDiffValue kind={e.kind} value={e.from} />
                  <Text span c="gray.5" aria-hidden>
                    →
                  </Text>
                  <AppearanceDiffValue kind={e.kind} value={e.to} />
                </Group>
              </Stack>

              <Text
                ff="monospace"
                size="xs"
                c="gray.6"
                title={e.email}
                style={{ whiteSpace: 'nowrap', flex: '0 0 auto' }}
              >
                {formatAuditTime(e.at)}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  );
}
