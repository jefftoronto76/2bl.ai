'use client'

import { useState } from 'react'
import { Table, Badge, Box, Center, Group, Paper, Stack } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import type { SessionStatus } from '@/services/crm/status'
import type { ChatSession } from '@/services/crm/inbound'
import { formatTokens, formatCost } from '@/services/crm/formatting'
import { SessionDrawer } from './SessionDrawer'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  in_progress: 'green',
  active: 'yellow',
  abandoned: 'gray',
}

export function InboundChatsTable({ rows }: { rows: ChatSession[] }) {
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null)

  if (!rows.length) {
    return (
      <Center h={200}>
        <Text variant="muted">No sessions yet.</Text>
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
              <Table.Th>Visitor</Table.Th>
              <Table.Th>Messages</Table.Th>
              <Table.Th>Tokens</Table.Th>
              <Table.Th>Cost</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Last Active</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((session) => {
              const messageCount = Array.isArray(session.messages) ? session.messages.length : 0
              const status = session.derived_status
              return (
                <Table.Tr
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>
                    <Text variant="label" style={{ fontStyle: session.visitor_name ? 'normal' : 'italic' }}>
                      {session.visitor_name ?? 'Anonymous'}
                    </Text>
                    {session.email && (
                      <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)' }}>
                        {session.email}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
                      {messageCount}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
                      {formatTokens(session.input_tokens, session.output_tokens)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
                      {formatCost(session.input_tokens, session.output_tokens)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={STATUS_COLORS[status]}
                      size="sm"
                      radius="sm"
                    >
                      {status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)' }}>
                      {formatDate(session.updated_at ?? session.created_at)}
                    </Text>
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
          const messageCount = Array.isArray(session.messages) ? session.messages.length : 0
          const status = session.derived_status
          return (
            <Paper
              key={session.id}
              p="md"
              withBorder
              radius="sm"
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedSession(session)}
            >
              <Group justify="space-between" mb={4}>
                <Box>
                  <Text variant="label" style={{ fontStyle: session.visitor_name ? 'normal' : 'italic' }}>
                    {session.visitor_name ?? 'Anonymous'}
                  </Text>
                  {session.email && (
                    <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)' }}>
                      {session.email}
                    </Text>
                  )}
                </Box>
                <Badge
                  variant="light"
                  color={STATUS_COLORS[status]}
                  size="sm"
                  radius="sm"
                >
                  {status}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
                  {messageCount} messages
                </Text>
                <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)' }}>
                  {formatDate(session.updated_at ?? session.created_at)}
                </Text>
              </Group>
              <Group justify="space-between" mt={4}>
                <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)' }}>
                  {formatTokens(session.input_tokens, session.output_tokens)} tokens
                </Text>
                <Text variant="muted" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)' }}>
                  {formatCost(session.input_tokens, session.output_tokens)}
                </Text>
              </Group>
            </Paper>
          )
        })}
      </Stack>

      <SessionDrawer session={selectedSession} onClose={() => setSelectedSession(null)} />
    </>
  )
}
