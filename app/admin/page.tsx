import type { CSSProperties } from 'react'
import { getAuthContext } from '@/services/auth'
import { getInboundChats, getTtftTrend, type ChatSession, type TtftTrendPoint } from '@/services/crm/inbound'
import { Box, Stack, Title } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import { InboundChartsDashboard } from './InboundChartsDashboard'
import { InboundChatsTable } from './InboundChatsTable'
import { createPhaseTimer, AuditAction } from '@/services/audit'
import { after } from 'next/server'

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

// Timing instrumentation (2026-09, measurement only): one
// ADMIN_PAGE_LOAD_TIMING audit event per render with per-phase durations.
// timer.time() is a transparent pass-through — the Promise.all members still
// run concurrently. Nothing about what's fetched or rendered changes.
export default async function AdminPage() {
  const timer = createPhaseTimer()
  let rows: ChatSession[] = []
  let ttftTrend: TtftTrendPoint[] = []
  let tenantId: string | null = null
  // Which phase threw, if any. The catch below swallows the error and still
  // renders the page, so the response is always a 200 — the failure is
  // carried here rather than as a fictitious HTTP status.
  let errorPhase: 'auth' | 'dataFetch' | null = null

  try {
    const { tenant_id } = await timer.time('auth', () => getAuthContext())
    tenantId = tenant_id
    ;[rows, ttftTrend] = await Promise.all([
      timer.time('inboundChats', () => getInboundChats(tenant_id)),
      timer.time('ttftTrend', () => getTtftTrend(tenant_id)),
    ])
  } catch (err) {
    // 'auth' when getAuthContext() itself failed (no tenant resolved),
    // 'dataFetch' when a data fetch failed after auth succeeded.
    errorPhase = tenantId === null ? 'auth' : 'dataFetch'
    console.error('[admin/page] auth failed:', err instanceof Error ? err.message : err)
  }
  // Registered after the try/catch so it runs on both the success and catch
  // paths. after(): keep the insert alive past the response.
  after(() => timer.log(AuditAction.ADMIN_PAGE_LOAD_TIMING, { path: 'app/admin/page.tsx', method: 'GET', status: 200, rowCount: rows.length, tenantId, extra: { errorPhase } }))

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
