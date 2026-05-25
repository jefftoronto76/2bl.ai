// services/prompt/compile.ts
//
// Master-prompt compilation for the prompt service. Fetches the tenant's active
// blocks, orders them by the fixed compile sequence, joins their bodies, and
// persists the result to master_prompt (archiving the prior version to
// master_prompt_history). Moved verbatim from the inline
// app/api/admin/prompt/compile route body; the route is now a thin handler.

import { getAdminClient } from '@/services/auth/supabase-admin'
import { isOrdered } from '@/services/prompt/block-order'
import { tokensFor } from '@/services/prompt/tokenize'

// Fixed compile sequence — mirrors the TYPE_LABELS ordinal order on the
// Blocks page. Within each type bucket: blocks with `order > 0` come
// first ascending by order; blocks with `order` = 0 or null come last,
// ordered by title ascending.
const COMPILE_ORDER = ['guardrail', 'identity', 'process', 'knowledge', 'escalation'] as const
type CompileType = typeof COMPILE_ORDER[number]

interface BlockForCompile {
  id: string
  title: string
  type: string
  body: string
  order: number | null
}

export interface CompileSuccess {
  success: true
  version: number
  tokenCount: number
  content: string
  updatedAt: string
}

export type CompileResult =
  | { ok: true; data: CompileSuccess }
  | { ok: false; status: number; error: string }

/**
 * Compile and persist the master prompt for a tenant. Returns the success
 * payload (version, tokenCount, content, updatedAt) or an error with the HTTP
 * status the route should surface. Behavior is identical to the prior inline
 * route logic.
 */
export async function compilePrompt(tenantId: string): Promise<CompileResult> {
  const supabase = getAdminClient()

  // 1. Fetch every active block for this tenant.
  console.log('[prompt/compile] fetching active blocks for tenant_id:', tenantId)
  const { data: blocks, error: blocksError } = await supabase
    .from('blocks')
    .select('id, title, type, body, order')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')

  if (blocksError) {
    console.error('[prompt/compile] blocks fetch failed:', blocksError.message)
    return { ok: false, status: 500, error: blocksError.message }
  }

  const rows = (blocks as BlockForCompile[] | null) ?? []
  console.log('[prompt/compile] fetched blocks:', rows.length)

  // 2. Group and sort: COMPILE_ORDER across types, order-asc within each type.
  const typeOrderIndex = new Map<string, number>(
    COMPILE_ORDER.map((t, i) => [t, i]),
  )

  const sorted = [...rows]
    .filter(b => typeOrderIndex.has(b.type))
    .sort((a, b) => {
      const typeDelta = (typeOrderIndex.get(a.type) ?? 999) - (typeOrderIndex.get(b.type) ?? 999)
      if (typeDelta !== 0) return typeDelta

      const aOrdered = isOrdered(a.order)
      const bOrdered = isOrdered(b.order)
      // Ordered blocks (order > 0) come before unordered (0 or null).
      if (aOrdered && !bOrdered) return -1
      if (!aOrdered && bOrdered) return 1
      // Both ordered: sort by order ascending.
      if (aOrdered && bOrdered) return (a.order as number) - (b.order as number)
      // Both unordered: sort by title ascending.
      return (a.title ?? '').localeCompare(b.title ?? '')
    })

  console.log(
    '[prompt/compile] compile sequence:',
    sorted.map(b => ({ title: b.title, type: b.type, order: b.order })),
  )

  // Warn about excluded types (blocks with an unknown/legacy type)
  const excludedCount = rows.length - sorted.length
  if (excludedCount > 0) {
    console.warn('[prompt/compile] excluded', excludedCount, 'blocks with unknown type')
  }

  // 3. Compile — join bodies with double newlines.
  const content = sorted.map(b => (b.body ?? '').trim()).filter(Boolean).join('\n\n')
  const tokenCount = tokensFor(content)
  console.log('[prompt/compile] compiled length:', content.length, 'tokens:', tokenCount)

  if (!content) {
    return { ok: false, status: 400, error: 'No active blocks to compile' }
  }

  // 4. Save to master_prompt — find existing row for this tenant, archive to
  //    history, then update. Matches the save route's contract exactly.
  const now = new Date().toISOString()

  const { data: existing } = await supabase
    .from('master_prompt')
    .select('id, version, content')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle()

  let newVersion: number

  if (existing) {
    console.log('[prompt/compile] existing master_prompt version:', existing.version)

    const { error: historyError } = await supabase
      .from('master_prompt_history')
      .insert({
        prompt_id: existing.id,
        tenant_id: tenantId,
        content: existing.content,
        version: existing.version,
      })

    if (historyError) {
      console.error('[prompt/compile] history insert failed:', historyError.message)
    } else {
      console.log('[prompt/compile] archived version', existing.version, 'to history')
    }

    newVersion = existing.version + 1
    const { error: updateError } = await supabase
      .from('master_prompt')
      .update({
        content,
        version: newVersion,
        updated_at: now,
      })
      .eq('id', existing.id)
      .eq('tenant_id', tenantId)

    if (updateError) {
      console.error('[prompt/compile] update failed:', updateError.message)
      return { ok: false, status: 500, error: updateError.message }
    }
    console.log('[prompt/compile] updated to version:', newVersion)
  } else {
    console.log('[prompt/compile] no existing row — inserting version 1')
    newVersion = 1
    const { error: insertError } = await supabase
      .from('master_prompt')
      .insert({
        tenant_id: tenantId,
        content,
        version: newVersion,
        updated_at: now,
      })

    if (insertError) {
      console.error('[prompt/compile] insert failed:', insertError.message)
      return { ok: false, status: 500, error: insertError.message }
    }
  }

  console.log('[prompt/compile] save complete — version:', newVersion, 'tokens:', tokenCount)
  return {
    ok: true,
    data: {
      success: true,
      version: newVersion,
      tokenCount,
      content,
      updatedAt: now,
    },
  }
}
