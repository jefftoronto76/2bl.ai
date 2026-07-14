import { getAuthContext } from '@/services/auth'
import { getInboundChats, getTtftTrend, type ChatSession, type TtftTrendPoint } from '@/services/crm/inbound'
import { Stack, Title } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import { InboundChartsDashboard } from './InboundChartsDashboard'
import { InboundChatsTable } from './InboundChatsTable'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  let rows: ChatSession[] = []
  let ttftTrend: TtftTrendPoint[] = []

  try {
    const { tenant_id } = await getAuthContext()
    ;[rows, ttftTrend] = await Promise.all([
      getInboundChats(tenant_id),
      getTtftTrend(tenant_id),
    ])
  } catch (err) {
    console.error('[admin/page] auth failed:', err instanceof Error ? err.message : err)
  }

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={1} size="h2">Inbound Chats</Title>
        <Text variant="muted">Sage conversation history.</Text>
      </Stack>
      <InboundChartsDashboard rows={rows} ttftTrend={ttftTrend} />
      <InboundChatsTable rows={rows} />
    </Stack>
  )
}
