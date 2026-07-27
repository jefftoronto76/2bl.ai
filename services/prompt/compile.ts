// services/prompt/compile.ts
//
// Compiled-prompt compilation for the prompt service. Fetches the tenant's active
// blocks, orders them by the fixed compile sequence, joins their bodies, and
// persists the result to compiled_prompts (archiving the prior version to
// compiled_prompts_history). Moved verbatim from the inline
// app/api/admin/prompt/compile route body; the route is now a thin handler.

import { getAdminClient } from '@/services/auth/supabase-admin'
import { isOrdered } from '@/services/prompt/block-order'
import { tokensFor } from '@/services/prompt/tokenize'
import type { ReleaseNote } from '@/services/prompt/release-note'

// Fixed compile sequence. Within each type bucket: blocks with `order > 0`
// come first ascending by order; blocks with `order` = 0 or null come last,
// ordered by title ascending.
// Section order: identity → knowledge → guardrail → process → output_format.
const COMPILE_ORDER = ['identity', 'knowledge', 'guardrail', 'process', 'output_format'] as const
type CompileType = typeof COMPILE_ORDER[number]

interface BlockForCompile {
  id: string
  title: string
  type: string
  body: string
  order: number | null
  prompt_set_id: string | null
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

export type BuildContentResult =
  | { ok: true; content: string; tokenCount: number }
  | { ok: false; status: number; error: string }

/**
 * Pure compile step — fetches active blocks, sorts them, and assembles the XML
 * content. Performs no DB writes. Used by the preview endpoint and internally
 * by compilePrompt before the persist step.
 */
export async function buildCompiledContent(
  tenantId: string,
  promptSetId?: string | null,
): Promise<BuildContentResult> {
  const supabase = getAdminClient()

  // 1. Fetch active runtime/platform blocks for this tenant. Excludes
  //    scope='composer' blocks (Prompt Studio action pills). When promptSetId
  //    is provided, includes blocks with that key plus shared blocks (null key);
  //    when absent, includes only shared blocks (the default slot).
  const typeKeyLabel = promptSetId ?? 'null (default)'
  console.log('[prompt/compile] fetching active blocks for tenant_id:', tenantId, 'promptSetId:', typeKeyLabel)
  let blocksQuery = supabase
    .from('blocks')
    .select('id, title, type, body, order, prompt_set_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .in('scope', ['runtime', 'platform'])

  if (promptSetId) {
    blocksQuery = blocksQuery.or(`prompt_set_id.is.null,prompt_set_id.eq.${promptSetId}`)
  } else {
    blocksQuery = blocksQuery.is('prompt_set_id', null)
  }

  const { data: blocks, error: blocksError } = await blocksQuery

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

  // 3. Compile — wrap each block in its type tag, join with double newlines.
  const content = sorted
    .map(b => {
      const body = (b.body ?? '').trim()
      if (!body) return ''
      return `<${b.type}>\n${body}\n</${b.type}>`
    })
    .filter(Boolean)
    .join('\n\n')
  const tokenCount = tokensFor(content)
  console.log('[prompt/compile] compiled length:', content.length, 'tokens:', tokenCount)

  if (!content) {
    return { ok: false, status: 400, error: 'No active blocks to compile' }
  }

  return { ok: true, content, tokenCount }
}

/**
 * Compile and persist the master prompt for a tenant. Returns the success
 * payload (version, tokenCount, content, updatedAt) or an error with the HTTP
 * status the route should surface.
 *
 * When `promptSetId` is absent or null, compiles the default slot (blocks
 * where prompt_set_id IS NULL) and writes prompt_set_id = NULL on the saved
 * compiled_prompts row. When provided, includes blocks matching that key plus
 * shared blocks (prompt_set_id IS NULL) and writes the key on the
 * compiled_prompts row.
 *
 * `note` (release-note July 2026) is required and is written onto the row
 * this call creates/overwrites. Because the pre-overwrite row is archived to
 * compiled_prompts_history below, the note attached to THIS call rides into
 * history automatically the next time this slot is compiled — it is never
 * lost, just deferred one publish.
 */
export async function compilePrompt(
  tenantId: string,
  promptSetId: string | null | undefined,
  note: ReleaseNote,
): Promise<CompileResult> {
  const built = await buildCompiledContent(tenantId, promptSetId)
  if (!built.ok) return built

  const { content, tokenCount } = built
  const supabase = getAdminClient()

  // 4. Save to compiled_prompts — find existing row for this tenant+slot, archive
  //    to history, then update. promptSetId (or null) scopes the slot.
  const now = new Date().toISOString()

  let existingQuery = supabase
    .from('compiled_prompts')
    .select('id, version, content, release_summary, release_why, release_changed_block_ids')
    .eq('tenant_id', tenantId)
    .limit(1)

  if (promptSetId) {
    existingQuery = existingQuery.eq('prompt_set_id', promptSetId)
  } else {
    existingQuery = existingQuery.is('prompt_set_id', null)
  }

  const { data: existing } = await existingQuery.maybeSingle()

  let newVersion: number

  if (existing) {
    console.log('[prompt/compile] existing compiled_prompts version:', existing.version)

    // Archive the OUTGOING version's content + note — not the new one being
    // written below. The note submitted with THIS publish describes the new
    // version and rides into history on the NEXT compile of this slot.
    const { error: historyError } = await supabase
      .from('compiled_prompts_history')
      .insert({
        prompt_id: existing.id,
        tenant_id: tenantId,
        content: existing.content,
        version: existing.version,
        release_summary: existing.release_summary ?? null,
        release_why: existing.release_why ?? null,
        release_changed_block_ids: existing.release_changed_block_ids ?? [],
      })

    if (historyError) {
      console.error('[prompt/compile] history insert failed:', historyError.message)
    } else {
      console.log('[prompt/compile] archived version', existing.version, 'to history')
    }

    newVersion = existing.version + 1
    const { error: updateError } = await supabase
      .from('compiled_prompts')
      .update({
        content,
        version: newVersion,
        updated_at: now,
        release_summary: note.summary,
        release_why: note.why || null,
        release_changed_block_ids: note.changed_block_ids,
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
      .from('compiled_prompts')
      .insert({
        tenant_id: tenantId,
        content,
        version: newVersion,
        updated_at: now,
        prompt_set_id: promptSetId ?? null,
        release_summary: note.summary,
        release_why: note.why || null,
        release_changed_block_ids: note.changed_block_ids,
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
