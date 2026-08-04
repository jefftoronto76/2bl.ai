'use client'

// MasterPromptPicker — Platform Settings → Composer Prompt. A read-only list
// of composer-family prompt sets (is_composer_prompt = true — page.tsx
// filters), each with an Edit pencil that routes to Blocks.
//
// There is no Select/Save here anymore (July 2026): the old picker flipped
// is_composer_prompt directly as a bare live pointer, with no compile step,
// no release note, and no real audit trail. Compile & Publish on the Blocks
// screen — reached via the pencil below — is now the only way to make a
// composer set live, same as it already is for every ordinary tenant set.
// See System Docs/Known Gaps.md for the retired master-prompt PUT route.
//
// No per-row "Composer Prompt" badge: every row in this list is already
// composer-family by construction, so the status badge (Live/Draft/Retired)
// is the only marker needed — unlike the old cross-tenant, unfiltered list,
// where it distinguished composer sets from ordinary ones.

import { ActionIcon, Badge, Box, Group, Paper, Stack, Text, Tooltip } from '@mantine/core'
import { IconPencil } from '@tabler/icons-react'
import { type MasterPromptOption, statusLabel } from './types'

function RowStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const color = normalized === 'live' ? 'green' : normalized === 'retired' ? 'gray' : 'yellow'
  return (
    <Badge size="sm" radius="sm" variant="light" color={color} style={{ flexShrink: 0 }}>
      {statusLabel(status)}
    </Badge>
  )
}

interface MasterPromptPickerProps {
  /** Composer-family sets only — page.tsx filters. */
  options: MasterPromptOption[]
  /** Route to the Blocks screen for this set, with it selected. */
  onEdit: (option: MasterPromptOption) => void
}

export function MasterPromptPicker({ options, onEdit }: MasterPromptPickerProps) {
  if (options.length === 0) return null

  return (
    <Stack gap="xs">
      {options.map((o) => (
        <Paper key={o.id} withBorder radius="sm" p="sm">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>
              {o.label}
            </Text>
            <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
              {o.version != null && (
                <Text size="xs" c="dimmed" ff="monospace" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                  v{o.version}
                </Text>
              )}
              <RowStatusBadge status={o.status} />
              <Tooltip label="Edit blocks" withArrow position="left" openDelay={400}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={`Edit ${o.label} in Blocks`}
                  style={{ flexShrink: 0 }}
                  onClick={() => onEdit(o)}
                >
                  <IconPencil size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Paper>
      ))}
    </Stack>
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
      <Paper withBorder radius="xl" px="sm" py={6} w="fit-content">
        <Group gap="xs" wrap="nowrap" align="center">
          <Box aria-hidden w={8} h={8} style={{ borderRadius: '50%', backgroundColor: 'var(--mantine-color-gray-5)' }} />
          <Text size="sm" c="dimmed">
            Current Composer Prompt
          </Text>
          <Text size="sm" c="dimmed">
            ·
          </Text>
          <Text size="sm" fw={600}>
            Using system fallback
          </Text>
          <Badge size="sm" radius="sm" variant="light" color="gray">
            Fallback
          </Badge>
        </Group>
      </Paper>
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
