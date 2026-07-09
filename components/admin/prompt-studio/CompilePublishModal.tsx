'use client'

// CompilePublishModal — pre-publish review gate for the Blocks screen.
//
// Two-stage flow:
//   Stage 1 · Compile  — the wiring POSTs to /api/admin/prompt/compile; this modal opens
//                        in a loading state while the request is in flight.
//   Stage 2 · Review   — the server's compiled XML is shown read-only + scrollable, with a
//                        "published as vN · N tokens · N lines" meta line and four actions:
//                            Copy · Download · Cancel · Publish
//
// compilePrompt() below is a corrected client-side reference implementation (Correction 1:
// removed escalation, added output_format; uses ORDERED_TYPES from block-types.ts as the
// canonical compile-order source). It is NOT called from the wiring — the wiring POSTs to
// the server and renders the returned XML so the reviewer sees the real output (Correction 2).

import { useEffect, useState } from 'react'
import { Badge, Button, Group, Loader, Modal, Stack, ThemeIcon } from '@mantine/core'
import { Text } from '@mantine/core'
import { IconCheck, IconClipboard, IconDownload, IconFileText, IconRocket } from '@tabler/icons-react'
import { ORDERED_TYPES } from '@/services/prompt/block-types'
import type { BlockType } from '@/services/prompt/block-types'
import { notify } from '@/components/admin/lib/primitives'
import { tokensFor } from '@/components/admin/lib/types'

// ── Section headings ──────────────────────────────────────────────────────────────────────
// Correction 1 applied: removed `escalation`, added `output_format`.
// Order matches ORDERED_TYPES from services/prompt/block-types.ts (the canonical source).
const SECTION_HEADING: Record<BlockType, string> = {
  identity: 'Identity',
  knowledge: 'Knowledge',
  guardrail: 'Guardrail',
  process: 'Process',
  output_format: 'Output Format',
}

interface CompileBlock {
  type: BlockType
  body: string
  order?: number | null
}

// Client-side reference compile — produces markdown headings.
// Correction 1: loop uses ORDERED_TYPES from block-types.ts so order never drifts.
// Correction 2: NOT called from the wiring; the wiring uses the server response (XML).
export function compilePrompt(activeBlocks: CompileBlock[]): string {
  const parts: string[] = []
  for (const type of ORDERED_TYPES) {
    const group = activeBlocks
      .filter((b) => b.type === type)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    if (!group.length) continue
    parts.push(`# ${SECTION_HEADING[type]}`)
    parts.push(group.map((b) => (b.body ?? '').trim()).join('\n\n'))
  }
  return parts.join('\n\n')
}

// ── Modal ─────────────────────────────────────────────────────────────────────────────────

interface ModalSet {
  id: string
  label: string
}

interface CompilePublishModalProps {
  opened: boolean
  onClose: () => void
  /** true while the server compile request is in flight — shows the loading state. */
  compiling: boolean
  /** compiled prompt returned by the server (empty while compiling). */
  text: string
  set: ModalSet
  /** version number from the server compile response. */
  version: number
  /** called when the reviewer clicks Publish (compile already saved on server). */
  onPublish: () => void
}

export function CompilePublishModal({
  opened,
  onClose,
  compiling,
  text,
  set,
  version,
  onPublish,
}: CompilePublishModalProps) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!opened) setCopied(false)
  }, [opened])

  const tokens = tokensFor(text)
  const lines = text ? text.split('\n').length : 0
  const slug = set.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const filename = `${slug}-v${version}.txt`

  const copy = () => {
    navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify({ color: 'green', title: 'Downloaded', message: filename })
  }

  const title = (
    <Group gap="sm" align="center" wrap="nowrap">
      <ThemeIcon variant="light" color="brand" size={34} radius="md">
        <IconFileText size={18} />
      </ThemeIcon>
      <div>
        <Text fw={600} size="sm" style={{ lineHeight: 1.2 }}>
          Review compiled prompt
        </Text>
        <Text c="dimmed" size="xs">
          {set.label}
        </Text>
      </div>
    </Group>
  )

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="xl"
      radius="md"
      title={title}
      overlayProps={{ backgroundOpacity: 0.55, blur: 2 }}
      styles={{ title: { width: '100%' }, body: { paddingTop: 4 } }}
    >
      {compiling ? (
        <Stack align="center" justify="center" gap="md" py={64}>
          <Loader color="brand" />
          <Text c="dimmed" size="sm">
            Compiling active blocks into the master prompt…
          </Text>
        </Stack>
      ) : (
        <Stack gap="md">
          <Group gap="md" wrap="wrap">
            <Badge
              variant="light"
              color="brand"
              radius="sm"
              size="lg"
              styles={{ root: { textTransform: 'none', fontWeight: 600 } }}
            >
              Ready to publish
            </Badge>
            <Text c="dimmed" size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
              {tokens.toLocaleString()} tokens · {lines} lines
            </Text>
          </Group>

          <div
            style={{
              border: '1px solid var(--mantine-color-gray-3)',
              borderRadius: 'var(--mantine-radius-md)',
              background: 'var(--mantine-color-gray-0)',
              overflow: 'hidden',
            }}
          >
            <div style={{ maxHeight: '46vh', overflow: 'auto', padding: '16px 18px' }}>
              {/* Raw <pre> per CLAUDE.md — <Text component="pre"> fails typecheck */}
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'var(--mantine-font-family-monospace)',
                  fontSize: 12.5,
                  lineHeight: 1.7,
                  color: 'var(--mantine-color-text)',
                }}
              >
                {text}
              </pre>
            </div>
          </div>

          <Group justify="space-between" wrap="wrap" gap="sm">
            <Group gap="xs">
              <Button
                variant="default"
                leftSection={copied ? <IconCheck size={16} /> : <IconClipboard size={16} />}
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="default"
                leftSection={<IconDownload size={16} />}
                onClick={download}
              >
                Download
              </Button>
            </Group>
            <Group gap="xs">
              <Button variant="subtle" color="gray" onClick={onClose}>
                Cancel
              </Button>
              <Button leftSection={<IconRocket size={16} />} onClick={onPublish}>
                Publish
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
