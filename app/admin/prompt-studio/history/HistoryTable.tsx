'use client'

import { Table, Badge, Box, Center, Group, Paper, Stack } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'

function formatDate(iso: string) {
  // No timeZone specified — uses the browser's local timezone. Called only in
  // client-rendered output (suppressHydrationWarning on the element) so the
  // server's UTC default never persists to the user.
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'green',
  active: 'blue',
  flagged: 'yellow',
}

export interface SessionRow {
  id: string
  created_at: string
  status: string | null
  message_count: number | null
  block_id: string | null
  messages: { role: string; content: string }[] | null
  blocks: { title: string } | null
}

export function HistoryTable({ rows }: { rows: SessionRow[] }) {
  if (!rows.length) {
    return (
      <Center h={200}>
        <Text variant="muted">No composer sessions yet.</Text>
      </Center>
    )
  }

  return (
    <>
      {/* Desktop: Table */}
      <Box visibleFrom="md">
        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Block</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Exchanges</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((session) => {
              const blockName = session.blocks?.title ?? session.block_id ?? '—'
              const exchanges = session.message_count ?? (Array.isArray(session.messages) ? session.messages.length : 0)
              const status = session.status ?? 'active'

              return (
                <Table.Tr key={session.id}>
                  <Table.Td>
                    <Text variant="label">{blockName}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)' }} suppressHydrationWarning>
                      {formatDate(session.created_at)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
                      {exchanges}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={STATUS_COLORS[status] ?? 'gray'}
                      size="sm"
                      radius="sm"
                    >
                      {status}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Box>

      {/* Mobile: Card stack */}
      <Stack gap="sm" hiddenFrom="md">
        {rows.map((session) => {
          const blockName = session.blocks?.title ?? session.block_id ?? '—'
          const exchanges = session.message_count ?? (Array.isArray(session.messages) ? session.messages.length : 0)
          const status = session.status ?? 'active'

          return (
            <Paper key={session.id} p="md" withBorder radius="sm">
              <Group justify="space-between" mb={4}>
                <Text variant="label">{blockName}</Text>
                <Badge
                  variant="light"
                  color={STATUS_COLORS[status] ?? 'gray'}
                  size="sm"
                  radius="sm"
                >
                  {status}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
                  {exchanges} exchanges
                </Text>
                <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)' }} suppressHydrationWarning>
                  {formatDate(session.created_at)}
                </Text>
              </Group>
            </Paper>
          )
        })}
      </Stack>
    </>
  )
}
