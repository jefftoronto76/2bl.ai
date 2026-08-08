'use client'

/**
 * MemoryCardView — the memory canvas panel's single-memory reading view.
 * Header holds title (editable) + eyebrow/date meta + "add to a story" + back
 * to the list; body scrolls independently between the fixed header and the
 * fixed footer action bar (Talk about this / Use as a base / Remove).
 *
 * The passage stays READ-ONLY, same rule as the inline transcript card
 * (components/shells/membership/memory/MemoryCard.tsx) — only the title is
 * an editable, optimistic-correction field. Do not add inline passage
 * editing here without a design conversation first.
 *
 * "Talk about this" and "Use as a base" have no designed behavior anywhere
 * in this codebase or the handoff — they fire the same local-toast stub
 * MemoryCard.tsx's own undesigned type-actions already use, rather than
 * inventing a flow. "Remove" is real — it calls the same discard() every
 * other Discard button in this feature already uses.
 *
 * `compact` collapses the footer to icon-only buttons — driven by the same
 * mobile breakpoint MemoryCanvasPanel/ChatHero already use for the panel's
 * full-screen-overlay-vs-split layout, not a live container measurement
 * (this codebase's Tailwind setup has no container-query plugin, and the
 * only width the panel actually gets narrow-enough-to-matter at today is
 * that mobile breakpoint — a resizable-desktop-split dragged this narrow is
 * an edge case, not the case this pass was asked to verify).
 */

import { useEffect, useRef, useState } from 'react'
import { X, Plus, MessageCircle, GitFork, Trash2, BookOpen, Pencil, Feather } from 'lucide-react'
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories'
import type { Story } from '../v2/types'
import { memoryKindOf, KIND_ICONS } from '../memory/memoryKinds'

function formatMemoryDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const MEDIA_LABEL: Record<'still' | 'video' | 'audio' | 'page', string> = {
  still: 'Photo',
  video: 'Video',
  audio: 'Recording',
  page: 'Document',
}

export interface MemoryCardViewProps {
  memory: MemoryRow
  onBack: () => void
  onRetitle: (title: string) => void
  onDiscard: () => void
  stories: Story[]
  onMoveToStory: (storyId: string) => void
  /** Icon-only footer, see file doc comment. */
  compact?: boolean
}

