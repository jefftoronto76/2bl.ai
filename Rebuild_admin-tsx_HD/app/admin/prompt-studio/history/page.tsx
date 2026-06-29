'use client'

// Prompt Studio · History — Composer session log (every block-building conversation).
// Route: /admin/prompt-studio/history
// TODO: replace COMPOSER_HISTORY with the live history query.

import { Card, Stack, Table, Text, Title } from '@mantine/core'
import { COMPOSER_HISTORY } from '@/components/admin/lib/fixtures'
import { HISTORY_STATUS_BADGE, TintBadge } from '@/components/admin/lib/badges'

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function HistoryPage() {
  return (
    <Stack gap="lg" data-screen-label="Prompt Studio · History">
      <Stack gap={4}>
        <Title order={1} size="h2">History</Title>
        <Text c="dimmed">Composer sessions — every block-building conversation.</Text>
      </Stack>
      <Card withBorder radius="md" p={0} style={{ background: 'transparent', overflow: 'hidden' }}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Block</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Exchanges</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {COMPOSER_HISTORY.map((h) => (
              <Table.Tr key={h.id} style={{ cursor: 'pointer' }}>
                <Table.Td><Text fw={500} size="sm">{h.block}</Text></Table.Td>
                <Table.Td><Text c="dimmed" size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>{fmtDateTime(h.created_at)}</Text></Table.Td>
                <Table.Td><Text size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>{h.exchanges}</Text></Table.Td>
                <Table.Td><TintBadge tint={HISTORY_STATUS_BADGE[h.status]}>{HISTORY_STATUS_BADGE[h.status].label}</TintBadge></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  )
}
