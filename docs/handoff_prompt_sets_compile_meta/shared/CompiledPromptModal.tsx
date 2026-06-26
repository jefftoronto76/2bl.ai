'use client'

// CompiledPromptModal — NEW. The "view compiled prompt" viewer used by BOTH the
// tenant Settings → Prompt Sets card and the Platform Settings → Tenant Prompts
// card. It fetches the authoritative compiled output for one set (it does NOT
// reassemble blocks client-side) and shows it read-only with a copy button + a
// stale alert. Mirrors the existing PromptPreview.tsx idiom (mono Textarea,
// Version + Last updated meta, clipboard ActionIcon).
//
// `compiledUrl` is the GET endpoint for this set's compiled prompt:
//   • tenant surface   → /api/admin/prompt-sets/{id}/compiled
//   • platform surface → /api/platform/prompt-sets/{id}/compiled
// Both return { content, version, updated_at } (see shared/promptSet.ts → CompiledPrompt).

import { useEffect, useState } from 'react'
import { ActionIcon, Alert, Group, Modal, Skeleton, Stack, Textarea, Tooltip } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { IconAlertTriangle, IconCheck, IconCopy } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import { type CompiledPrompt, type PromptSet, formatDate, isStale } from '@/lib/promptSet'

interface CompiledPromptModalProps {
  set: Pick<PromptSet, 'id' | 'label' | 'version' | 'updated_at' | 'last_compiled_at'>
  compiledUrl: string
  opened: boolean
  onClose: () => void
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

export function CompiledPromptModal({ set, compiledUrl, opened, onClose }: CompiledPromptModalProps) {
  const clipboard = useClipboard({ timeout: 2000 })
  const [loading, setLoading] = useState(true)
  const [compiled, setCompiled] = useState<CompiledPrompt | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!opened) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setCompiled(null)
    ;(async () => {
      try {
        const res = await fetch(compiledUrl)
        if (cancelled) return
        if (!res.ok) {
          setError('Could not load the compiled prompt.')
          return
        }
        setCompiled(await res.json())
      } catch (err) {
        if (!cancelled) {
          console.error('[CompiledPromptModal] fetch failed:', err)
          setError('Could not reach the server.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [opened, compiledUrl])

  const stale = isStale(set)
  const content = compiled?.content ?? ''

  return (
    <Modal opened={opened} onClose={onClose} title="Compiled prompt" centered size="lg">
      <Stack gap="md">
        <Group gap="md" wrap="wrap">
          <Text variant="label" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
            {set.label}
          </Text>
          <Text
            variant="muted"
            style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)' }}
          >
            compiled v{compiled?.version ?? set.version} · {formatTimestamp(compiled?.updated_at ?? set.last_compiled_at)}
          </Text>
        </Group>

        {stale && (
          <Alert color="yellow" variant="light" radius="sm" icon={<IconAlertTriangle size={16} />}>
            <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
              This set was edited on {formatDate(set.updated_at)}, after it was last compiled. Recompile to apply the
              latest blocks.
            </Text>
          </Alert>
        )}

        {loading ? (
          <Skeleton height={280} radius="sm" />
        ) : error ? (
          <Alert color="red" variant="light" radius="sm">
            {error}
          </Alert>
        ) : (
          <>
            <Group justify="flex-end">
              <Tooltip label={clipboard.copied ? 'Copied!' : 'Copy prompt'} withArrow position="left">
                <ActionIcon
                  variant="subtle"
                  color={clipboard.copied ? 'teal' : 'gray'}
                  size="md"
                  aria-label="Copy compiled prompt to clipboard"
                  onClick={() => clipboard.copy(content)}
                >
                  {clipboard.copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            </Group>
            <Textarea
              value={content}
              readOnly
              autosize
              minRows={10}
              maxRows={32}
              placeholder="This set has not been compiled yet."
              styles={{
                input: {
                  fontFamily: 'var(--mantine-font-family-monospace)',
                  fontSize: 'var(--mantine-font-size-sm)',
                  lineHeight: 1.6,
                },
              }}
            />
          </>
        )}
      </Stack>
    </Modal>
  )
}
