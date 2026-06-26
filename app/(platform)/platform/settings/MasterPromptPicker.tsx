'use client'

// MasterPromptPicker — the cross-tenant prompt-set selector on Platform Settings.
// Presentational only: options, the pending selection, the live masterId, and
// onSelect are all driven by page.tsx (which owns the fetch + Save). Rebuilt in
// Mantine (per CLAUDE.md: admin/platform surfaces are Mantine v7, not CSS modules)
// as a searchable Select — the list spans every tenant, so search matters.

import { Badge, Group, Select, Text } from '@mantine/core'
import { type MasterPromptOption, statusLabel } from './types'

interface MasterPromptPickerProps {
  options: MasterPromptOption[]
  /** The pending selection (defaults to the current master on load). */
  selectedId: string | null
  /** The set currently live as master — gets the "Master" badge in the list. */
  masterId: string | null
  onSelect: (id: string) => void
  disabled?: boolean
}

export function MasterPromptPicker({ options, selectedId, masterId, onSelect, disabled }: MasterPromptPickerProps) {
  const byId = new Map(options.map((o) => [o.id, o]))

  // Search matches on label OR tenant name (the dropdown spans every tenant).
  const data = options.map((o) => ({ value: o.id, label: `${o.label} — ${o.tenantName}` }))

  return (
    <Select
      label="System prompt set"
      placeholder="Select a prompt set…"
      data={data}
      value={selectedId}
      onChange={(value) => {
        if (value) onSelect(value)
      }}
      searchable
      nothingFoundMessage="No matching prompt sets"
      disabled={disabled}
      maxDropdownHeight={320}
      comboboxProps={{ withinPortal: true }}
      renderOption={({ option }) => {
        const o = byId.get(option.value)
        if (!o) return <Text size="sm">{option.label}</Text>
        const isLive = o.status.toLowerCase() === 'live'
        return (
          <Group justify="space-between" wrap="nowrap" w="100%" gap="sm">
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {o.label}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                · {o.tenantName}
              </Text>
            </Group>
            <Group gap={6} wrap="nowrap">
              {o.version != null && (
                <Text size="xs" c="dimmed" ff="monospace">
                  v{o.version}
                </Text>
              )}
              <Badge size="sm" radius="sm" variant="light" color={isLive ? 'green' : 'yellow'}>
                {statusLabel(o.status)}
              </Badge>
              {o.id === masterId && (
                <Badge size="sm" radius="sm" variant="filled" color="green">
                  System Prompt
                </Badge>
              )}
            </Group>
          </Group>
        )
      }}
    />
  )
}
