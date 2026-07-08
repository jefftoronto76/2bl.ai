'use client'

// CompilePublishModal — NEW. Turns the Blocks screen's "Compile & Publish" button into a
// TWO-STAGE operation:
//
//   Stage 1 · Compile   — clicking "Compile & Publish" assembles the selected set's ACTIVE
//                         blocks into the raw master prompt (grouped by compile order) and
//                         opens this modal in a brief loading state.
//   Stage 2 · Review     — the compiled prompt is shown read-only + scrollable, with a
//                         "will publish as vN · tokens · lines" meta line and four actions:
//                             Copy · Download · Cancel · Publish
//                         Nothing is published until the user explicitly clicks Publish.
//
// This is DISTINCT from the existing read-only `CompiledPromptModal.tsx` (which views the
// *already-published* compiled output for a set). This modal is the PRE-publish gate: the
// text shown is compiled on the client from the current active blocks and is not yet live.
//
// The compile here is a client-side preview so reviewers see exactly what will ship. If your
// compile pipeline is authoritative server-side, POST to it on open and render its response
// instead of `compilePrompt()` — the modal's props are unchanged (pass the returned text as
// `text` and set `compiling` from the request's pending state).

import { useEffect, useState } from 'react'
import { Badge, Button, Group, Loader, Modal, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconCheck, IconClipboard, IconDownload, IconFileText, IconRocket } from '@tabler/icons-react'
import { ORDERED_BLOCK_TYPES } from '@/components/admin/lib/badges'
import { notify } from '@/components/admin/lib/primitives'
import { tokensFor, type Block, type BlockType, type ComposerPromptSet } from '@/components/admin/lib/types'

// ── Compile — assemble active blocks into the raw prompt ──────────────────────────────────
// Mirrors the compile pipeline: sections in BLOCK_TYPE_COMPILE_ORDER
// (guardrail → identity → process → knowledge → escalation), blocks ordered within a type,
// plain markdown "# Heading" per non-empty section. Matches MASTER_PROMPT_CONTENT's shape.
const SECTION_HEADING: Record<BlockType, string> = {
  guardrail: 'Guardrails',
  identity: 'Identity',
  process: 'Process',
  knowledge: 'Knowledge',
  escalation: 'Escalation',
}

export function compilePrompt(activeBlocks: Block[]): string {
  const parts: string[] = []
  for (const type of ORDERED_BLOCK_TYPES) {
    const group = activeBlocks
      .filter((b) => b.type === type)
      .sort((a, b) => (a.order || 99) - (b.order || 99))
    if (!group.length) continue
    parts.push(`# ${SECTION_HEADING[type]}`)
    parts.push(group.map((b) => (b.body || '').trim()).join('\n\n'))
  }
  return parts.join('\n\n')
}

interface CompilePublishModalProps {
  opened: boolean
  onClose: () => void
  /** true while the compile is running — shows the loading state. */
  compiling: boolean
  /** the compiled prompt to review (empty while compiling). */
  text: string
  set: Pick<ComposerPromptSet, 'value' | 'label'>
  /** version this compile will publish as (e.g. MASTER_PROMPT_VERSION + 1). */
  version: number
  /** called when the reviewer confirms Publish. */
  onPublish: () => void
}

export function CompilePublishModal({ opened, onClose, compiling, text, set, version, onPublish }: CompilePublishModalProps) {
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (!opened) setCopied(false) }, [opened])

  const tokens = tokensFor(text)
  const lines = text ? text.split('\n').length : 0
  const filename = `${set.value}-v${version}.txt`

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
      <ThemeIcon variant="light" color="brand" size={34} radius="md"><IconFileText size={18} /></ThemeIcon>
      <div>
        <Text fw={600} size="sm" style={{ lineHeight: 1.2 }}>Review compiled prompt</Text>
        <Text c="dimmed" size="xs">{set.label}</Text>
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
          <Text c="dimmed" size="sm">Compiling active blocks into the master prompt…</Text>
        </Stack>
      ) : (
        <Stack gap="md">
          <Group gap="md" wrap="wrap">
            <Badge variant="light" color="brand" radius="sm" size="lg" styles={{ root: { textTransform: 'none', fontWeight: 600 } }}>
              Will publish as{' '}
              <span style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontWeight: 500 }}>v{version}</span>
            </Badge>
            <Text c="dimmed" size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
              {tokens.toLocaleString()} tokens · {lines} lines
            </Text>
          </Group>

          <div style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)', background: 'var(--mantine-color-gray-0)', overflow: 'hidden' }}>
            <div style={{ maxHeight: '46vh', overflow: 'auto', padding: '16px 18px' }}>
              <Text component="pre" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12.5, lineHeight: 1.7, color: 'var(--mantine-color-text)' }}>
                {text}
              </Text>
            </div>
          </div>

          <Group justify="space-between" wrap="wrap" gap="sm">
            <Group gap="xs">
              <Button variant="default" leftSection={copied ? <IconCheck size={16} /> : <IconClipboard size={16} />} onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="default" leftSection={<IconDownload size={16} />} onClick={download}>Download</Button>
            </Group>
            <Group gap="xs">
              <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
              <Button leftSection={<IconRocket size={16} />} onClick={onPublish}>Publish</Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
