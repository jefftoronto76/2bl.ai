'use client'

import { useState } from 'react'
import {
  Table,
  Badge,
  Box,
  Button,
  Center,
  Chip,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  TextInput,
} from '@mantine/core'
import { IconSearch, IconX } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import type { SessionStatus } from '@/services/crm/status'
import type { ChatSession } from '@/services/crm/inbound'
import { formatTokens, formatCost } from '@/services/crm/formatting'
import { FeedbackCounts } from '@/components/admin/lib/primitives'
import { useInboundChatsFilters, type InboundStatusFilter } from './useInboundChatsFilters'
import { SessionDrawer } from './SessionDrawer'
import toolbarStyles from '@/components/admin/lib/stickyToolbar.module.css'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Flags a session's response time as slow — matches the dashboard's "Over 1s" threshold.
const TTFT_FLAG_MS = 1000

function formatTtft(ms: number | null): string {
  return ms != null ? `${ms}ms` : '—'
}

function ttftColor(ms: number | null): string | undefined {
  return ms != null && ms > TTFT_FLAG_MS ? 'var(--mantine-color-orange-7)' : undefined
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  in_progress: 'green',
  active: 'yellow',
  abandoned: 'gray',
}

export function InboundChatsTable({ rows }: { rows: ChatSession[] }) {
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null)
  const {
    query, setQuery,
    statusFilter, setStatusFilter,
    negativeOnly, setNegativeOnly,
    slowOnly, setSlowOnly,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    hasActiveFilter,
    clearAll,
    filtered,
    counts,
  } = useInboundChatsFilters(rows)

  if (!rows.length) {
    return (
      <Center h={200}>
        <Text variant="muted">No sessions yet.</Text>
      </Center>
    )
  }

  return (
    <>
      <Box className={toolbarStyles.stickyToolbar}>
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <TextInput
              placeholder="Search visitor name or email…"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              leftSection={<IconSearch size={14} />}
              style={{ flex: '1 1 240px', minWidth: 200 }}
              aria-label="Search sessions"
            />
            <SegmentedControl
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as InboundStatusFilter)}
              data={[
                { label: `All (${counts.all})`, value: 'all' },
                { label: `In progress (${counts.in_progress})`, value: 'in_progress' },
                { label: `Active (${counts.active})`, value: 'active' },
                { label: `Abandoned (${counts.abandoned})`, value: 'abandoned' },
              ]}
            />
          </Group>

          <Group justify="space-between" wrap="wrap" gap="sm">
            <Group gap="xs" wrap="wrap" align="center">
              <Chip
                checked={negativeOnly}
                onChange={setNegativeOnly}
                size="xs"
                variant="light"
                color="orange"
              >
                Negative feedback
              </Chip>
              <Chip
                checked={slowOnly}
                onChange={setSlowOnly}
                size="xs"
                variant="light"
                color="orange"
              >
                TTFT over 1s
              </Chip>
              <TextInput
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.currentTarget.value)}
                size="xs"
                aria-label="From date"
                style={{ width: 140 }}
              />
              <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)' }}>to</Text>
              <TextInput
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.currentTarget.value)}
                size="xs"
                aria-label="To date"
                style={{ width: 140 }}
              />
              {hasActiveFilter && (
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  leftSection={<IconX size={12} />}
                  onClick={clearAll}
                >
                  Clear filters
                </Button>
              )}
            </Group>
            <Text
              variant="muted"
              style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)' }}
            >
              {filtered.length} / {rows.length}
            </Text>
          </Group>
        </Stack>
      </Box>

      {filtered.length === 0 ? (
        <Center h={150}>
          <Text variant="muted">No sessions found.</Text>
        </Center>
      ) : (
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
                  <Table.Th>Avg TTFT</Table.Th>
                  <Table.Th>Feedback</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Last Active</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((session) => {
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
                        <Text
                          variant="muted"
                          style={{ fontFamily: 'var(--mantine-font-family-monospace)', color: ttftColor(session.ttft_ms) }}
                        >
                          {formatTtft(session.ttft_ms)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <FeedbackCounts up={session.feedback_counts.up} down={session.feedback_counts.down} size="xs" />
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
            {filtered.map((session) => {
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
                  <Group justify="space-between" mt={4}>
                    <Text
                      variant="muted"
                      style={{
                        fontFamily: 'var(--mantine-font-family-monospace)',
                        fontSize: 'var(--mantine-font-size-xs)',
                        color: ttftColor(session.ttft_ms),
                      }}
                    >
                      {formatTtft(session.ttft_ms)} response
                    </Text>
                    <FeedbackCounts up={session.feedback_counts.up} down={session.feedback_counts.down} size="xs" />
                  </Group>
                </Paper>
              )
            })}
          </Stack>
        </>
      )}

      <SessionDrawer session={selectedSession} onClose={() => setSelectedSession(null)} />
    </>
  )
}
