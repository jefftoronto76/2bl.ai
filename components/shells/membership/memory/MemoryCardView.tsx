'use client'

/**
 * MemoryCardView — the real chrome for one open memory in the memory panel,
 * replacing ChatHero.tsx's throwaway MemoryPanelStub (memory-panel-layout
 * Stage A). Adapted from (not copied from) MemoryCardView.tsx in
 * Design Handovers/design_handoff_memory_canvas_08_2026/ — chrome shape only;
 * several of the reference's actions have no backend support in this
 * codebase yet and are deliberately stubbed rather than faked:
 *
 *   - "+" (add to a story): stories aren't a buildable concept yet (no UI
 *     anywhere creates or lists one) — renders in the reference's chrome
 *     position, fires the shared "coming soon" toast instead of opening a
 *     story-move popover.
 *   - Passage editing: renameMemory() (services/crm/memories.ts) only ever
 *     updates title — nothing updates body. Passage stays read-only, same
 *     as the stub it replaces, not the reference's editable <textarea>.
 *   - Date editing: no route action updates created_at at all. Read-only
 *     text, not the reference's editable date input.
 *   - "Talk about this" / "Use as a base": no backend implementation
 *     anywhere in this codebase. Same "coming soon" toast as "+".
 *   - "Remove": the one action that DOES have real backend support
 *     (discardMemory via PATCH .../memories/[memoryId], action: 'discard')
 *     — wired for real.
 *
 * Title IS live-editable: the PATCH route's `retitle` action
 * (renameMemory()) already backs the inline title-edit affordance on
 * MemorySavedReceipt/MemoryCard elsewhere in this feature, so this reuses
 * the same real write. Unlike the reference's per-keystroke
 * onChange={onTitleChange}, this commits on blur/Enter only (mirroring
 * MemoryCard.tsx's own draft-card title edit) — firing a PATCH on every
 * keystroke would spam the network and race concurrent writes against each
 * other for no benefit.
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { X, Plus, MessageCircle, GitFork, Trash2, Feather } from 'lucide-react'
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories'
import { memoryKindOf, KIND_ICONS } from './memoryKinds'

export interface MemoryCardViewProps {
  memory: MemoryRow
  onClose: () => void
  onRetitle: (title: string) => void
  onRemove: () => void
  /** Fires the shared toast for every stubbed action ("+", Talk about this, Use as a base) — one message, no separate behavior per button. */
  onStub: (message: string) => void
}

// Icon-only, not icon+label (fixed 2026-08-08 — see the footer's own doc
// comment below for why): a fixed 36px square comfortably fits three of
// these even at MIN_PANEL_WIDTH (280px, memoryPanelWidth.ts), where the
// original label+icon version needed ~401px and got clipped.
const footerBtn =
  'grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-border bg-transparent text-text-muted transition-colors hover:border-accent hover:text-text-primary [@media(hover:none)]:h-11 [@media(hover:none)]:w-11'

