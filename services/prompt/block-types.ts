import type { MantineColor } from '@mantine/core'

export const BLOCK_TYPES = [
  'identity',
  'knowledge',
  'guardrail',
  'process',
  'output_format',
  'escalation',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export const TYPE_COLORS: Record<BlockType, MantineColor> = {
  identity: 'violet',
  knowledge: 'blue',
  guardrail: 'red',
  process: 'orange',
  output_format: 'green',
  escalation: 'yellow',
}

// Plain names per INTEGRATION §4. Consumers that want ordinal or
// uppercase decoration compose it at render time via formatTypeBadgeLabel.
export const TYPE_LABELS: Record<BlockType, string> = {
  identity: 'Identity',
  knowledge: 'Knowledge',
  guardrail: 'Guardrail',
  process: 'Process',
  output_format: 'Output Format',
  escalation: 'Escalation',
}

// Compile sequence — identity runs 1st, escalation 6th. Source of truth
// for ordinal position; matches the /api/admin/prompt/compile ordering.
export const TYPE_COMPILE_ORDER: Record<BlockType, number> = {
  identity: 1,
  knowledge: 2,
  guardrail: 3,
  process: 4,
  output_format: 5,
  escalation: 6,
}

// Stable left-to-right order matching TYPE_COMPILE_ORDER — consumed by the
// segmented meter, token donut, and overview legend so they all agree.
export const ORDERED_TYPES: BlockType[] = [...BLOCK_TYPES].sort(
  (a, b) => TYPE_COMPILE_ORDER[a] - TYPE_COMPILE_ORDER[b],
)

const ORDINAL_SUFFIX: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
  5: '5th',
  6: '6th',
}

// Decorated badge label for contexts that want to surface compile
// position (e.g. the per-row type badge in BlocksTable). Uppercases
// the plain label and appends the ordinal. Filter chips and tooltips
// should use TYPE_LABELS directly.
export function formatTypeBadgeLabel(type: BlockType): string {
  return `${TYPE_LABELS[type].toUpperCase()} (${ORDINAL_SUFFIX[TYPE_COMPILE_ORDER[type]]})`
}
