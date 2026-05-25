import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'
import { Text } from '@/components/admin/primitives/Text'
import { PromptPreview } from './PromptPreview'

export const dynamic = 'force-dynamic'

export default async function PromptStudioPromptPage() {
  let initialContent = ''
  let initialVersion: number | null = null
  let initialUpdatedAt: string | null = null
  let initialBodies: string[] = []

  try {
    const authCtx = await getAuthContext()
    const supabase = getAdminClient()

    const [promptRes, blocksRes] = await Promise.all([
      supabase
        .from('master_prompt')
        .select('content, version, updated_at')
        .eq('tenant_id', authCtx.tenant_id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('blocks')
        .select('body')
        .eq('tenant_id', authCtx.tenant_id)
        .eq('status', 'active'),
    ])

    if (promptRes.error) {
      console.error('[prompt] master_prompt fetch error:', promptRes.error.message)
    } else if (promptRes.data) {
      initialContent = promptRes.data.content ?? ''
      initialVersion = promptRes.data.version ?? null
      initialUpdatedAt = promptRes.data.updated_at ?? null
    }

    if (blocksRes.error) {
      console.error('[prompt] blocks fetch error:', blocksRes.error.message)
    } else {
      initialBodies = (blocksRes.data ?? []).map(b => b.body ?? '')
    }
  } catch (err) {
    console.error('[prompt] auth failed:', err instanceof Error ? err.message : err)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <Text variant="title">Prompt</Text>
      </div>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <PromptPreview
          initialContent={initialContent}
          initialVersion={initialVersion}
          initialUpdatedAt={initialUpdatedAt}
          initialBodies={initialBodies}
        />
      </div>
    </div>
  )
}
