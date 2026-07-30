'use client'

// PublishButton — Blocks screen "Compile & Publish" entry point.
//
// July 2026: publish now carries a RELEASE NOTE. handlePublish takes the note
// from stage 3 of <CompilePublishModal/> and sends it with the compile POST.
// Everything else (preview → review) is unchanged.
//
// July 2026 (publish animation fix): handlePublish now returns a boolean —
// true on a confirmed successful publish, false on any handled failure — so
// the modal's stage-4 checklist can track the real request instead of an
// independent decorative timer. It no longer closes the modal itself; the
// modal's own success screen (Okay button) does that, via onPublished below,
// which refreshes this server component's data so the Status/Live version/
// Active blocks card reflects the publish without a manual reload.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [compileOpen, setCompileOpen] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [compiledText, setCompiledText] = useState('')

  // Optimistic concurrency (July 2026): activeSetVersion is a live prop —
  // it can move under us while the modal is open (a background refetch, a
  // realtime update). Freeze it the moment the modal opens so the number the
  // reviewer actually sees ("Will publish as vN") is the exact number checked
  // against the DB at publish time — not whatever the prop has drifted to by
  // then. null until the modal has been opened at least once.
  const [frozenActiveVersion, setFrozenActiveVersion] = useState<number | null>(null)
  const effectiveActiveVersion = frozenActiveVersion ?? activeSetVersion

  // The version this publish will create. Known BEFORE the compile POST now,
  // because stage 2 and stage 3 both label it ("Will publish as v8" / "Publish v8").
  const nextVersion = effectiveActiveVersion + 1
  // 0 is the "never compiled" sentinel (see activeSetVersion's doc comment
  // above) — there's no existing row to expect a version from, so the guard
  // is skipped (null), not sent as a literal 0.
  const expectedVersion = effectiveActiveVersion > 0 ? effectiveActiveVersion : null

  // Closes the modal and drops the frozen version snapshot, so the next
  // Compile click re-captures activeSetVersion fresh rather than reusing a
  // number from a previous, possibly-cancelled attempt.
  function closeModal() {
    setCompileOpen(false)
    setFrozenActiveVersion(null)
  }

  async function handleCompile() {
    setFrozenActiveVersion(activeSetVersion)
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
        closeModal()
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
      closeModal()
      notifications.show({
        color: 'red',
        title: 'Compile failed',
        message: 'Network error — could not reach the server.',
      })
    } finally {
      setCompiling(false)
    }
  }

  // Returns true on a confirmed successful publish, false on any handled
  // failure — the modal's stage-4 checklist awaits this to decide whether to
  // show the success screen or drop back to the note stage. Does NOT close
  // the modal on success; that's the success screen's Okay button (via
  // onPublished below).
  async function handlePublish(note: ReleaseNote): Promise<boolean> {
    try {
      const res = await fetch('/api/admin/prompt/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_set_id: activeSetId, note, expected_version: expectedVersion }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        notifications.show({
          color: 'red',
          title: 'Publish failed',
          message: data?.error ?? 'Publish failed',
        })
        return false
      }
      const data: CompileResponse = await res.json()
      notifications.show({
        color: 'green',
        title: `Published v${data.version}`,
        message: note.summary,
      })
      return true
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Publish failed',
        message: 'Network error — could not reach the server.',
      })
      return false
    }
  }

  // Fired from the success screen's Okay button, alongside onClose — refetches
  // this server component's data so the Status/Live version/Active blocks
  // card picks up the publish without a manual reload.
  function handlePublished() {
    router.refresh()
  }

  return (
    <>
      <Button color="brand" size="sm" onClick={handleCompile}>
        Compile &amp; Publish
      </Button>
      <CompilePublishModal
        opened={compileOpen}
        onClose={closeModal}
        compiling={compiling}
        text={compiledText}
        set={{ id: activeSetId ?? '', label: activeSetLabel }}
        version={nextVersion}
        blocks={blocks}
        lastCompiledAt={lastCompiledAt}
        onPublish={handlePublish}
        onPublished={handlePublished}
      />
    </>
  )
}
