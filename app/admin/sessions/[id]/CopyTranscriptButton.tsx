'use client'

import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { IconCopy, IconCheck } from '@tabler/icons-react'

export interface CopyTranscriptButtonProps {
  /** Pre-formatted, marker-stripped transcript text to copy. */
  transcript: string
}

// Client-side copy control for the (server-rendered) session transcript. The
// transcript string is formatted server-side (markers already stripped) and
// passed in; this component only owns the clipboard write + the copy→check
// confirmation state. Mirrors the PromptPreview copy button pattern.
export function CopyTranscriptButton({ transcript }: CopyTranscriptButtonProps) {
  const clipboard = useClipboard({ timeout: 2000 })

  return (
    <Group justify="flex-end" mb="md">
      <Tooltip
        label={clipboard.copied ? 'Copied!' : 'Copy transcript'}
        withArrow
        position="left"
      >
        <ActionIcon
          variant="subtle"
          color={clipboard.copied ? 'teal' : 'gray'}
          size="md"
          aria-label="Copy transcript to clipboard"
          onClick={() => clipboard.copy(transcript)}
        >
          {clipboard.copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
