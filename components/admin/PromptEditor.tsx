'use client'

// PromptEditor — read-only view of the legacy /admin/prompt "System Prompt"
// screen.
//
// July 2026: the Save action (and the POST /api/admin/prompt/save call it
// triggered) was removed. This screen predates the Blocks/Compile & Publish
// flow, duplicated what that flow now does properly, and had none of its
// gates — no release note, no scoping by prompt_set_id (services/prompt/
// save.ts's `.limit(1)` grabbed an arbitrary compiled_prompts row per
// tenant). Publishing a prompt now happens exclusively through the Blocks
// screen's Compile & Publish modal. This page is left mounted (still linked
// from nav) purely so the current content + version history remain visible;
// full removal or repurposing is a separate, later decision.

import { useState } from 'react'
import { Stack, Textarea, Group, ActionIcon, Tooltip, Button, Text as MantineText } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import { PromptFullnessMeter } from '@/components/admin/primitives/PromptFullnessMeter'

export type HistoryEntry = {
  id: string
  version: number
  content: string
  saved_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export function PromptEditor({
  initialPrompt,
  initialVersion,
  initialHistory,
}: {
  initialPrompt: string
  initialVersion: number
  initialHistory: HistoryEntry[]
}) {
  // Local state only backs "View" swapping the displayed content to a past
  // version for reading — nothing here persists anywhere anymore.
  const [prompt, setPrompt] = useState(initialPrompt)
  const clipboard = useClipboard({ timeout: 2000 })

  return (
    <Stack gap="md">
      <PromptFullnessMeter bodies={[prompt]} />

      <Group justify="space-between" wrap="nowrap">
        <Text
          variant="muted"
          style={{
            fontFamily: 'var(--mantine-font-family-monospace)',
            fontSize: 'var(--mantine-font-size-xs)',
          }}
        >
          Version: {initialVersion > 0 ? `v${initialVersion}` : '—'}
        </Text>

        <Tooltip label={clipboard.copied ? 'Copied!' : 'Copy prompt'} withArrow position="left">
          <ActionIcon
            variant="subtle"
            color={clipboard.copied ? 'teal' : 'gray'}
            size="md"
            aria-label="Copy prompt to clipboard"
            onClick={() => clipboard.copy(prompt)}
          >
            {clipboard.copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          </ActionIcon>
        </Tooltip>
      </Group>

      <Textarea
        value={prompt}
        readOnly
        autosize
        minRows={8}
        maxRows={40}
        styles={{
          input: {
            fontFamily: 'var(--mantine-font-family-monospace)',
            fontSize: 'var(--mantine-font-size-sm)',
            lineHeight: 1.6,
          },
        }}
      />

      {initialHistory.length > 0 && (
        <Stack gap="xs" mt="xl">
          <MantineText
            size="xs"
            c="dimmed"
            style={{
              fontFamily: 'var(--mantine-font-family-monospace)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Version History
          </MantineText>
          {initialHistory.map((entry) => (
            <Group key={entry.id} justify="space-between" wrap="nowrap">
              <Group gap="xl" wrap="nowrap">
                <MantineText
                  size="xs"
                  c="dimmed"
                  style={{ fontFamily: 'var(--mantine-font-family-monospace)', minWidth: '32px' }}
                >
                  v{entry.version}
                </MantineText>
                <MantineText
                  size="xs"
                  c="dimmed"
                  style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
                >
                  {formatDate(entry.saved_at)}
                </MantineText>
              </Group>
              {/* Swaps the read-only textarea's content for inspection — there is no write path left to restore into. */}
              <Button variant="subtle" size="xs" onClick={() => setPrompt(entry.content)}>
                View
              </Button>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