export function MemoryCardView({ memory, onBack, onRetitle, onDiscard, stories, onMoveToStory, compact }: MemoryCardViewProps) {
  const kind = memoryKindOf(memory.source_kind)
  const KindIcon = KIND_ICONS[kind.icon] ?? Feather
  const [moveOpen, setMoveOpen] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(memory.title)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!isEditingTitle) return
    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [isEditingTitle])

  const saveTitle = () => {
    const trimmed = titleDraft.trim()
    setIsEditingTitle(false)
    if (!trimmed || trimmed === memory.title) return
    onRetitle(trimmed)
  }

  const fireStub = (copy: string) => {
    setToast(copy)
    window.setTimeout(() => setToast(null), 2400)
  }

  const footerBtn =
    'inline-flex items-center gap-[7px] whitespace-nowrap rounded-lg border border-border bg-transparent px-3.5 py-2 font-body text-[13px] font-medium text-text-muted transition-colors hover:border-accent hover:text-text-primary [@media(hover:none)]:min-h-[44px]'
  const footerBtnCompact =
    'grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-transparent text-text-muted transition-colors hover:border-accent hover:text-text-primary [@media(hover:none)]:min-h-[44px]'

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Header — title + meta, add-to-story, back to the list. */}
      <header className="relative flex-shrink-0 border-b border-border px-[18px] py-[14px]">
        <div className="flex items-center gap-2">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  saveTitle()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setTitleDraft(memory.title)
                  setIsEditingTitle(false)
                }
              }}
              aria-label="Memory title"
              className="min-w-0 flex-1 border-none bg-transparent px-0.5 py-1 font-display text-xl font-medium tracking-tight text-text-primary outline-none"
            />
          ) : (
            <>
              <h3 className="m-0 min-w-0 flex-1 truncate px-0.5 py-1 font-display text-xl font-medium tracking-tight text-text-primary">
                {memory.title}
              </h3>
              <button
                type="button"
                aria-label="Edit title"
                onClick={() => {
                  setTitleDraft(memory.title)
                  setIsEditingTitle(true)
                }}
                className="shrink-0 rounded p-1 text-text-muted hover:text-text-primary"
              >
                <Pencil size={13} aria-hidden />
              </button>
            </>
          )}

          {stories.length > 0 && (
            <button
              type="button"
              aria-label="Add to a story"
              title="Add to a story"
              onClick={() => setMoveOpen(v => !v)}
              className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border-none bg-accent text-bg"
            >
              <Plus size={16} />
            </button>
          )}
          <button
            type="button"
            aria-label="Back to memories"
            title="Back to memories"
            onClick={onBack}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg border-none bg-transparent text-text-muted hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-[7px] font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          <KindIcon size={11} aria-hidden />
          <span>{kind.eyebrow}</span>
          <span className="opacity-50">·</span>
          <span>{formatMemoryDate(memory.created_at)}</span>
        </div>

        {moveOpen && (
          <>
            <div onClick={() => setMoveOpen(false)} className="fixed inset-0 z-[29]" />
            <div className="absolute right-[46px] top-full z-30 mt-1 min-w-[190px] rounded-xl border border-border bg-surface p-1.5 shadow-lg">
              {stories.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setMoveOpen(false)
                    onMoveToStory(s.id)
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-body text-[13px] text-text-primary hover:bg-accent-soft"
                >
                  <BookOpen size={14} aria-hidden />
                  {s.name}
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      {/* Body — scrolls independently of the fixed header and footer. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[560px] px-[22px] pb-8 pt-5">
          {kind.media && (
            <div className="mb-4.5 flex h-32 items-center justify-center rounded-[13px] border border-dashed border-border bg-surface-2">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-muted">
                {MEDIA_LABEL[kind.media]}
              </span>
            </div>
          )}
          <p className="m-0 text-pretty font-body text-[15.5px] leading-[1.75] text-text-muted">{memory.body}</p>
        </div>
      </div>

      {/* Footer — persistent action bar, no overflow menu. */}
      <div className="flex flex-shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-3">
        {compact ? (
          <>
            <button type="button" aria-label="Talk about this" title="Talk about this" onClick={() => fireStub('Talking about this is coming soon.')} className={footerBtnCompact}>
              <MessageCircle size={15} aria-hidden />
            </button>
            <button type="button" aria-label="Use as a base" title="Use as a base" onClick={() => fireStub('Using this as a base is coming soon.')} className={footerBtnCompact}>
              <GitFork size={15} aria-hidden />
            </button>
            <button type="button" aria-label="Remove" title="Remove" onClick={onDiscard} className={`${footerBtnCompact} ml-auto text-red-400 hover:text-red-400`}>
              <Trash2 size={15} aria-hidden />
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => fireStub('Talking about this is coming soon.')} className={footerBtn}>
              <MessageCircle size={14} aria-hidden />
              Talk about this
            </button>
            <button type="button" onClick={() => fireStub('Using this as a base is coming soon.')} className={footerBtn}>
              <GitFork size={14} aria-hidden />
              Use as a base
            </button>
            <button type="button" onClick={onDiscard} className={`${footerBtn} ml-auto text-red-400 hover:text-red-400 hover:border-border`}>
              <Trash2 size={14} aria-hidden />
              Remove
            </button>
          </>
        )}
      </div>

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[52px] flex justify-center" role="status">
          <span className="rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[10.5px] tracking-[0.04em] text-text-muted shadow-lg">
            {toast}
          </span>
        </div>
      )}
    </div>
  )
}
