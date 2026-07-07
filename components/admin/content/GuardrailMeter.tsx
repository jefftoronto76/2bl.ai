'use client'

import { Badge, Group } from '@mantine/core'
import { IconAlertTriangle, IconShieldHalf } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'

const GUARDRAIL_LIMIT = 5

type Tone = 'neutral' | 'warning' | 'error'

const GR_META: Record<Tone, { color: string; hint: string | null }> = {
  neutral: { color: 'gray',   hint: null },
  warning: { color: 'yellow', hint: 'At the recommended limit' },
  error:   { color: 'red',    hint: 'Reduce to improve reliability' },
}

function toneFor(n: number): Tone {
  return n > GUARDRAIL_LIMIT ? 'error' : n === GUARDRAIL_LIMIT ? 'warning' : 'neutral'
}

export function GuardrailMeter({ count, showHint = true }: { count: number; showHint?: boolean }) {
  const tone = toneFor(count)
  const { color, hint } = GR_META[tone]

  return (
    <Group gap="xs" align="center" wrap="nowrap">
      <Badge
        variant="light"
        radius="xl"
        size="lg"
        color={color}
        styles={{ root: { textTransform: 'none', fontWeight: 600 } }}
        leftSection={
          tone === 'error'
            ? <IconAlertTriangle size={13} style={{ display: 'block' }} />
            : <IconShieldHalf size={13} style={{ display: 'block' }} />
        }
      >
        Guardrails{' '}
        <span style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontWeight: 500 }}>
          {count} / {GUARDRAIL_LIMIT}
        </span>
      </Badge>
      {showHint && hint && (
        <Text
          variant="muted"
          style={{
            margin: 0,
            fontSize: 'var(--mantine-font-size-xs)',
            ...(tone === 'error' ? { color: 'var(--mantine-color-red-7)' } : {}),
          }}
        >
          {hint}
        </Text>
      )}
    </Group>
  )
}
