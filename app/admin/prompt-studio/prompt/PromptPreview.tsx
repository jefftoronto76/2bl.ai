'use client'

import { Stack, Textarea, Group, Alert, ActionIcon, Tooltip } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import { PromptFullnessMeter } from '@/components/admin/primitives/PromptFullnessMeter'

export interface PromptPreviewProps {
  initialContent: string
  initialVersion: number | null
  initialUpdatedAt: string | null
  initialBodies: string[]
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function PromptPreview({
  initialContent,
  initialVersion,
  initialUpdatedAt,
  initialBodies,
}: PromptPreviewProps) {
  const clipboard = useClipboard({ timeout: 2000 })

  return (
    <Stack gap="md">
      <Alert color="gray" variant="light" radius="sm">
        <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
          This is your active prompt. To make changes, edit blocks in the Composer.
        </Text>
      </Alert>

      <PromptFullnessMeter bodies={initialBodies} />

      <Group justify="space-between" wrap="nowrap">
        <Group gap="md" wrap="wrap">
          <Text
            variant="muted"
            style={{
              fontFamily: 'var(--mantine-font-family-monospace)',
              fontSize: 'var(--mantine-font-size-xs)',
            }}
          >
            Version: {initialVersion ?? '—'}
          </Text>
          <Text
            variant="muted"
            style={{
              fontFamily: 'var(--mantine-font-family-monospace)',
              fontSize: 'var(--mantine-font-size-xs)',
            }}
          >
            Last updated: {formatTimestamp(initialUpdatedAt)}
          </Text>
        </Group>

        <Tooltip label={clipboard.copied ? 'Copied!' : 'Copy prompt'} withArrow position="left">
          <ActionIcon
            variant="subtle"
            color={clipboard.copied ? 'teal' : 'gray'}
            size="md"
            aria-label="Copy prompt to clipboard"
            onClick={() => clipboard.copy(initialContent)}
          >
            {clipboard.copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          </ActionIcon>
        </Tooltip>
      </Group>

      <Textarea
        value={initialContent}
        readOnly
        autosize
        minRows={8}
        maxRows={40}
        placeholder="No prompt published yet."
        styles={{
          input: {
            fontFamily: 'var(--mantine-font-family-monospace)',
            fontSize: 'var(--mantine-font-size-sm)',
            lineHeight: 1.6,
          },
        }}
      />
    </Stack>
  )
}
