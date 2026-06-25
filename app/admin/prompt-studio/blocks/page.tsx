import type { CSSProperties } from 'react'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth'
import { Box, Center, Flex, Stack, Title } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import { NewBlockButton } from '@/components/admin/content/NewBlockButton'
import type { Topic } from '@/components/admin/content/BlockEditForm'
import { BlocksTable, type BlockRow } from './BlocksTable'
import { PublishButton } from './PublishButton'
import { PromptSetSelect } from './PromptSetSelect'
import { getPromptSets } from './getPromptSets'
import { resolveActiveSet } from './promptSets'

export const dynamic = 'force-dynamic'

const HEADER_FRAME_STYLE: CSSProperties = {
  flexShrink: 0,
  borderBottom: '1px solid var(--mantine-color-gray-2)',
}

const SCROLL_AREA_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
}

const FALLBACK_CONTENT_STYLE: CSSProperties = {
  flex: 1,
}

export default async function BlocksPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string }>
}) {
  const { set: requestedSet } = await searchParams

  let tenantId: string
  try {
    const authCtx = await getAuthContext()
    tenantId = authCtx.tenant_id
  } catch {
    return (
      <Stack h="100%" gap={0}>
        <Flex
          direction={{ base: 'column', sm: 'row' }}
          justify="space-between"
          align={{ base: 'stretch', sm: 'center' }}
          gap="sm"
          px={{ base: 16, sm: 24 }}
          py={{ base: 12, sm: 16 }}
          style={HEADER_FRAME_STYLE}
        >
          <Title order={1} fz="lg" fw={600}>
            Blocks
          </Title>
        </Flex>
        <Center p="md" style={FALLBACK_CONTENT_STYLE}>
          <Text variant="muted">Unable to load blocks.</Text>
        </Center>
      </Stack>
    )
  }

  const supabase = getAdminClient()

  // Prompt sets feed the picker; the active set scopes the blocks query.
  // Falls back to all non-deleted blocks when no prompt_types rows exist.
  const sets = await getPromptSets(tenantId)
  const activeSet = resolveActiveSet(sets, requestedSet ?? null)

  let blocksQuery = supabase
    .from('blocks')
    .select(
      'id, title, type, body, status, is_default, order, created_at, updated_at, topics(name), author:users!blocks_updated_by_fkey(name)',
    )
    .eq('tenant_id', tenantId)
    .neq('status', 'deleted')
  if (activeSet) {
    blocksQuery = blocksQuery.eq('prompt_type_key', activeSet.key)
  }

  const [blocksResult, topicsResult] = await Promise.all([
    blocksQuery.order('created_at', { ascending: false }),
    supabase
      .from('topics')
      .select('id, name, type')
      .eq('tenant_id', tenantId)
      .order('name'),
  ])

  if (blocksResult.error) {
    console.error('[blocks] fetch error:', blocksResult.error.message)
  }
  if (topicsResult.error) {
    console.error('[blocks] topics fetch error:', topicsResult.error.message)
  }

  const rows = (blocksResult.data as BlockRow[] | null) ?? []
  const topics = (topicsResult.data as Topic[] | null) ?? []

  return (
    <Stack h="100%" gap={0}>
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        justify="space-between"
        align={{ base: 'stretch', sm: 'flex-start' }}
        gap="md"
        px={{ base: 16, sm: 24 }}
        py={{ base: 12, sm: 16 }}
        style={HEADER_FRAME_STYLE}
      >
        <Stack gap="sm">
          <Stack gap={4}>
            <Title order={1} fz="lg" fw={600}>
              Blocks
            </Title>
            <Text variant="muted">
              Reusable prompt blocks — compiled into your system prompt.
            </Text>
          </Stack>

          {sets.length > 0 && activeSet && (
            <PromptSetSelect sets={sets} activeId={activeSet.id} />
          )}
        </Stack>

        <Flex direction={{ base: 'column', sm: 'row' }} gap="sm" align="flex-start">
          <NewBlockButton topics={topics} />
          <PublishButton />
        </Flex>
      </Flex>

      <Box style={SCROLL_AREA_STYLE} px={{ base: 'md', sm: 'lg' }} pb={{ base: 'md', sm: 'lg' }} pt={0}>
        <BlocksTable
          rows={rows}
          overview={{
            version: activeSet?.version ?? null,
            status: activeSet?.status ?? null,
          }}
        />
      </Box>
    </Stack>
  )
}
