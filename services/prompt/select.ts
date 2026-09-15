// services/prompt/select.ts
//
// Slot-aware compiled-prompt read for the Traffic Cop: "the live compiled
// prompt for tenant T in slot K", where K is a prompt_types.key. This is the
// read Phase 4 of the design (Design Handovers/traffic_cop_design_2026-09-05.md
// §5.4) swaps in for getSystemPrompt's "highest-version live row regardless
// of type"; it lands early because the account-status rule needs a
// non-default slot ('blocked') before the base-prompt provider does.
//
// Resolution is two reads: prompt_types by key → ids, then compiled_prompts
// filtered to those ids. Two, because prompt_types.key has no DB-level
// uniqueness (System Docs/Database Schema.md, confirmed 2026-09-15) — an
// `.in()` on every matching id is correct where an `.eq()` on one would
// silently pick an arbitrary duplicate.
//
// Server-only. Fail-open: any miss or error returns null and the caller
// decides what "no prompt in this slot" means for it.

import { getAdminClient } from '@/services/auth/supabase-admin'

export interface CompiledPromptForSlot {
  content: string
  compiledPromptId: string
  version: number | null
  promptTypeId: string
  slotKey: string
}

export async function selectCompiledPrompt(
  tenantId: string | null,
  slotKey: string,
): Promise<CompiledPromptForSlot | null> {
  if (!tenantId || !slotKey) return null
  try {
    const supabase = getAdminClient()

    const { data: types, error: typesError } = await supabase
      .from('prompt_types')
      .select('id')
      .eq('key', slotKey)
    if (typesError) {
      console.error('[prompt/select] prompt_types query failed:', typesError.message)
      return null
    }
    const typeIds = ((types ?? []) as { id: string }[]).map(t => t.id)
    if (typeIds.length === 0) return null

    const { data, error } = await supabase
      .from('compiled_prompts')
      .select('id, version, content, prompt_type_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'live')
      .in('prompt_type_id', typeIds)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('[prompt/select] compiled_prompts query failed:', error.message)
      return null
    }
    const row = data as { id: string; version: number | null; content: string | null; prompt_type_id: string } | null
    if (!row?.content) return null

    return {
      content: row.content,
      compiledPromptId: row.id,
      version: typeof row.version === 'number' ? row.version : null,
      promptTypeId: row.prompt_type_id,
      slotKey,
    }
  } catch (err) {
    console.error('[prompt/select] selectCompiledPrompt threw:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Compile & Publish wraps every block in its type tag —
 * `<identity>\n…\n</identity>` (services/prompt/compile.ts). That is right
 * for a system prompt and wrong for text a person reads directly, which is
 * what a "blocked" slot's content is. This strips exactly those wrapper
 * lines and nothing else: the block text itself is untouched, and any tag
 * the author wrote inside a block body stays (they are not on their own
 * line as a bare compile-order type).
 */
const COMPILE_SECTION_TYPES = ['identity', 'knowledge', 'guardrail', 'process', 'output_format']
const SECTION_TAG_LINE = new RegExp(`^\\s*</?(?:${COMPILE_SECTION_TYPES.join('|')})>\\s*$`)

export function compiledContentToPlainText(content: string): string {
  return content
    .split('\n')
    .filter(line => !SECTION_TAG_LINE.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
