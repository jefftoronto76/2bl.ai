'use client'

import { useState } from 'react'
import { ActionIcon, Button, Group, NumberInput, Select, Stack, Textarea, TextInput, Tooltip } from '@mantine/core'
import { IconCheck, IconClipboard } from '@tabler/icons-react'
import { SafetyCheckAlert } from './SafetyCheckAlert'
import {
  useBlockEditForm,
  type BlockEditFormBlock,
} from './useBlockEditForm'
import {
  BLOCK_TYPES,
  TYPE_COMPILE_ORDER,
  TYPE_LABELS,
  type BlockType,
} from '@/services/prompt/block-types'

export type { BlockEditFormBlock }

export interface Topic {
  id: string
  name: string
  type: string
}

export interface NewBlockDraft {
  body: string
  title: string | null
  type: BlockType | null
  topic_id: string | null
}

export interface EditBlockDraft {
  body: string
  order: number | null
}

type EditModeProps = {
  mode?: 'edit'
  block: BlockEditFormBlock
  topics?: undefined
  onSave: (draft: EditBlockDraft) => Promise<void>
  onSaveAnyway: (draft: EditBlockDraft) => Promise<void>
  onCancel: () => void
  onRename?: (newTitle: string) => void
}

type NewModeProps = {
  mode: 'new'
  block?: undefined
  topics: Topic[]
  onSave: (draft: NewBlockDraft) => Promise<void>
  onSaveAnyway: (draft: NewBlockDraft) => Promise<void>
  onCancel: () => void
}

export type BlockEditFormProps = EditModeProps | NewModeProps

// Type Select options — sorted by compile order so the dropdown matches
// the order convention used elsewhere in the admin (badges, meter).
const TYPE_SELECT_DATA = [...BLOCK_TYPES]
  .sort((a, b) => TYPE_COMPILE_ORDER[a] - TYPE_COMPILE_ORDER[b])
  .map(t => ({ value: t, label: TYPE_LABELS[t] }))

// Mantine NumberInput onChange yields `string | number`. Empty / dash /
// non-integer mid-edit states all map to null ("unordered"); valid
// integers pass through. Mirrors the parser the inline NumberInput
// used pre-Step-12 in BlockRow / BlockCard.
function parseOrderInput(value: string | number): number | null {
  if (value === '' || value === '-') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  return n
}

interface FieldErrors {
  title?: string
  type?: string
  topic_id?: string
  body?: string
}

/**
 * Block edit/create form. Two modes via a discriminated union prop:
 *
 * - mode='edit' (default): existing-row editing. Renders only the body
 *   Textarea; metadata stays as-is on the row. Save callback signature
 *   is { body: string }. Backward-compatible with all Phase 1 / PR 1
 *   callers — `mode` may be omitted entirely.
 *
 * - mode='new': new-block creation. Renders title/type/topic selects
 *   above the body Textarea. All four fields required client-side
 *   before the safety check runs. Save callback signature widens to
 *   NewBlockDraft.
 *
 * The hook (useBlockEditForm) only owns body + safety-check + saving
 * state. New-mode metadata (title/type/topic_id) lives as local state
 * here, and is bridged into the hook's narrower onSave callbacks so
 * the safety-check flow is shared between modes.
 *
 * Cancel is handled directly (no hook state) — same as before.
 */