export function MemoryCardView({ memory, onClose, onRetitle, onRemove, onStub }: MemoryCardViewProps) {
  const kind = memoryKindOf(memory.source_kind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather

  // Local draft, committed on blur/Enter only — resets whenever the OPEN
  // memory itself changes (switching straight from one open memory to
  // another via a second receipt click, not just close/reopen), so a
  // half-typed draft on memory A never bleeds into memory B's title.
  const [titleDraft, setTitleDraft] = useState(memory.title)
  useEffect(() => setTitleDraft(memory.title), [memory.id, memory.title])

  const inputRef = useRef<HTMLInputElement>(null)

  const commitTitle = () => {
    const trimmed = titleDraft.trim()
    if (!trimmed) {
      setTitleDraft(memory.title) // empty isn't a valid title — revert, don't write
      return
    }
    if (trimmed === memory.title) return
    onRetitle(trimmed)
  }

  const handleTitleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      inputRef.current?.blur() // blur triggers commitTitle via onBlur below
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // No blur() here, deliberately: setTitleDraft is async, so a blur()
      // fired in the same tick would run commitTitle's onBlur handler
      // against the STALE (pre-revert) draft value, not the one just set —
      // committing the very text Escape was supposed to discard. Reverting
      // the draft and leaving focus in place is enough; commitTitle's own
      // "unchanged from memory.title" no-op guard correctly covers whatever
      // blur eventually happens later (e.g. tabbing away after Escape).
      setTitleDraft(memory.title)
    }
  }

  const date = new Date(memory.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — title + eyebrow/date meta. Two actions: add to a story (stubbed), close. */}
      <header className="flex-shrink-0 border-b border-border px-[18px] py-[14px]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={handleTitleKeyDown}
            aria-label="Memory title"
            className="min-w-0 flex-1 border-none bg-transparent px-0.5 py-1 font-display text-xl font-medium tracking-tight text-text-primary outline-none"
          />
          <button
            type="button"
            aria-label="Add to a story"
            title="Adding to a story is coming soon"
            onClick={() => onStub('Coming soon')}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border-none bg-accent text-background transition-opacity hover:opacity-90"
          >
            <Plus size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Close memory panel"
            onClick={onClose}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg border-none bg-transparent text-text-muted transition-colors hover:text-text-primary"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-[7px] font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          <Icon size={11} className="text-accent" aria-hidden />
          <span>{kind.eyebrow}</span>
          <span className="opacity-50">·</span>
          <span>{date}</span>
        </div>
      </header>

      {/* Body — scrolls independently of the fixed header and footer. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-[18px] pb-8 pt-4">
          {/* Media block — a placeholder box per kind, same convention as
              MemoryCard.tsx's draft card (no real thumbnail/waveform exists
              anywhere in this codebase yet — see memoryKinds.ts's own doc
              comment). Omitted entirely for kinds with no media (e.g. a
              plain conversation memory) — no empty box, no layout gap. */}
          {kind.media && (
            <div className="mb-4 flex h-32 items-center justify-center rounded-[13px] border border-dashed border-border bg-surface-2">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-muted">
                {kind.media === 'still' && 'Photo'}
                {kind.media === 'video' && 'Video'}
                {kind.media === 'audio' && 'Recording'}
                {kind.media === 'page' && 'Document'}
              </span>
            </div>
          )}
          {/* Passage — read-only. renameMemory() only ever updates title;
              nothing updates body, so there is no revision path to wire
              here (same as MemoryCard.tsx's own Rewrite-is-unwired note). */}
          <p className="m-0 text-pretty font-body text-[15.5px] leading-[1.75] text-text-primary/90 whitespace-pre-wrap">
            {memory.body}
          </p>
        </div>
      </div>

      {/* Footer — persistent action bar, always visible, no overflow menu.
          Icon-only (fixed 2026-08-08): the original icon+label version's
          three buttons needed ~401px and got clipped at the panel's default
          seeded width on a typical browser window (confirmed live —
          ChatDrawerV2's own w-[clamp(680px,50vw,1120px)] floor seeds the
          panel to ~359px on anything under a ~1360px-wide viewport, which is
          most laptops, not an edge case). Icon-only fits comfortably down to
          MIN_PANEL_WIDTH (280px) with room to spare — no overflow handling
          needed. aria-label + title carry the accessible name/tooltip now
          that there's no visible text. */}
      <div className="flex flex-shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-3">
        <button
          type="button"
          onClick={() => onStub('Coming soon')}
          aria-label="Talk about this"
          title="Talk about this"
          className={footerBtn}
        >
          <MessageCircle size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onStub('Coming soon')}
          aria-label="Use as a base"
          title="Use as a base"
          className={footerBtn}
        >
          <GitFork size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          title="Remove"
          className={`${footerBtn} ml-auto hover:border-border hover:text-red-400`}
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>
    </div>
  )
}
