'use client'

// CompilePublishModal — pre-publish review gate for the Blocks screen.
//
// THREE-stage flow (stage 3 added July 2026 — "release note"):
//   Stage 1 · Compile  — the wiring POSTs to /api/admin/prompt/compile; this modal opens
//                        in a loading state while the request is in flight.
//   Stage 2 · Review   — the server's compiled output is shown read-only + scrollable, with a
//                        "will publish as vN · N tokens · N lines" meta line and four actions:
//                            Copy · Download · Cancel · Publish →
//   Stage 3 · Describe — a short release note before the publish actually fires. Same modal,
//                        no second dialog. Auto-derives the "what changed" list from blocks
//                        edited since the set's last_compiled_at; the human only writes WHY.
//                        Actions: Back · Publish vN.  ⌘↵ publishes.
//
// Stage 3 exists because a compiled prompt going live is a deploy with no paper trail. Same
// principles as a good PR: a one-line imperative summary (required), a body (optional), and a
// machine-generated change list the author never has to type.
//
// compilePrompt() below is a corrected client-side reference implementation (Correction 1:
// removed escalation, added output_format; uses ORDERED_TYPES from block-types.ts as the
// canonical compile-order source). It is NOT called from the wiring — the wiring POSTs to
// the server and renders the returned XML so the reviewer sees the real output (Correction 2).

import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Group, Loader, Modal, Paper, Stack, Textarea, TextInput, ThemeIcon } from '@mantine/core'
import { Text } from '@mantine/core'
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClipboard,
  IconDownload,
  IconFileText,
  IconRocket,
} from '@tabler/icons-react'
import { ORDERED_TYPES, TYPE_COLORS } from '@/services/prompt/block-types'
import type { BlockType } from '@/services/prompt/block-types'
import { notify } from '@/components/admin/lib/primitives'
import { tokensFor } from '@/components/admin/lib/types'
import {
  SUMMARY_MAX,
  changedSince,
  suggestSummary,
  type ChangedBlock,
  type ReleaseNote,
} from '@/services/prompt/release-note'

export type { ChangedBlock, ReleaseNote }

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
  /**
   * The version this publish will create — activeSet's current compiled
   * version + 1. Shown in BOTH stages, and computed before the compile POST
   * (it used to be the version returned by the response). Source: the
   * prompt_sets_with_compile_meta view's compiled_version, NOT
   * prompt_sets.version — see PublishButton.tsx / promptSets.ts.
   */
  version: number
  /** Active blocks in the set — stage 3 derives its change list from these. */
  blocks?: ChangedBlock[]
  /**
   * The set's current compiled_prompts.updated_at — the cut-off for "changed
   * since". null when this slot has never been compiled, in which case
   * changedSince() lists every block passed in (correctly — all of them are
   * new) and stage 3 labels it as a first publish rather than "changed since v0".
   */
  lastCompiledAt?: string | null
  /** Fired from stage 3 with the note. The wiring POSTs the compile WITH this payload. */
  onPublish: (note: ReleaseNote) => void
}