export function BlockEditForm(props: BlockEditFormProps) {
  const isNew = props.mode === 'new'

  // 'new' mode local state — unused in edit mode but always declared
  // for hook order stability.
  const [title, setTitle] = useState('')
  const [type, setType] = useState<BlockType | ''>('')
  const [topicId, setTopicId] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  // Edit-mode title rename — seeded from block.title, committed on blur/Enter.
  const [drawerTitle, setDrawerTitle] = useState(
    !isNew ? (props as EditModeProps).block.title : '',
  )

  // Clipboard copy state for edit mode.
  const [copied, setCopied] = useState(false)

  async function handleCopyBody() {
    if (isNew) return
    try {
      await navigator.clipboard.writeText((props as EditModeProps).block.body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error('[BlockEditForm] clipboard write failed')
    }
  }

  function commitTitleRename() {
    if (isNew) return
    const trimmed = drawerTitle.trim()
    if (!trimmed || trimmed === (props as EditModeProps).block.title) return
    ;(props as EditModeProps).onRename?.(trimmed)
  }

  // 'edit' mode local state for the Order field — seeded from the
  // existing block's order. Empty string is the "unordered" / cleared
  // state, mirroring the value Mantine NumberInput emits when blank.
  const [order, setOrder] = useState<string | number>(
    props.mode !== 'new' ? props.block.order ?? '' : '',
  )

  // Bridge the parent's wider mode-specific callbacks through the
  // hook's narrower body-only signature.
  // - 'new' mode adds title/type/topic_id from local state.
  // - 'edit' mode adds the parsed order value (single atomic PATCH —
  //   body and order save together; see Step 12 of PR 2).
  const hookCallbacks = isNew
    ? {
        onSave: async ({ body }: { body: string }) => {
          await (props as NewModeProps).onSave({
            body,
            title: title.trim() || null,
            type: type || null,
            topic_id: topicId || null,
          })
        },
        onSaveAnyway: async ({ body }: { body: string }) => {
          await (props as NewModeProps).onSaveAnyway({
            body,
            title: title.trim() || null,
            type: type || null,
            topic_id: topicId || null,
          })
        },
      }
    : {
        onSave: async ({ body }: { body: string }) => {
          await (props as EditModeProps).onSave({
            body,
            order: parseOrderInput(order),
          })
        },
        onSaveAnyway: async ({ body }: { body: string }) => {
          await (props as EditModeProps).onSaveAnyway({
            body,
            order: parseOrderInput(order),
          })
        },
      }

  const hookBlock = isNew ? null : (props as EditModeProps).block

  const {
    draft,
    setDraft,
    issues,
    checking,
    saving,
    onSave: hookOnSave,
    onSaveAnyway: hookOnSaveAnyway,
    onRemoveOffending,
  } = useBlockEditForm(hookBlock, hookCallbacks)

  const busy = checking || saving
  const hasIssues = issues.length > 0

  function validateNewMode(): boolean {
    if (!isNew) return true
    // Body is the only required field. Title / Type / Topic are optional —
    // omitted ones are sent as null and stored null on the block.
    const errors: FieldErrors = {}
    if (!draft.trim()) errors.body = 'Body is required'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit() {
    if (!validateNewMode()) return
    await hookOnSave()
  }

  async function handleSubmitAnyway() {
    if (!validateNewMode()) return
    await hookOnSaveAnyway()
  }

  function handleCancel() {
    console.log('[BlockEditForm] cancel', {
      mode: isNew ? 'new' : 'edit',
      blockId: hookBlock?.id ?? 'new',
    })
    props.onCancel()
  }

  // Field setters that clear their own error on edit (responsive feedback).
  function handleTitleChange(value: string) {
    setTitle(value)
    if (fieldErrors.title) setFieldErrors({ ...fieldErrors, title: undefined })
  }
  function handleTypeChange(value: string | null) {
    setType((value ?? '') as BlockType | '')
    if (fieldErrors.type) setFieldErrors({ ...fieldErrors, type: undefined })
  }
  function handleTopicChange(value: string | null) {
    setTopicId(value ?? '')
    if (fieldErrors.topic_id) setFieldErrors({ ...fieldErrors, topic_id: undefined })
  }
  function handleBodyChange(value: string) {
    setDraft(value)
    if (fieldErrors.body) setFieldErrors({ ...fieldErrors, body: undefined })
  }

  const submitLabel = isNew ? 'Create block' : 'Check & Save'
  const savingLabel = isNew ? 'Creating...' : 'Saving...'

  return (
    <Stack gap="sm">
      {isNew && (
        <>
          <TextInput
            label="Title (optional)"
            placeholder="A short, descriptive title"
            value={title}
            onChange={e => handleTitleChange(e.currentTarget.value)}
            error={fieldErrors.title}
            disabled={busy}
          />
          <Select
            label="Type (optional)"
            placeholder="Select a type"
            data={TYPE_SELECT_DATA}
            value={type || null}
            onChange={handleTypeChange}
            error={fieldErrors.type}
            disabled={busy}
            clearable
          />
          <Select
            label="Topic (optional)"
            placeholder="Select a topic"
            data={(props as NewModeProps).topics.map(t => ({
              value: t.id,
              label: t.name,
            }))}
            value={topicId || null}
            onChange={handleTopicChange}
            error={fieldErrors.topic_id}
            disabled={busy}
            searchable
            clearable
          />
        </>
      )}
      {!isNew && (
        <TextInput
          label="Title"
          value={drawerTitle}
          onChange={e => setDrawerTitle(e.currentTarget.value)}
          onBlur={commitTitleRename}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitTitleRename() }
            if (e.key === 'Escape') {
              setDrawerTitle((props as EditModeProps).block.title)
            }
          }}
          size="sm"
          disabled={busy}
        />
      )}
      <Textarea
        label={isNew ? 'Body' : undefined}
        value={draft}
        onChange={e => handleBodyChange(e.currentTarget.value)}
        autosize
        minRows={6}
        maxRows={20}
        size="sm"
        disabled={busy}
        required={isNew}
        error={isNew ? fieldErrors.body : undefined}
        aria-label={
          isNew
            ? 'New block body'
            : `Edit body for ${(props as EditModeProps).block.title}`
        }
      />
      {!isNew && (
        <NumberInput
          label="Order"
          description="Leave blank for unordered (sorts after numbered blocks of the same type)."
          placeholder="Auto"
          value={order}
          onChange={setOrder}
          hideControls
          allowDecimal={false}
          size="sm"
          w={140}
          disabled={busy}
        />
      )}
      <SafetyCheckAlert
        issues={issues}
        onRemoveOffending={onRemoveOffending}
        disabled={busy}
      />
      <Group gap="xs" justify="space-between">
        <Group gap="xs">
          <Button
            variant="filled"
            color="green"
            size="sm"
            onClick={handleSubmit}
            loading={busy}
          >
            {checking ? 'Checking...' : saving ? savingLabel : submitLabel}
          </Button>
          {hasIssues && (
            <Button
              variant="default"
              color="yellow"
              size="sm"
              onClick={handleSubmitAnyway}
              disabled={checking}
              loading={saving}
            >
              Save Anyway
            </Button>
          )}
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            onClick={handleCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        </Group>
        {!isNew && (
          <Tooltip label={copied ? 'Copied!' : 'Copy body'} withArrow position="left">
            <ActionIcon
              variant="subtle"
              color={copied ? 'green' : 'gray'}
              size="md"
              onClick={handleCopyBody}
              aria-label="Copy block body to clipboard"
            >
              {copied ? <IconCheck size={16} /> : <IconClipboard size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Stack>
  )
}
