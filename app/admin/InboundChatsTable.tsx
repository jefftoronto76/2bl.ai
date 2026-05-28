'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Table, Badge, Box, Center, Group, Paper, Stack } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import type { SessionStatus } from '@/services/crm/status'
import type { ChatSession } from '@/services/crm/inbound'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Anthropic pricing (claude-sonnet-4-6) used for the Inbound Chats list cost
// estimate: $3 / 1M input tokens, $15 / 1M output tokens. Approximate — does
// not reflect cache discounts or fallback model usage.
const INPUT_COST_PER_MILLION = 3
const OUTPUT_COST_PER_MILLION = 15

function formatTokens(input: number | null, output: number | null): string {
  const total = (input ?? 0) + (output ?? 0)
  return total.toLocaleString('en-US')
}

function formatCost(input: number | null, output: number | null): string {
  const dollars =
    ((input ?? 0) * INPUT_COST_PER_MILLION + (output ?? 0) * OUTPUT_COST_PER_MILLION) / 1_000_000
  return `$${dollars.toFixed(4)}`
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  in_progress: 'green',
  active: 'yellow',
  abandoned: 'gray',
}

export function InboundChatsTable({ rows }: { rows: ChatSession[] }) {
  const router = useRouter()

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
                  onClick={() => router.push(`/admin/sessions/${session.id}`)}
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
            <Link
              key={session.id}
              href={`/admin/sessions/${session.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Paper p="md" withBorder radius="sm">
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
            </Link>
          )
        })}
      </Stack>
    </>
  )
}
