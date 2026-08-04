// app/admin/settings/AppearanceDiff.tsx
//
// Renders a single before/after value for an audit row. `kind` decides the
// presentation: a color shows a swatch + lowercase hex; font/toggle show text.
// Keep the UI dumb — the value is pre-formatted server-side; we never infer kind
// from the field name here.

import { Group, Text } from '@mantine/core';
import type { AppearanceChangeKind } from './types';

export function AppearanceDiffValue({
  kind,
  value,
}: {
  kind: AppearanceChangeKind;
  value: string;
}) {
  if (kind === 'color') {
    return (
      <Group component="span" gap={6} wrap="nowrap" align="center">
        <span
          aria-hidden
          style={{
            width: 13,
            height: 13,
            borderRadius: 3,
            background: value,
            border: '1px solid rgba(0,0,0,0.18)',
            flex: '0 0 auto',
            display: 'inline-block',
          }}
        />
        <Text span ff="monospace" size="xs" c="dimmed" tt="lowercase">
          {value}
        </Text>
      </Group>
    );
  }

  return (
    <Text span size="sm" ff={kind === 'font' ? 'monospace' : undefined}>
      {value}
    </Text>
  );
}
