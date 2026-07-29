import type { CSSProperties } from 'react'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext, getCurrentUser } from '@/services/auth'
import { resolveTenantForPromptSet } from '@/services/prompt'
import { Box, Center, Flex, Stack, Title } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import type { Topic } from '@/components/admin/content/BlockEditForm'
import { BlocksTable, type BlockRow } from './BlocksTable'
import { PromptSetSelect } from '@/components/admin/prompt-studio/PromptSetSelect'
import { getPromptSets } from './getPromptSets'
import { resolveActiveSet } from '@/components/admin/prompt-studio/promptSet'

export const dynamic = 'force-dynamic'

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

const FALLBACK_CONTENT_STYLE: CSSProperties = {
  flex: 1,
}

function BlocksFallback({ message }: { message: string }) {
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
        <Text variant="muted">{message}</Text>
      </Center>
    </Stack>
  )
}

export default async function BlocksPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string }>
}) {
  const { set: requestedSet } = await searchParams

  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch {
    return <BlocksFallback message="Unable to load blocks." />
  }

  // Composer-family sets (is_composer_prompt=true) belong to the SBL/platform
  // tenant, which almost never matches a platform admin's own session tenant
  // — getAuthContext() resolves by host/membership, unrelated to which set
  // ?set= is asking for. When the requested set IS composer-family, this
  // overrides tenantId to the set's own tenant and requires isPlatformAdmin;
  // otherwise it's a no-op and tenantId stays exactly what it was.
  const user = await getCurrentUser()
  const tenantResult = await resolveTenantForPromptSet(requestedSet ?? null, authCtx, user?.isPlatformAdmin === true)
  if (!tenantResult.ok) {
    return <BlocksFallback message={tenantResult.error} />
  }
  const tenantId = tenantResult.tenantId

  const supabase = getAdminClient()

  // Prompt sets (the real prompt_sets table) feed the picker; the active set
  // scopes the blocks query via its id. blocks.prompt_set_id is a UUID FK →
  // prompt_sets.id, so the filter matches against the set's own id. Falls back
  // to all non-deleted blocks when there are no sets.
  const sets = await getPromptSets(tenantId)
  const activeSet = resolveActiveSet(sets, requestedSet ?? null)

  // No prompt_sets rows for this tenant at all → activeSet is null and the
  // Blocks query below falls back to the default slot (prompt_set_id IS
  // NULL). getPromptSets' view join can't help here (there's no prompt_sets
  // row to join from), so read the default slot's compiled_prompts row
  // directly — same compile/publish version source, just for the one slot
  // with no set backing it.
  let defaultSlotCompiled: { version: number; updated_at: string } | null = null
  if (!activeSet) {
    const { data } = await supabase
      .from('compiled_prompts')
      .select('version, updated_at')
      .eq('tenant_id', tenantId)
      .is('prompt_set_id', null)
      .maybeSingle()
    defaultSlotCompiled = data ?? null
  }

  let blocksQuery = supabase
    .from('blocks')
    .select(
      'id, title, type, body, status, is_default, order, prompt_set_id, created_at, updated_at, topics(name), author:users!blocks_updated_by_fkey(name)',
    )
    .eq('tenant_id', tenantId)
    .neq('status', 'deleted')
  if (activeSet) {
    blocksQuery = blocksQuery.eq('prompt_set_id', activeSet.id)
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
        align={{ base: 'stretch', sm: 'center' }}
        gap="md"
        px={{ base: 16, sm: 24 }}
        py={{ base: 12, sm: 16 }}
        style={HEADER_FRAME_STYLE}
      >
        {sets.length > 0 && activeSet && (
          <PromptSetSelect sets={sets} activeId={activeSet.id} />
        )}
      </Flex>

      <Box style={SCROLL_AREA_STYLE} px={{ base: 'md', sm: 'lg' }} pb={{ base: 'md', sm: 'lg' }} pt={0}>
        <BlocksTable
          rows={rows}
          sets={sets}
          topics={topics}
          activeSetId={activeSet?.id ?? null}
          activeSetLabel={activeSet?.label ?? null}
          overview={{
            version: activeSet?.version ?? null,
            status: activeSet?.status ?? null,
            lastCompiledAt: activeSet?.lastCompiledAt ?? defaultSlotCompiled?.updated_at ?? null,
            compiledVersion: activeSet?.compiledVersion ?? defaultSlotCompiled?.version ?? null,
          }}
        />
      </Box>
    </Stack>
  )
}
