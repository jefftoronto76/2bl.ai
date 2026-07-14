import type { CSSProperties } from 'react'
import { getAuthContext } from '@/services/auth'
import { getInboundChats, getTtftTrend, type ChatSession, type TtftTrendPoint } from '@/services/crm/inbound'
import { Box, Stack, Title } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import { InboundChartsDashboard } from './InboundChartsDashboard'
import { InboundChatsTable } from './InboundChatsTable'

export const dynamic = 'force-dynamic'

// Header/scroll-body split (mirrors app/admin/prompt-studio/blocks/page.tsx):
// the sticky filter bar inside InboundChatsTable needs its own scroll
// ancestor with no top padding (pt={0}) for `top: 0` to pin flush with no gap.
const HEADER_FRAME_STYLE: CSSProperties = {
  flexShrink: 0,
  borderBottom: '1px solid var(--mantine-color-gray-2)',
  background: '#fff',
}

const SCROLL_AREA_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
}

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
    <Stack h="100%" gap={0}>
      <Box px={{ base: 16, sm: 24 }} py={{ base: 12, sm: 16 }} style={HEADER_FRAME_STYLE}>
        <Stack gap={4}>
          <Title order={1} size="h2">Inbound Chats</Title>
          <Text variant="muted">Sage conversation history.</Text>
        </Stack>
      </Box>

      <Box style={SCROLL_AREA_STYLE} px={{ base: 'md', sm: 'lg' }} pb={{ base: 'md', sm: 'lg' }} pt={0}>
        <Stack gap="lg">
          <InboundChartsDashboard rows={rows} ttftTrend={ttftTrend} />
          <InboundChatsTable rows={rows} />
        </Stack>
      </Box>
    </Stack>
  )
}
