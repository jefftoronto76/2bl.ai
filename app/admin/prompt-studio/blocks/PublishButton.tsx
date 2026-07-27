'use client'

// PublishButton — Blocks screen "Compile & Publish" entry point.
//
// July 2026: publish now carries a RELEASE NOTE. handlePublish takes the note
// from stage 3 of <CompilePublishModal/> and sends it with the compile POST.
// Everything else (preview → review) is unchanged.

import { useState } from 'react'
import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { CompilePublishModal, type ChangedBlock, type ReleaseNote } from '@/components/admin/prompt-studio/CompilePublishModal'

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

interface PublishButtonProps {
  activeSetId: string | null
  activeSetLabel: string
  /**
   * The current compiled_prompts.version for this slot (derived from the
   * prompt_sets_with_compile_meta view — NOT prompt_sets.version, which is
   * never incremented after row creation and drifts from reality). 0 when
   * this slot has never been compiled, so the first publish becomes v1.
   */
  activeSetVersion?: number
  /**
   * compiled_prompts.updated_at for this slot — cut-off for the stage-3
   * "changed since" list. null when never compiled (stage 3 then lists every
   * active block, correctly, since all of them are new).
   */
  lastCompiledAt?: string | null
  /** Active blocks in the set — BlockRow satisfies ChangedBlock once `type` is cast to BlockType. */
  blocks?: ChangedBlock[]
}

export function PublishButton({
  activeSetId,
  activeSetLabel,
  activeSetVersion = 0,
  lastCompiledAt = null,
  blocks = [],
}: PublishButtonProps) {
  const [compileOpen, setCompileOpen] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [compiledText, setCompiledText] = useState('')

  // The version this publish will create. Known BEFORE the compile POST now,
  // because stage 2 and stage 3 both label it ("Will publish as v8" / "Publish v8").
  const nextVersion = activeSetVersion + 1

  async function handleCompile() {
    setCompiling(true)
    setCompileOpen(true)
    try {
      const res = await fetch('/api/admin/prompt/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_set_id: activeSetId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setCompileOpen(false)
        notifications.show({
          color: 'red',
          title: 'Compile failed',
          message: data?.error ?? 'Compile failed',
        })
        return
      }
      const data: PreviewResponse = await res.json()
      setCompiledText(data.content)
    } catch (err) {
      setCompileOpen(false)
      notifications.show({
        color: 'red',
        title: 'Compile failed',
        message: 'Network error — could not reach the server.',
      })
    } finally {
      setCompiling(false)
    }
  }

  async function handlePublish(note: ReleaseNote) {
    try {
      const res = await fetch('/api/admin/prompt/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_set_id: activeSetId, note }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        notifications.show({
          color: 'red',
          title: 'Publish failed',
          message: data?.error ?? 'Publish failed',
        })
        return
      }
      const data: CompileResponse = await res.json()
      setCompileOpen(false)
      notifications.show({
        color: 'green',
        title: `Published v${data.version}`,
        message: note.summary,
      })
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Publish failed',
        message: 'Network error — could not reach the server.',
      })
    }
  }

  return (
    <>
      <Button color="brand" size="sm" onClick={handleCompile}>
        Compile &amp; Publish
      </Button>
      <CompilePublishModal
        opened={compileOpen}
        onClose={() => setCompileOpen(false)}
        compiling={compiling}
        text={compiledText}
        set={{ id: activeSetId ?? '', label: activeSetLabel }}
        version={nextVersion}
        blocks={blocks}
        lastCompiledAt={lastCompiledAt}
        onPublish={handlePublish}
      />
    </>
  )
}
