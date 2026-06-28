import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth'
import { DEFAULT_SYSTEM_PROMPT } from '@/services/prompt/sage-prompt'
import { Text } from '@/components/admin/primitives/Text'
import { PromptEditor } from '@/components/admin/PromptEditor'

export const dynamic = 'force-dynamic'

export default async function PromptPage() {
  let initialPrompt = DEFAULT_SYSTEM_PROMPT
  let initialVersion = 0
  let initialHistory: { id: string; version: number; content: string; saved_at: string }[] = []

  try {
    const authCtx = await getAuthContext()
    const supabase = getAdminClient()

    const [{ data: current }, { data: history }] = await Promise.all([
      supabase
        .from('compiled_prompts')
        .select('content, version')
        .eq('tenant_id', authCtx.tenant_id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('compiled_prompts_history')
        .select('id, version, content, saved_at')
        .eq('tenant_id', authCtx.tenant_id)
        .order('version', { ascending: false })
        .limit(20),
    ])

    if (current) {
      initialPrompt = current.content ?? DEFAULT_SYSTEM_PROMPT
      initialVersion = current.version ?? 0
    }
    initialHistory = history ?? []
  } catch (err) {
    console.error('[prompt] auth failed:', err instanceof Error ? err.message : err)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <Text variant="title">Prompt</Text>
      </div>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <PromptEditor
          initialPrompt={initialPrompt}
          initialVersion={initialVersion}
          initialHistory={initialHistory}
        />
      </div>
    </div>
  )
}
