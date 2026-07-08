'use client'

import { useState } from 'react'
import { Button, Group, Modal, ScrollArea, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { PromptFullnessMeter } from '@/components/admin/primitives/PromptFullnessMeter'

interface PreviewResponse {
  content: string
  tokenCount: number
}

interface CompileResponse {
  success: boolean
  version: number
  tokenCount: number
  content: string
  updatedAt: string
}

export function PublishButton() {
  const [previewing, setPreviewing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState<string | null>(null)

  async function handlePreview() {
    console.log('[PublishButton] preview triggered')
    setPreviewing(true)
    try {
      const res = await fetch('/api/admin/prompt/preview', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const message = data?.error ?? 'Preview failed'
        console.error('[PublishButton] preview failed:', message)
        notifications.show({ color: 'red', title: 'Preview failed', message })
        return
      }
      const data: PreviewResponse = await res.json()
      console.log('[PublishButton] preview success:', { tokenCount: data.tokenCount })
      setPreviewContent(data.content)
      setModalOpen(true)
    } catch (err) {
      console.error('[PublishButton] preview error:', err)
      notifications.show({
        color: 'red',
        title: 'Preview failed',
        message: 'Network error — could not reach the server.',
      })
    } finally {
      setPreviewing(false)
    }
  }

  async function handlePublish() {
    console.log('[PublishButton] publish triggered')
    setPublishing(true)
    try {
      const res = await fetch('/api/admin/prompt/compile', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const message = data?.error ?? 'Publish failed'
        console.error('[PublishButton] publish failed:', message)
        notifications.show({ color: 'red', title: 'Publish failed', message })
        return
      }
      const data: CompileResponse = await res.json()
      console.log('[PublishButton] publish success:', { version: data.version, tokenCount: data.tokenCount })
      notifications.show({
        color: 'green',
        title: 'Prompt published',
        message: `Version ${data.version}`,
      })
      setModalOpen(false)
      setPreviewContent(null)
    } catch (err) {
      console.error('[PublishButton] publish error:', err)
      notifications.show({
        color: 'red',
        title: 'Publish failed',
        message: 'Network error — could not reach the server.',
      })
    } finally {
      setPublishing(false)
    }
  }

  function handleClose() {
    if (publishing) return
    setModalOpen(false)
    setPreviewContent(null)
  }

  return (
    <>
      <Button
        variant="filled"
        color="green"
        size="sm"
        onClick={handlePreview}
        loading={previewing}
      >
        Compile &amp; Publish
      </Button>

      <Modal
        opened={modalOpen}
        onClose={handleClose}
        title="Review compiled prompt"
        size="xl"
        closeOnClickOutside={!publishing}
        closeOnEscape={!publishing}
      >
        <Stack gap="md">
          {previewContent !== null && (
            <PromptFullnessMeter bodies={[previewContent]} />
          )}
          <Text size="xs" c="dimmed">
            Review the compiled output below. Clicking Publish writes this to the live prompt.
          </Text>
          <ScrollArea h={360} type="auto">
            <pre
              style={{
                fontFamily: 'var(--mantine-font-family-monospace)',
                fontSize: 11,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {previewContent ?? ''}
            </pre>
          </ScrollArea>
          <Group justify="flex-end" gap="sm">
            <Button variant="outline" color="gray" onClick={handleClose} disabled={publishing}>
              Cancel
            </Button>
            <Button variant="filled" color="green" onClick={handlePublish} loading={publishing}>
              Publish
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
