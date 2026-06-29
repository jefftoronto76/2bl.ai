'use client'

// Tenant · Inbound Chats — pipeline dashboard (stat tiles + conversion funnel) over
// the Sage session table with a detail drawer. Route: /admin
//
// TODO: replace INBOUND_CHATS with the live sessions query. Token costs use the
// IN_COST/OUT_COST rates below — point them at your pricing source.

import { useMemo, useState } from 'react'
import { ActionIcon, Box, Card, Drawer, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { INBOUND_CHATS } from '@/components/admin/lib/fixtures'
import { SESSION_STATUS_BADGE, TintBadge } from '@/components/admin/lib/badges'
import { StatTile } from '@/components/admin/lib/primitives'
import type { Session, SessionStatus } from '@/components/admin/lib/types'

const IN_COST = 3, OUT_COST = 15 // $ / 1M tokens
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtTokens = (i: number, o: number) => ((i || 0) + (o || 0)).toLocaleString('en-US')
const fmtCost = (i: number, o: number) => '$' + (((i || 0) * IN_COST + (o || 0) * OUT_COST) / 1e6).toFixed(4)

const Mono = ({ children, dim }: { children: React.ReactNode; dim?: boolean }) => (
  <Text span c={dim ? 'dimmed' : undefined} style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: dim ? 12 : 'var(--mantine-font-size-sm)' }}>{children}</Text>
)
const SBadge = ({ status }: { status: SessionStatus }) => <TintBadge tint={SESSION_STATUS_BADGE[status]}>{SESSION_STATUS_BADGE[status].label}</TintBadge>

function SessionDrawer({ session, onClose }: { session: Session | null; onClose: () => void }) {
  if (!session) return null
  const name = session.visitor_name ?? 'Anonymous'
  return (
    <Drawer opened onClose={onClose} position="right" size={400} padding={0} withCloseButton={false}>
      <Stack gap={0} style={{ height: '100vh' }}>
        <Group gap="sm" wrap="nowrap" justify="space-between" p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text fw={600} fs={session.visitor_name ? 'normal' : 'italic'}>{name}</Text>
            {session.email && <Text c="dimmed" size="sm" truncate>{session.email}</Text>}
          </Stack>
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Close"><IconX size={18} /></ActionIcon>
        </Group>
        <Box p="md" style={{ flex: 1, overflowY: 'auto' }}>
          <Stack gap="sm">
            <Text tt="uppercase" fw={600} size="xs" c="dimmed" style={{ letterSpacing: '0.08em' }}>Session</Text>
            <SimpleGrid cols={2} spacing="xs" verticalSpacing={8}>
              <Text c="dimmed" size="sm">Status</Text><div><SBadge status={session.status} /></div>
              <Text c="dimmed" size="sm">Messages</Text><Mono>{session.msgs}</Mono>
              <Text c="dimmed" size="sm">Tokens</Text><Mono>{fmtTokens(session.input_tokens, session.output_tokens)}</Mono>
              <Text c="dimmed" size="sm">Cost</Text><Mono>{fmtCost(session.input_tokens, session.output_tokens)}</Mono>
              <Text c="dimmed" size="sm">Last active</Text><Mono>{fmtDateTime(session.updated_at)}</Mono>
            </SimpleGrid>
            <Group gap={8} mt="md" wrap="nowrap" align="center" style={{ padding: '10px 12px', borderRadius: 'var(--mantine-radius-sm)', background: 'var(--mantine-color-gray-0)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--mantine-color-brand-6)', flex: '0 0 auto' }} />
              <Text size="sm" c="dimmed">Full transcript opens here in the live admin.</Text>
            </Group>
          </Stack>
        </Box>
      </Stack>
    </Drawer>
  )
}

