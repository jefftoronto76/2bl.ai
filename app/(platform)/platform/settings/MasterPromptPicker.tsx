'use client'

// MasterPromptPicker — the cross-tenant prompt-set selector on Platform Settings.
// Presentational only: options, the pending selection, the live masterId, and
// onSelect are all driven by page.tsx (which owns the fetch + Save). Rebuilt in
// Mantine (per CLAUDE.md: admin/platform surfaces are Mantine v7, not CSS modules)
// as a searchable Select — the list spans every tenant, so search matters.

import { Badge, Box, Group, Paper, Select, Text } from '@mantine/core'
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
                  Composer Prompt
                </Badge>
              )}
            </Group>
          </Group>
        )
      }}
    />
  )
}

// CurrentSystemPromptPill — the "currently live" System Prompt summary, shown above the
// picker. A subtle bordered pill on one line: green dot · bold set name · tenant · status
// badge · "Set by … · date" (the trailing meta renders only when the API supplies
// setByName/setAt — the GET route doesn't populate them yet, so it degrades cleanly).
interface CurrentSystemPromptPillProps {
  set: MasterPromptOption | null
  setByName?: string | null
  setAt?: number | null
}

export function CurrentSystemPromptPill({ set, setByName, setAt }: CurrentSystemPromptPillProps) {
  if (!set) {
    return (
      <Text size="sm" c="dimmed">
        No Composer Prompt set yet
      </Text>
    )
  }

  const isLive = set.status.toLowerCase() === 'live'
  const setByLabel = setByName
    ? `Set by ${setByName}${setAt ? ` · ${new Date(setAt).toLocaleDateString()}` : ''}`
    : null

  return (
    <Paper withBorder radius="xl" px="sm" py={6} w="fit-content" style={{ maxWidth: '100%' }}>
      <Group gap="xs" wrap="nowrap" align="center" style={{ minWidth: 0 }}>
        <Box
          aria-hidden
          w={8}
          h={8}
          style={{ flexShrink: 0, borderRadius: '50%', backgroundColor: 'var(--mantine-color-green-6)' }}
        />
        <Text size="sm" fw={600} truncate>
          {set.label}
        </Text>
        <Text size="sm" c="dimmed" truncate>
          {set.tenantName}
        </Text>
        <Badge size="sm" radius="sm" variant="light" color={isLive ? 'green' : 'yellow'} style={{ flexShrink: 0 }}>
          {statusLabel(set.status)}
        </Badge>
        {setByLabel && (
          <Text size="xs" c="dimmed" truncate>
            {setByLabel}
          </Text>
        )}
      </Group>
    </Paper>
  )
}
