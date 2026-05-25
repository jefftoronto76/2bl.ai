import { getAdminClient } from '@/services/auth/supabase-admin'
import { DEFAULT_SYSTEM_PROMPT } from '@/services/prompt/sage-prompt'
import { PromptEditor } from '@/components/admin/PromptEditor'

export const dynamic = 'force-dynamic'

export default async function PromptPage() {
  const supabase = getAdminClient()

  const [{ data: current }, { data: history }] = await Promise.all([
    supabase
      .from('master_prompt')
      .select('content, version')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('master_prompt_history')
      .select('id, version, content, saved_at')
      .order('version', { ascending: false })
      .limit(20),
  ])

  const initialPrompt = current?.content ?? DEFAULT_SYSTEM_PROMPT
  const initialVersion = current?.version ?? 0

  return (
    <PromptEditor
      initialPrompt={initialPrompt}
      initialVersion={initialVersion}
      initialHistory={history ?? []}
    />
  )
}
