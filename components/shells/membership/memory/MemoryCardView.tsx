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
 *   - Date editing: no route action updates created_at at all. Read-only
 *     text, not the reference's editable date input.
 *   - "Talk about this" / "Use as a base": no backend implementation
 *     anywhere in this codebase. Same "coming soon" toast as "+".
 *   - "Remove": the one footer action that DOES have real backend support
 *     (discardMemory via PATCH .../memories/[memoryId], action: 'discard')
 *     — wired for real.
 *
 * Title IS live-editable: the PATCH route's `retitle` action
 * (renameMemory()) already backs the inline title-edit affordance on
 * MemorySavedReceipt/MemoryCard elsewhere in this feature, so this reuses
 * the same real write. Title still commits on blur/Enter only (mirroring
 * MemoryCard.tsx's own draft-card title edit) — this is unchanged and
 * distinct from the passage's own save behavior below.
 *
 * Passage editing (Memory Canvas V1 — text + image blocks only; see the
 * Text+Image Scope Handover, Design Handovers/handover_memory edit panel_08_2026/)
 * — the block canvas (BlockCanvas.tsx) renders IMMEDIATELY on open, no
 * separate "Edit mode," no pencil affordance: `buildDefaultBlocks()` derives
 * a default text block from `memory.body` when `body_blocks` is null,
 * matching the reference prototype's own `buildDefaultBlocks(mem, K)`.
 * Text-block content commits on EVERY KEYSTROKE (onReviseBlocks fires per
 * change, matching the reference's `patchBlock`'s inline `commit()` call
 * exactly) — a deliberate, confirmed choice despite the real cost (every
 * keystroke round-trips through reviseMemoryBlocks's full validation +
 * a DB write, services/crm/memories.ts). Structural edits (add/remove/
 * attach-photo) also commit immediately. `blocksDraft` resets from
 * `memory.body_blocks` only when `memory.id` itself changes (switching to
 * a different open memory) — NOT on every `memory.body_blocks` change, since
 * with per-keystroke commits a slower-resolving earlier PATCH response
 * would otherwise clobber faster-typed, not-yet-confirmed local keystrokes
 * (the reference has the same shape: its own reset effect is keyed on
 * `[mem.id, mem.version]`, not on `mem.passage` changing).
 * The in-transcript draft card (MemoryCard.tsx) and saved receipt
 * (MemorySavedReceipt) are unaffected by any of this — still read-only,
 * exactly as before; this panel remains the only surface where a memory's
 * content is ever editable.
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { X, Plus, MessageCircle, GitFork, Trash2, Feather } from 'lucide-react'
import type { MemoryBlock, MemoryRow } from '@/services/chat/ui/v1/useMemories'
import { memoryKindOf, KIND_ICONS } from './memoryKinds'
import { BlockCanvas, type SessionImage } from './BlockCanvas'

export interface MemoryCardViewProps {
  memory: MemoryRow
  onClose: () => void
  onRetitle: (title: string) => void
  onRemove: () => void
  /** Fires the shared toast for every stubbed action ("+", Talk about this, Use as a base) — one message, no separate behavior per button. */
  onStub: (message: string) => void
  /** Persists the block canvas (Memory Canvas V1) — PATCH .../memories/[memoryId], action: 'revise_blocks'. */
  onReviseBlocks: (blocks: MemoryBlock[]) => void
  /** The session's own ready image media items, for the image-block attach picker (BlockCanvas.tsx). Sourced from useChatStore().mediaItems by ChatHero.tsx — this component never fetches anything itself. */
  sessionImages: SessionImage[]
}

/** Not crypto.randomUUID() directly — Node/jsdom test environments don't always polyfill it, and this only needs to be locally unique within one open panel's session, never persisted as a lookup key beyond that. */
function newBlockId(): string {
  return `blk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * "This memory has a linked photo" now has a real signal: artifacts.media_item_id,
 * populated by createPhotoMemoryFromMedia (services/crm/memories.ts, Photo
 * Bookmark, 2026-08-08) — no longer the flagged-dead column this function
 * used to stub around. `?? undefined` narrows MemoryRow's `string | null`
 * to the `string | undefined` buildDefaultBlocks/MemoryBlock already expect
 * (a null media_item_id, the ordinary non-photo case, must still omit the
 * image block below, not construct one with a null id).
 */
function getLinkedMediaItemId(memory: MemoryRow): string | undefined {
  return memory.media_item_id ?? undefined
}

/**
 * Builds the default block set for a memory whose body_blocks is null —
 * mirrors the reference's buildDefaultBlocks(mem, K): a linked photo (if
 * any) renders first, the passage always renders as the text block after
 * it. A photo-bookmarked memory (media_item_id populated) now hits the
 * photo-first branch for real — see getLinkedMediaItemId above.
 */
function buildDefaultBlocks(memory: MemoryRow): MemoryBlock[] {
  const blocks: MemoryBlock[] = []
  const linkedMediaItemId = getLinkedMediaItemId(memory)
  if (linkedMediaItemId) {
    blocks.push({ id: newBlockId(), type: 'image', media_item_id: linkedMediaItemId })
  }
  blocks.push({ id: newBlockId(), type: 'text', content: memory.body })
  return blocks
}

// Icon-only, not icon+label (fixed 2026-08-08 — see the footer's own doc
// comment below for why): a fixed 36px square comfortably fits three of
// these even at MIN_PANEL_WIDTH (280px, memoryPanelWidth.ts), where the
// original label+icon version needed ~401px and got clipped.
const footerBtn =
  'grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-border bg-transparent text-text-muted transition-colors hover:border-accent hover:text-text-primary [@media(hover:none)]:h-11 [@media(hover:none)]:w-11'

export function MemoryCardView({ memory, onClose, onRetitle, onRemove, onStub, onReviseBlocks, sessionImages }: MemoryCardViewProps) {
  const kind = memoryKindOf(memory.source_kind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather

  // Local draft, committed on blur/Enter only — resets whenever the OPEN
  // memory itself changes (switching straight from one open memory to
  // another via a second receipt click, not just close/reopen), so a
  // half-typed draft on memory A never bleeds into memory B's title.
  const [titleDraft, setTitleDraft] = useState(memory.title)
  useEffect(() => setTitleDraft(memory.title), [memory.id, memory.title])

  const inputRef = useRef<HTMLInputElement>(null)

  // The block canvas's local state — always a real array now (no lazy-seed
  // gate): seeded from memory.body_blocks when populated, else derived via
  // buildDefaultBlocks(). Resets ONLY when memory.id changes (switching to a
  // different open memory) — deliberately NOT keyed on memory.body_blocks,
  // since with per-keystroke commits a slower-resolving earlier PATCH
  // response landing after a faster later keystroke would otherwise
  // overwrite that not-yet-confirmed local edit (see this file's doc
  // comment for the reference's own matching behavior).
  const [blocksDraft, setBlocksDraft] = useState<MemoryBlock[]>(() =>
    memory.body_blocks && memory.body_blocks.length > 0 ? memory.body_blocks : buildDefaultBlocks(memory),
  )
  useEffect(() => {
    setBlocksDraft(memory.body_blocks && memory.body_blocks.length > 0 ? memory.body_blocks : buildDefaultBlocks(memory))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately memory.id only, see the comment above
  }, [memory.id])

  /** Every block change — content edit or structural (add/remove/attach-photo) — commits immediately, no separate save step. Matches the reference's own per-keystroke commit exactly (Text+Image Scope Handover). */
  const commitBlocks = (next: MemoryBlock[]) => {
    setBlocksDraft(next)
    onReviseBlocks(next)
  }

  const handleContentChange = (blockId: string, content: string) => {
    commitBlocks(blocksDraft.map((b) => (b.id === blockId ? { ...b, content } : b)))
  }

  const handleAddText = (afterIndex: number) => {
    const next = [...blocksDraft]
    next.splice(afterIndex + 1, 0, { id: newBlockId(), type: 'text', content: '' })
    commitBlocks(next)
  }

  const handleAddImage = (afterIndex: number, mediaItemId: string) => {
    const next = [...blocksDraft]
    next.splice(afterIndex + 1, 0, { id: newBlockId(), type: 'image', media_item_id: mediaItemId })
    commitBlocks(next)
  }

  const handleRemoveBlock = (blockId: string) => {
    commitBlocks(blocksDraft.filter((b) => b.id !== blockId))
  }

  /** A block can always be removed UNLESS it's the one remaining non-empty text block — removing it would leave the passage with nothing, which reviseMemoryBlocks rejects. */
  const canRemoveBlock = (blockId: string) => {
    const block = blocksDraft.find((b) => b.id === blockId)
    if (!block) return false
    if (block.type !== 'text' || !(block.content ?? '').trim()) return true
    const nonEmptyTextCount = blocksDraft.filter((b) => b.type === 'text' && (b.content ?? '').trim().length > 0).length
    return nonEmptyTextCount > 1
  }

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
    <div className="flex h-full min-h-0 flex-col bg-background">
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
          {/* No separate media placeholder here (removed 2026-08-08, Photo
              Bookmark pass) — the block canvas below is the single source
              of truth for a memory's media. It used to render its own
              dashed "Photo"/"Video"/"Recording"/"Document" box per
              memoryKinds.ts's kind.media unconditionally, alongside the
              canvas — harmless while getLinkedMediaItemId always returned
              undefined (no image block ever rendered to duplicate), but a
              real photo-bookmarked memory now gets a real image block
              first via buildDefaultBlocks(), which would have shown BOTH
              the old placeholder AND the real photo. MemoryCard.tsx's
              draft-card equivalent is untouched — it has no block canvas
              to duplicate against. */}
          {/* Passage — block canvas (Memory Canvas V1), always. No
              separate "Edit mode," no pencil affordance — matches the
              reference prototype's always-editable presentation. */}
          <BlockCanvas
            blocks={blocksDraft}
            sessionImages={sessionImages}
            onContentChange={handleContentChange}
            onAddText={handleAddText}
            onAddImage={handleAddImage}
            onRemove={handleRemoveBlock}
            canRemove={canRemoveBlock}
          />
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
