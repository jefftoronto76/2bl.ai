// services/prompt/release-note.ts
//
// Shared types + pure helpers for the Compile & Publish release note (July
// 2026). Deliberately NOT 'server-only' — no DB/SDK calls — so the same
// module is importable from both the 'use client' CompilePublishModal and
// the /api/admin/prompt/compile route. That's the point: SUMMARY_MAX and
// parseNote() are the single source of truth for the 72-char cap, so the
// client's live counter and the server's validation can never drift apart.

import { TYPE_LABELS, type BlockType } from './block-types'

// 72 is a design choice (docs/Prompt Publish Update July 2026/DIFF.md OQ-7),
// not a column-width constraint found elsewhere in the repo.
export const SUMMARY_MAX = 72

/** Minimum a block needs for the stage-3 change list. */
export interface ChangedBlock {
  id: string
  title: string
  type: BlockType
  updated_at: string | null
}

export interface ReleaseNote {
  /** One-line imperative summary. Required. Max SUMMARY_MAX chars. */
  summary: string
  /** Optional longer "why". */
  why: string
  /** Ids of the blocks the note covers — persisted with the compile for the history view. */
  changed_block_ids: string[]
}

/** Blocks edited since the set was last compiled. Empty array = a no-op republish. */
export function changedSince(blocks: ChangedBlock[], lastCompiledAt: string | null): ChangedBlock[] {
  if (!lastCompiledAt) return blocks
  return blocks.filter((b) => !!b.updated_at && b.updated_at > lastCompiledAt)
}

/**
 * Pre-fill for the summary field: "Update identity, guardrail and knowledge".
 * Derived from the distinct type labels (TYPE_LABELS, block-types.ts — the
 * same canonical labels the rest of Prompt Studio uses) of the changed
 * blocks, so the common case is one keystroke (Tab) away from publishable.
 * The author can overwrite it freely.
 */
export function suggestSummary(changed: ChangedBlock[]): string {
  if (!changed.length) return ''
  const types = [...new Set(changed.map((b) => (TYPE_LABELS[b.type] ?? b.type).toLowerCase()))]
  const head =
    types.length > 1 ? `${types.slice(0, -1).join(', ')} and ${types[types.length - 1]}` : types[0]
  return `Update ${head}`
}

/**
 * Server-side parse + validation of the release note in a compile POST body.
 * Mirrors the client's constraints exactly (OQ-7): summary required, trimmed,
 * non-empty, ≤ SUMMARY_MAX chars. Returns null when the note is missing or
 * invalid — the route turns that into a 400.
 */
export function parseNote(body: unknown): ReleaseNote | null {
  if (typeof body !== 'object' || body === null) return null
  const raw = body as Record<string, unknown>

  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : ''
  if (!summary || summary.length > SUMMARY_MAX) return null

  const why = typeof raw.why === 'string' ? raw.why.trim() : ''

  const changedBlockIds = Array.isArray(raw.changed_block_ids)
    ? raw.changed_block_ids.filter((id): id is string => typeof id === 'string')
    : []

  return { summary, why, changed_block_ids: changedBlockIds }
}
