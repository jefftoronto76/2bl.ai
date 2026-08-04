// services/prompt/compiler.ts
//
// Runtime system-prompt assembly for the prompt service. Server-only — reads
// the highest-version compiled_prompts row via the service-role client, falling
// back to DEFAULT_SYSTEM_PROMPT. Moved here verbatim from
// services/chat/server/prompt.ts (which now re-exports from this module so the
// chat orchestrator keeps importing it unchanged).

import { getAdminClient } from '@/services/auth/supabase-admin'

// DEFAULT_SYSTEM_PROMPT stays defined in src/lib/sage-prompt.ts for now
// (referenced there per System Docs/Public Site.md's discovery-call note and the legacy admin
// prompt page); the prompt service re-exports it as its canonical fallback.
// Physical consolidation happens in a later cleanup commit, once nothing
// imports it directly from src/lib.
import { DEFAULT_SYSTEM_PROMPT } from '@/services/prompt/sage-prompt'
export { DEFAULT_SYSTEM_PROMPT }

// Appended to the master system prompt when the visitor arrives in question
// mode (?mode=question). The master prompt is never modified — this is
// additive context only.
export const QUESTION_MODE_CONTEXT =
  'CONTEXT: This visitor arrived with a specific question in mind. Skip the name-ask and discovery phase. Answer their question directly and concisely. Do not ask for their name unless the conversation develops into a longer exchange. If the answer reveals a deeper need or a topic better handled in a paid session — coaching or a working session — pivot naturally to suggesting one, but only after actually answering their question first. All other guardrails and Do Not Engage rules still apply.'

/**
 * Resolve the base system prompt for a tenant: the highest-version
 * compiled_prompts row, or DEFAULT_SYSTEM_PROMPT on any miss.
 */
export async function getSystemPrompt(tenantId: string | null): Promise<string> {
  if (!tenantId) {
    console.log('[chat/prompt] no tenant_id — using DEFAULT_SYSTEM_PROMPT')
    return DEFAULT_SYSTEM_PROMPT
  }
  try {
    const { data, error } = await getAdminClient()
      .from('compiled_prompts')
      .select('content')
      .eq('tenant_id', tenantId)
      .eq('status', 'live')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[chat/prompt] compiled_prompts query failed:', error.message)
      return DEFAULT_SYSTEM_PROMPT
    }

    if (!data?.content) {
      console.log(
        '[chat/prompt] no compiled_prompts row for tenant_id:',
        tenantId,
        '— falling back to DEFAULT_SYSTEM_PROMPT',
      )
      return DEFAULT_SYSTEM_PROMPT
    }

    console.log('[chat/prompt] using compiled_prompts for tenant_id:', tenantId)
    return data.content
  } catch (err) {
    console.error(
      '[chat/prompt] compiled_prompts query threw:',
      err instanceof Error ? err.message : err,
    )
    return DEFAULT_SYSTEM_PROMPT
  }
}
