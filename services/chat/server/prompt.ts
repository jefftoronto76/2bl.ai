// services/chat/server/prompt.ts
//
// System-prompt assembly for the chat service. Server-only — reads
// master_prompt via the service-role client. The booking section
// (services/chat/server/booking.ts) and final composition live in the
// orchestrator (index.ts); this module owns the base prompt + question-mode
// context.

import { getAdminClient } from '@/services/auth/supabase-admin'

// DEFAULT_SYSTEM_PROMPT stays defined in src/lib/sage-prompt.ts for now
// (referenced there per CLAUDE.md's discovery-call note and the legacy admin
// prompt page); the chat service re-exports it as its canonical fallback.
// Physical consolidation happens in the cleanup commit, once the route no
// longer imports it directly.
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/sage-prompt'
export { DEFAULT_SYSTEM_PROMPT }

// Appended to the master system prompt when the visitor arrives in question
// mode (?mode=question). The master prompt is never modified — this is
// additive context only.
export const QUESTION_MODE_CONTEXT =
  'CONTEXT: This visitor arrived with a specific question in mind. Skip the name-ask and discovery phase. Answer their question directly and concisely. Do not ask for their name unless the conversation develops into a longer exchange. If the answer reveals a deeper need or a topic better handled in a paid session — coaching or a working session — pivot naturally to suggesting one, but only after actually answering their question first. All other guardrails and Do Not Engage rules still apply.'

/**
 * Resolve the base system prompt for a tenant: the highest-version
 * master_prompt row, or DEFAULT_SYSTEM_PROMPT when there is no tenant, no row,
 * or any error. Behavior is identical to the prior inline route logic.
 */
export async function getSystemPrompt(tenantId: string | null): Promise<string> {
  if (!tenantId) {
    console.log('[chat/prompt] no tenant_id — using DEFAULT_SYSTEM_PROMPT')
    return DEFAULT_SYSTEM_PROMPT
  }
  try {
    const { data, error } = await getAdminClient()
      .from('master_prompt')
      .select('content')
      .eq('tenant_id', tenantId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[chat/prompt] master_prompt query failed:', error.message)
      return DEFAULT_SYSTEM_PROMPT
    }

    if (!data?.content) {
      console.log(
        '[chat/prompt] no master_prompt row for tenant_id:',
        tenantId,
        '— falling back to DEFAULT_SYSTEM_PROMPT',
      )
      return DEFAULT_SYSTEM_PROMPT
    }

    console.log('[chat/prompt] using master_prompt for tenant_id:', tenantId)
    return data.content
  } catch (err) {
    console.error(
      '[chat/prompt] master_prompt query threw:',
      err instanceof Error ? err.message : err,
    )
    return DEFAULT_SYSTEM_PROMPT
  }
}
