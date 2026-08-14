'use client'

/**
 * StoryPicker — the "+" popover on MemoryCardView's header, and (as of
 * 2026-08-14) on MemorySavedReceipt's in-transcript row, that assigns a
 * memory to a story (assign-memory-to-story, 2026-08-13, replacing the old
 * "Adding to a story is coming soon" stub — MemorySavedReceipt's own "+" was
 * still stubbed until the 2026-08-14 pass wired it to this same component).
 * Colocated next to MemoryCardView/BlockCanvas — a memory-context component
 * that imports `Story` from `v2/types.ts` the same cross-folder way
 * MemoryCardView already imports `SessionImage` from BlockCanvas.tsx.
 *
 * Mechanics copied from BlockCanvas.tsx's own BlockInserter exactly: a
 * fixed, invisible, full-viewport backdrop (lower z-index than the popover)
 * dismisses on any outside click, an Escape keydown listener does the same
 * while keyboard-driven, and close() resets both. Unlike BlockInserter's
 * "+" — centered between two horizontal rules — this one sits at the end of
 * a header row, so the popover anchors off the button itself (`absolute
 * right-0 top-full`, not centered).
 *
 * Single click on a story assigns immediately and closes — no separate
 * confirm step. This is NOT the checklist-with-footer-button pattern from
 * Design Handovers/.../04_add_memories_to_story — that's a different
 * feature at a different entry point (bulk-adding several memories into a
 * story from the story's own view, which doesn't exist yet), not this one.
 *
 * Re-picking the story the memory is already in is a deliberate no-op:
 * onPick is never called, so the caller never issues a redundant PATCH.
 */

import { useEffect, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import type { Story } from '../v2/types'

export interface StoryPickerProps {
  stories: Story[]
  /** The memory's current story, if any — highlighted with a checkmark in the list. */
  currentStoryId?: string | null
  /** Fired only when the picked story differs from currentStoryId. */
  onPick: (storyId: string) => void
}

export function StoryPicker({ stories, currentStoryId, onPick }: StoryPickerProps) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close() closes over a stable setState setter only; re-attaching on every render isn't needed, just on open toggling
  }, [open])

  const handlePick = (storyId: string) => {
    close()
    if (storyId === currentStoryId) return // re-picking the current story — no round trip
    onPick(storyId)
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Add to a story"
        title="Add to a story"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border-none bg-accent text-background transition-opacity hover:opacity-90"
      >
        <Plus size={16} aria-hidden />
      </button>

      {open && (
        <>
          {/* Full-viewport, invisible click-catcher — lower z-index than the
              popover below, matching BlockInserter's own backdrop exactly. */}
          <div onClick={close} aria-hidden="true" data-testid="story-picker-backdrop" className="fixed inset-0 z-10" />
          <div className="absolute right-0 top-full z-20 mt-1.5 max-w-[220px] rounded-[11px] border border-border bg-surface-2 p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
            {stories.length === 0 ? (
              <span className="block max-w-[160px] px-1 py-1 font-body text-xs text-text-muted">No stories yet.</span>
            ) : (
              <ul className="m-0 flex flex-col gap-0.5 p-0">
                {stories.map((story) => (
                  <li key={story.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(story.id)}
                      aria-label={story.id === currentStoryId ? `${story.name} (current story)` : `Add to ${story.name}`}
                      className="flex w-full min-w-[140px] items-center gap-1.5 rounded-lg px-2 py-1.5 text-left font-body text-xs text-text-primary transition-colors hover:bg-surface"
                    >
                      <span className="min-w-0 flex-1 truncate">{story.name}</span>
                      {story.id === currentStoryId && <Check size={13} className="shrink-0 text-accent" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
