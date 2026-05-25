import type { MantineColor } from '@mantine/core'

export const BLOCK_TYPES = [
  'identity',
  'knowledge',
  'guardrail',
  'process',
  'escalation',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export const TYPE_COLORS: Record<BlockType, MantineColor> = {
  identity: 'violet',
  knowledge: 'blue',
  guardrail: 'red',
  process: 'orange',
  escalation: 'yellow',
}

// Plain names per INTEGRATION §4. Consumers that want ordinal or
// uppercase decoration compose it at render time via formatTypeBadgeLabel.
export const TYPE_LABELS: Record<BlockType, string> = {
  identity: 'Identity',
  knowledge: 'Knowledge',
  guardrail: 'Guardrail',
  process: 'Process',
  escalation: 'Escalation',
}

// Compile sequence — guardrail runs 1st, escalation 5th. Source of truth
// for ordinal position; matches the /api/admin/prompt/compile ordering.
export const TYPE_COMPILE_ORDER: Record<BlockType, number> = {
  guardrail: 1,
  identity: 2,
  process: 3,
  knowledge: 4,
  escalation: 5,
}

const ORDINAL_SUFFIX: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
  5: '5th',
}

// Decorated badge label for contexts that want to surface compile
// position (e.g. the per-row type badge in BlocksTable). Uppercases
// the plain label and appends the ordinal. Filter chips and tooltips
// should use TYPE_LABELS directly.
export function formatTypeBadgeLabel(type: BlockType): string {
  return `${TYPE_LABELS[type].toUpperCase()} (${ORDINAL_SUFFIX[TYPE_COMPILE_ORDER[type]]})`
}
