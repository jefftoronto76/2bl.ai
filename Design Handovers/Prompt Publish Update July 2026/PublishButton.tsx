'use client'

// PublishButton — Blocks screen "Compile & Publish" entry point.
//
// July 2026: publish now carries a RELEASE NOTE. handlePublish takes the note from
// stage 3 of <CompilePublishModal/> and sends it with the compile POST. Everything
// else (preview → review) is unchanged.

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
  /** activeSet.version — the modal shows version + 1 as the version this publish creates. */
  activeSetVersion?: number
  /**
   * activeSet.last_compiled_at — cut-off for the stage-3 "changed since" list.
   * OPEN QUESTION (OQ-1): not available on the Blocks page today. Omitting it makes stage 3
   * list every active block rather than only the edited ones.
   */
  lastCompiledAt?: string | null
  /**
   * Token count of the currently live compiled prompt, for the stage-3 delta.
   * OPEN QUESTION (OQ-2): no such count in this data path. Leave unset and suppress the delta.
   */
  previousTokens?: number
  /** Active blocks in the set — BlockRow satisfies ChangedBlock once `type` is cast to BlockType. */
  blocks?: ChangedBlock[]
}

export function PublishButton({
  activeSetId,
  activeSetLabel,
  activeSetVersion = 0,
  lastCompiledAt = null,
  previousTokens = 0,
  blocks = [],
}: PublishButtonProps) {
  const [compileOpen, setCompileOpen] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [compiledText, setCompiledText] = useState('')

  // The version this publish will create. Known BEFORE the compile POST now, because
  // stage 2 and stage 3 both label it ("Will publish as v8" / "Publish v8").
  // OPEN QUESTION (OQ-3): assumes the server always increments by exactly 1 — unverified.
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
        // OPEN QUESTION (OQ-4): the endpoint does not read `note` yet, and where it should be
        // persisted depends on whether a row per compiled version is retained. See DIFF.md §4/§5.
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
        previousTokens={previousTokens}
        blocks={blocks}
        lastCompiledAt={lastCompiledAt}
        onPublish={handlePublish}
      />
    </>
  )
}