function Dashboard({ rows }: { rows: Session[] }) {
  const stats = useMemo(() => {
    let tin = 0, tout = 0, msgs = 0
    const dist: Record<SessionStatus, number> = { in_progress: 0, active: 0, abandoned: 0 }
    for (const s of rows) { tin += s.input_tokens || 0; tout += s.output_tokens || 0; msgs += s.msgs || 0; dist[s.status]++ }
    const presentedCTA = rows.filter((s) => s.msgs >= 6).length
    const converted = rows.filter((s) => s.msgs >= 12).length
    return { tin, tout, msgs, dist, presentedCTA, converted }
  }, [rows])
  const totalTokens = stats.tin + stats.tout
  const cost = '$' + ((stats.tin * IN_COST + stats.tout * OUT_COST) / 1e6).toFixed(2)
  const fmtK = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n))
  const started = rows.length
  const funnel = [
    { key: 'started', label: 'Chats started', value: started, color: 'var(--mantine-color-blue-7)' },
    { key: 'cta', label: 'Presented CTA', value: stats.presentedCTA, color: 'var(--mantine-color-orange-8)' },
    { key: 'converted', label: 'Converted', value: stats.converted, color: 'var(--mantine-color-brand-6)' },
    { key: 'abandoned', label: 'Abandoned', value: stats.dist.abandoned, color: 'var(--mantine-color-gray-6)' },
  ]
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <SimpleGrid cols={2} spacing="md">
        <StatTile label="Sessions" value={started} sub={`${stats.msgs} messages`} />
        <StatTile label="Tokens" value={fmtK(totalTokens)} sub="input + output" />
        <StatTile label="Est. cost" value={cost} sub="sonnet-4-6 rates" />
        <StatTile label="Converted" value={`${started > 0 ? Math.round((stats.converted / started) * 100) : 0}%`} sub={`${stats.converted} of ${started}`} accent="var(--mantine-color-brand-6)" />
      </SimpleGrid>
      <Card withBorder radius="md" p="lg" style={{ background: 'transparent' }}>
        <Stack gap="sm">
          <Text fw={600} size="sm">Conversion pipeline</Text>
          <Stack gap={12}>
            {funnel.map((s) => {
              const pct = started > 0 ? Math.round((s.value / started) * 100) : 0
              return (
                <Stack key={s.key} gap={4}>
                  <Group justify="space-between" align="baseline">
                    <Group gap={8} align="center" wrap="nowrap">
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: '0 0 auto' }} />
                      <Text size="sm">{s.label}</Text>
                    </Group>
                    <Text size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>{s.value} <Text span c="dimmed" size="xs">· {pct}%</Text></Text>
                  </Group>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--mantine-color-gray-2)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: s.color, transition: 'width 200ms ease' }} />
                  </div>
                </Stack>
              )
            })}
          </Stack>
        </Stack>
      </Card>
    </SimpleGrid>
  )
}

export default function InboundChatsPage() {
  const [sel, setSel] = useState<Session | null>(null)
  const rows = INBOUND_CHATS // TODO: replace with query
  return (
    <Stack gap="lg" data-screen-label="Admin · Inbound Chats">
      <Stack gap={4}>
        <Title order={1} size="h2">Inbound Chats</Title>
        <Text c="dimmed">Sage conversation history.</Text>
      </Stack>
      <Dashboard rows={rows} />
      <Card withBorder radius="md" p={0} style={{ background: 'transparent', overflow: 'hidden' }}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
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
            {rows.map((s) => (
              <Table.Tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setSel(s)}>
                <Table.Td>
                  <Stack gap={0}>
                    <Text fw={500} size="sm" fs={s.visitor_name ? 'normal' : 'italic'}>{s.visitor_name ?? 'Anonymous'}</Text>
                    {s.email && <Text c="dimmed" size="xs">{s.email}</Text>}
                  </Stack>
                </Table.Td>
                <Table.Td><Mono>{s.msgs}</Mono></Table.Td>
                <Table.Td><Mono>{fmtTokens(s.input_tokens, s.output_tokens)}</Mono></Table.Td>
                <Table.Td><Mono>{fmtCost(s.input_tokens, s.output_tokens)}</Mono></Table.Td>
                <Table.Td><SBadge status={s.status} /></Table.Td>
                <Table.Td><Mono dim>{fmtDateTime(s.updated_at)}</Mono></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      <SessionDrawer session={sel} onClose={() => setSel(null)} />
    </Stack>
  )
}