export function CompilePublishModal({
  opened,
  onClose,
  compiling,
  text,
  set,
  version,
  blocks = [],
  lastCompiledAt = null,
  onPublish,
}: CompilePublishModalProps) {
  const [copied, setCopied] = useState(false)
  const [stage, setStage] = useState<'review' | 'note'>('review')
  const [summary, setSummary] = useState('')
  const [why, setWhy] = useState('')

  const changed = useMemo(() => changedSince(blocks, lastCompiledAt), [blocks, lastCompiledAt])

  // Every open starts clean — a stale summary from a previous publish must never
  // ride along with a new one.
  useEffect(() => {
    if (!opened) {
      setCopied(false)
      setStage('review')
      setSummary('')
      setWhy('')
    }
  }, [opened])

  // Seed the suggestion the first time stage 3 is reached; never clobber typed input
  // when the reviewer goes Back and forward again.
  useEffect(() => {
    if (stage === 'note') setSummary((s) => (s ? s : suggestSummary(changed)))
  }, [stage, changed])

  const note = stage === 'note'
  const tokens = tokensFor(text)
  const lines = text ? text.split('\n').length : 0
  const slug = set.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const filename = `${slug}-v${version}.txt`
  const canPublish = summary.trim().length > 0

  const submit = () => {
    if (!canPublish) return
    onPublish({ summary: summary.trim(), why: why.trim(), changed_block_ids: changed.map((b) => b.id) })
  }

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
        {note ? <IconRocket size={18} /> : <IconFileText size={18} />}
      </ThemeIcon>
      <div>
        <Text fw={600} size="sm" style={{ lineHeight: 1.2 }}>
          {note ? 'Describe this release' : 'Review compiled prompt'}
        </Text>
        <Text c="dimmed" size="xs">
          {set.label}
          {note ? ` · publishing v${version}` : ''}
        </Text>
      </div>
    </Group>
  )

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size={note ? 'lg' : 'xl'}
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
      ) : note ? (
        // ── Stage 3 · Describe ──────────────────────────────────────────────────────
        <Stack
          gap="md"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        >
          <Paper withBorder radius="md" p="sm" bg="var(--mantine-color-gray-0)">
            <Stack gap={8}>
              <Group justify="space-between" gap="sm" wrap="wrap">
                <Group gap={6} align="baseline">
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: '.04em' }}>
                    {lastCompiledAt ? 'Changed since' : 'First publish'}
                  </Text>
                  {lastCompiledAt && (
                    <Text
                      size="xs"
                      fw={600}
                      c="dimmed"
                      style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
                    >
                      v{version - 1}
                    </Text>
                  )}
                </Group>
                <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
                  {tokens.toLocaleString()} tokens
                </Text>
              </Group>
              {changed.length ? (
                <Group gap={6} wrap="wrap">
                  {changed.map((b) => (
                    <Badge
                      key={b.id}
                      variant="light"
                      radius="sm"
                      color={TYPE_COLORS[b.type]}
                      styles={{ root: { textTransform: 'none', fontWeight: 500 } }}
                    >
                      {b.title}
                    </Badge>
                  ))}
                </Group>
              ) : (
                <Text size="sm" c="dimmed">
                  No block edits since the last compile — this republishes the same content.
                </Text>
              )}
            </Stack>
          </Paper>

          <TextInput
            label="Summary"
            required
            autoFocus
            maxLength={SUMMARY_MAX}
            value={summary}
            onChange={(e) => setSummary(e.currentTarget.value)}
            placeholder="Tighten escalation so billing disputes hand off sooner"
            description="One line, in the imperative — what this release does."
            rightSection={
              <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
                {SUMMARY_MAX - summary.length}
              </Text>
            }
          />

          <Textarea
            label="Why this change"
            value={why}
            onChange={(e) => setWhy(e.currentTarget.value)}
            autosize
            minRows={3}
            maxRows={6}
            placeholder="What prompted it, and anything to watch for after it goes live."
            description="Optional — context for whoever reads the version history later."
          />

          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text size="xs" c="dimmed">
              ⌘↵ to publish
            </Text>
            <Group gap="xs">
              <Button
                variant="subtle"
                color="gray"
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => setStage('review')}
              >
                Back
              </Button>
              <Button leftSection={<IconRocket size={16} />} onClick={submit} disabled={!canPublish}>
                Publish v{version}
              </Button>
            </Group>
          </Group>
        </Stack>
      ) : (
        // ── Stage 2 · Review ────────────────────────────────────────────────────────
        <Stack gap="md">
          <Group gap="md" wrap="wrap">
            <Badge
              variant="light"
              color="brand"
              radius="sm"
              size="lg"
              styles={{ root: { textTransform: 'none', fontWeight: 600 } }}
            >
              Will publish as{' '}
              <span style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontWeight: 500 }}>
                v{version}
              </span>
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
              {/* Advances to stage 3 — the compile POST does not fire until the note is submitted. */}
              <Button rightSection={<IconArrowRight size={16} />} onClick={() => setStage('note')}>
                Publish
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
