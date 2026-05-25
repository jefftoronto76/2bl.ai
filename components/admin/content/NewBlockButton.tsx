'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconPlus } from '@tabler/icons-react'
import { BlockEditDrawer } from './BlockEditDrawer'
import { BlockEditSheet } from './BlockEditSheet'
import { BlockEditForm, type NewBlockDraft, type Topic } from './BlockEditForm'

export interface NewBlockButtonProps {
  topics: Topic[]
}

/**
 * Button + drawer for creating a new block. Owns its own opened state,
 * independent from BlocksTable's edit-flow state. On successful create:
 * closes the drawer and calls router.refresh() so the server component
 * re-fetches the rows list — no full page reload, no manual cache push.
 *
 * Mirrors BlocksTable's drawer/sheet picker via useMediaQuery so the
 * shell matches the viewport (right Drawer ≥ md, bottom Sheet < md).
 *
 * Topics arrive pre-fetched from the server component (page.tsx) to
 * avoid a network round-trip on every drawer open.
 */
export function NewBlockButton({ topics }: NewBlockButtonProps) {
  const router = useRouter()
  const [opened, setOpened] = useState(false)

  // Same SSR-undefined fallback as BlocksTable — drawer is the desktop
  // default on first paint; mobile users see a brief flash before the
  // sheet swaps in on hydration.
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false
  const EditContainer = isMobile ? BlockEditSheet : BlockEditDrawer

  function handleOpen() {
    console.log('[NewBlockButton] open')
    setOpened(true)
  }

  function handleClose() {
    console.log('[NewBlockButton] close')
    setOpened(false)
  }

  // Both Save and Save Anyway hit the same endpoint with the same
  // payload — the difference is upstream (whether the safety check
  // ran). Throw on failure so the form's hook treats it as a save
  // failure (drawer stays open, user can retry).
  async function handleCreate(draft: NewBlockDraft): Promise<void> {
    console.log('[NewBlockButton] create dispatch', {
      type: draft.type ?? null,
      titleLength: draft.title?.length ?? 0,
      bodyLength: draft.body.length,
    })
    const res = await fetch('/api/admin/blocks/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: draft.type,
        topic_id: draft.topic_id,
        title: draft.title,
        body: draft.body,
      }),
    })

    if (!res.ok) {
      const errMessage = await res.json().then(d => d?.error).catch(() => null)
      console.error('[NewBlockButton] create failed', {
        status: res.status,
        error: errMessage,
      })
      throw new Error(errMessage ?? 'Create failed')
    }

    console.log('[NewBlockButton] create success')
    setOpened(false)
    router.refresh()
  }

  return (
    <>
      <Button
        variant="default"
        leftSection={<IconPlus size={14} />}
        onClick={handleOpen}
      >
        New block
      </Button>
      <EditContainer opened={opened} onClose={handleClose} title="New block">
        {opened && (
          <BlockEditForm
            mode="new"
            topics={topics}
            onSave={handleCreate}
            onSaveAnyway={handleCreate}
            onCancel={handleClose}
          />
        )}
      </EditContainer>
    </>
  )
}
