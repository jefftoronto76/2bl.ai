// services/prompt/compile.ts
//
// Compiled-prompt compilation for the prompt service. Fetches the tenant's active
// blocks, orders them by the fixed compile sequence, joins their bodies, and
// persists the result to compiled_prompts (archiving the prior version to
// compiled_prompts_history). Moved verbatim from the inline
// app/api/admin/prompt/compile route body; the route is now a thin handler.
//
// Publish is the only activation event, and it is unconditional (July 2026):
// every successful compile makes the target prompt_set — and its compiled row —
// the live one for its (tenant_id, prompt_type_id) slot, whether the set was
// previously live or draft. There is no "compile without activating."
//
// Composer-family prompt_sets (is_composer_prompt=true) layer a SECOND,
// independent exclusivity rule on top of the above: at most one may be
// status='live' platform-wide, backed by prompt_sets_single_composer_idx
// (WHERE is_composer_prompt=true AND status='live'). This is not scoped to
// (tenant_id, prompt_type_id) the way the rule above is, so publishing a
// composer set clears any other live composer set as its own step,
// regardless of which type slot either one is in. Composer sets are no
// longer activated through a separate Platform Settings "Save" pointer — see
// System Docs/Known Gaps.md — Compile & Publish here is now the only path.
//
// Atomic publish (July 2026): steps 4-7 below — resolve type/composer flag,
// clear-then-set both tables, archive the outgoing row, write the new one,
// activate the target set — all happen inside a single Postgres function
// (publish_compiled_prompt), called once via supabase.rpc(). The function
// holds pg_advisory_xact_lock on (tenant_id, prompt_type_id) for the whole
// transaction — and a second, fixed-key lock when the target is
// composer-family, since that exclusivity is platform-wide and would
// otherwise slip past the type-scoped lock entirely. See the SQL itself
// (run by Jeff in Studio) for the full body. The old sequential-calls
// implementation this replaced was never truly atomic — it relied on the
// partial unique indexes catching a 23505 collision after the fact; that
// catch is kept below as a backstop, not the primary defense anymore.

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

interface PublishRpcRow {
  out_version: number
  out_updated_at: string
  out_prompt_type_id: string | null
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
 *
 * `expectedVersion` (optimistic concurrency, July 2026) is the compiled
 * version the caller's UI displayed when the Compile & Publish modal opened
 * ("Will publish as vN" → vN-1). Pass null/undefined when the slot has never
 * been compiled (there's nothing to expect) or when the caller doesn't want
 * the guard. If the slot's live version has since moved, the RPC returns a
 * conflict instead of silently overwriting someone else's publish.
 *
 * Activation (July 2026): this call always makes the target prompt_set — and
 * the compiled row it produces — the live one for its (tenant_id,
 * prompt_type_id) slot. Any other row/set currently live for that slot is
 * cleared first, unconditionally; there is no draft-vs-live branch here.
 */
export async function compilePrompt(
  tenantId: string,
  promptSetId: string | null | undefined,
  note: ReleaseNote,
  expectedVersion?: number | null,
): Promise<CompileResult> {
  const supabase = getAdminClient()

  // 0. Resolve the prompt type this publish activates, straight from the
  //    prompt_set row — never trust a client-supplied type. Absent promptSetId
  //    (the legacy no-set default slot) has no prompt_set to read, so its type
  //    is always null. Fails fast with 404 rather than spending time compiling
  //    blocks into a set that doesn't exist. The RPC below re-resolves the
  //    type independently, inside the transaction — this is a cheap early
  //    exit for UX, not the source of truth for the write.
  if (promptSetId) {
    const { data: targetSet, error: targetSetError } = await supabase
      .from('prompt_sets')
      .select('id')
      .eq('id', promptSetId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (targetSetError) {
      console.error('[prompt/compile] target prompt_set lookup failed:', targetSetError.message)
      return { ok: false, status: 500, error: targetSetError.message }
    }
    if (!targetSet) {
      return { ok: false, status: 404, error: 'Prompt set not found' }
    }
  }

  const built = await buildCompiledContent(tenantId, promptSetId)
  if (!built.ok) return built

  const { content, tokenCount } = built

  // 4-7. Clear-then-set (both tables, including the composer-family
  //      exclusivity branch), archive the outgoing row, write the new one,
  //      activate the target set — all inside a single Postgres transaction.
  //      See publish_compiled_prompt (Studio) for the full body.
  const { data, error } = await supabase
    .rpc('publish_compiled_prompt', {
      p_tenant_id: tenantId,
      p_prompt_set_id: promptSetId ?? null,
      p_content: content,
      p_release_summary: note.summary,
      p_release_why: note.why || null,
      p_release_changed_block_ids: note.changed_block_ids,
      p_expected_version: expectedVersion ?? null,
    })
    .single()

  if (error) {
    console.error('[prompt/compile] publish_compiled_prompt failed:', error.code, error.message)
    if (error.code === 'P1001') {
      return { ok: false, status: 404, error: 'Prompt set not found' }
    }
    if (error.code === 'P1002' || error.code === '23505') {
      // P1002 = the optimistic-concurrency guard tripped (the slot moved since
      // the caller's UI last read it). 23505 = the partial-unique-index
      // backstop — kept as a defense for anything that writes to these tables
      // outside this function; true atomicity via the RPC's advisory locks
      // makes this path unreachable in normal operation, not dead code to
      // delete.
      return { ok: false, status: 409, error: 'Another publish for this prompt type just landed — please retry.' }
    }
    return { ok: false, status: 500, error: error.message }
  }

  const row = data as PublishRpcRow
  console.log('[prompt/compile] save complete — version:', row.out_version, 'tokens:', tokenCount)
  return {
    ok: true,
    data: {
      success: true,
      version: row.out_version,
      tokenCount,
      content,
      updatedAt: row.out_updated_at,
    },
  }
}
