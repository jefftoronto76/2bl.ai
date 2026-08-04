'use client'

// DraftCard — the in-thread block confirmation card. Lifted verbatim from the
// current app/admin/prompt-builder/page.tsx with NO behaviour change; extracted to
// its own file so page.tsx isn't dominated by it. All actions are driven by the
// page (it owns save/check/topic logic). See handover §5 — do not regress any of
// this: inline edit, per-card type/topic/name, safety-check issues + Remove
// offending, Save Anyway, default-block checkbox (platform admins), save errors.

import {
  Card, Stack, Group, Text, Textarea, TextInput, Select, Checkbox, Alert,
  ActionIcon, Button as MantineButton,
} from '@mantine/core'
import { IconPencil } from '@tabler/icons-react'
import { Button } from '@/components/admin/primitives/Button'
import { TYPES, type BlockType, type DraftBlock, type DraftCardMeta } from './types'

interface DraftCardProps {
  draft: DraftBlock
  meta: DraftCardMeta
  index: number
  count: number
  isPlatformAdmin: boolean
  // editing
  isEditing: boolean
  editingBody: string
  onEditingBodyChange: (v: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  // meta + actions
  onMetaChange: (updates: Partial<DraftCardMeta>) => void
  onCheckAndSave: () => void
  onSaveAnyway: () => void
  onRemove: () => void
  onRemoveOffending: (offendingText: string) => void
}

export function DraftCard({
  draft, meta, index, count, isPlatformAdmin,
  isEditing, editingBody, onEditingBodyChange, onStartEdit, onSaveEdit, onCancelEdit,
  onMetaChange, onCheckAndSave, onSaveAnyway, onRemove, onRemoveOffending,
}: DraftCardProps) {
  const hasIssues = meta.issues.length > 0
  const busy = meta.isChecking || meta.isSaving

  return (
    <Card variant="outlined">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Block ready{count > 1 ? ` (${index + 1} of ${count})` : ''}
          </Text>
          {!isEditing && (
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={onStartEdit} aria-label="Edit block content">
              <IconPencil size={14} />
            </ActionIcon>
          )}
        </Group>

        {isEditing ? (
          <Stack gap="xs">
            <Textarea
              value={editingBody}
              onChange={e => onEditingBodyChange(e.currentTarget.value)}
              autosize minRows={4} maxRows={16} size="sm"
              styles={{ input: { fontSize: 'var(--mantine-font-size-sm)', lineHeight: 1.6 } }}
            />
            <Group gap="xs">
              <Button variant="primary" size="sm" onClick={onSaveEdit}>Save</Button>
              <Button variant="ghost" size="sm" onClick={onCancelEdit}>Cancel</Button>
            </Group>
          </Stack>
        ) : (
          <Text variant="muted" style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--mantine-font-size-sm)', lineHeight: 1.6 }}>
            {draft.content}
          </Text>
        )}

        {meta.warning && (
          <Alert color="yellow" variant="light" radius="sm" p="sm">
            <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)', color: 'var(--mantine-color-yellow-9)' }}>
              {meta.warning}
            </Text>
          </Alert>
        )}

        {hasIssues && (
          <Alert color="yellow" variant="light" radius="sm" title="Safety check flagged this block">
            <Stack gap="xs">
              {meta.issues.map((issue, i) => (
                <Stack key={i} gap={4}>
                  <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{issue.description}</Text>
                  {issue.offendingText && (
                    <Stack gap={4}>
                      <Text variant="muted" style={{
                        fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)',
                        backgroundColor: 'var(--mantine-color-yellow-0)', padding: '2px 6px',
                        borderRadius: 'var(--mantine-radius-sm)', wordBreak: 'break-word',
                      }}>
                        {issue.offendingText}
                      </Text>
                      <MantineButton variant="subtle" color="yellow" size="xs" disabled={busy}
                        onClick={() => onRemoveOffending(issue.offendingText!)} style={{ alignSelf: 'flex-start' }}>
                        Remove
                      </MantineButton>
                    </Stack>
                  )}
                </Stack>
              ))}
            </Stack>
          </Alert>
        )}

        <Group grow align="flex-start" wrap="nowrap" style={{ gap: 'var(--mantine-spacing-sm)' }}>
          <TextInput label="Block name" value={meta.blockName} size="sm" placeholder="e.g. Curious Mindset"
            onChange={e => onMetaChange({ blockName: e.currentTarget.value })} />
          <Select label="Type" placeholder="Select a type..." data={TYPES} value={meta.type || null} size="sm" allowDeselect={false}
            onChange={v => onMetaChange({ type: (v ?? '') as BlockType | '' })} />
          <TextInput label="Topic" value={meta.topicName} size="sm" placeholder="e.g. About, Services..."
            onChange={e => onMetaChange({ topicName: e.currentTarget.value })} />
        </Group>

        {isPlatformAdmin && (
          <Checkbox label="Mark as default block" checked={meta.isDefault} size="sm"
            onChange={e => onMetaChange({ isDefault: e.currentTarget.checked })} />
        )}

        {meta.saveError && (
          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)', color: 'var(--mantine-color-red-6)' }}>
            {meta.saveError}
          </Text>
        )}

        <Group gap="xs">
          <Button variant="primary" size="sm" onClick={onCheckAndSave} disabled={busy}>
            {meta.isChecking ? 'Checking...' : meta.isSaving ? 'Saving...' : 'Check & Save'}
          </Button>
          {hasIssues && (
            <MantineButton variant="default" color="yellow" size="sm" loading={meta.isSaving}
              disabled={meta.isChecking} onClick={onSaveAnyway}>
              Save Anyway
            </MantineButton>
          )}
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>Discard</Button>
        </Group>
      </Stack>
    </Card>
  )
}
