'use client'

/**
 * BlockCanvas — the block-canvas body for a memory (Memory Canvas V1, two
 * block types only: text, image). Fully controlled/presentational:
 * MemoryCardView.tsx owns all state (the blocks array, when/whether a
 * change persists) — this component only renders `blocks` and reports user
 * intent through callbacks. Kept separate from MemoryCardView.tsx so each
 * stays independently testable, same convention as memoryKinds.ts being
 * its own file.
 *
 * Insert control (per the Text+Image Scope Handover,
 * Design Handovers/handover_memory edit panel_08_2026/) — a `BlockInserter`
 * "+" sits before the first block AND after every block (N blocks → N+1
 * inserter slots), independent of reordering, which stays out of scope.
 * Clicking "+" reveals exactly 2 icon buttons (text, image) — not the
 * reference prototype's 6-type picker; picking "image" expands into the
 * session's own ready-photo grid rather than inserting an unattached block,
 * since an image block always needs a real media_item_id.
 *
 * Text content commits on every keystroke (onContentChange), matching the
 * reference prototype exactly — no blur-gating. Deliberately absent, per
 * the locked V1 scope: no drag-to-reorder, no video/quote/divider/gallery
 * block types.
 */

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Plus, Type, X } from 'lucide-react'
import type { MemoryBlock } from '@/services/chat/ui/v1/useMemories'

export interface SessionImage {
  id: string
  url: string
  filename: string
}

export interface BlockCanvasProps {
  blocks: MemoryBlock[]
  /** The session's own ready image media items, for the image-block attach picker. Sourced from useChatStore().mediaItems by the caller (ChatHero.tsx) — this component never fetches anything itself. */
  sessionImages: SessionImage[]
  /** Every keystroke on a text block — the caller persists on every call (no separate blur/commit step). */
  onContentChange: (blockId: string, content: string) => void
  /** Inserts a new empty text block right after `afterIndex` (-1 = before the first block). */
  onAddText: (afterIndex: number) => void
  /** Inserts a new image block referencing `mediaItemId` right after `afterIndex`. */
  onAddImage: (afterIndex: number, mediaItemId: string) => void
  onRemove: (blockId: string) => void
  /** Purely presentational — disables removal on the one block that would leave the passage empty. */
  canRemove: (blockId: string) => boolean
}

function TextBlockRow({
  block,
  index,
  onChange,
}: {
  block: MemoryBlock
  index: number
  onChange: (content: string) => void
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [block.content])

  return (
    <textarea
      ref={taRef}
      value={block.content ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Write something…"
      aria-label={`Text block ${index + 1}`}
      rows={3}
      className="block w-full resize-none border-none bg-transparent p-0 text-pretty font-body text-[15.5px] leading-[1.75] text-text-primary/90 outline-none"
    />
  )
}

function ImageBlockRow({ block, sessionImages }: { block: MemoryBlock; sessionImages: SessionImage[] }) {
  const image = sessionImages.find((img) => img.id === block.media_item_id)
  if (!image) {
    // A stale/removed media item, or one this member no longer has access
    // to — graceful degradation (CLAUDE.md), not a broken <img>.
    return (
      <div className="flex h-32 items-center justify-center rounded-[13px] border border-dashed border-border bg-surface-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-muted">Photo unavailable</span>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-[13px] border border-border">
      {/* eslint-disable-next-line @next/next/no-img-element -- same convention as UploadThumbnail.tsx, which also renders a signed URL that changes shape/expiry too often to benefit from next/image */}
      <img src={image.url} alt={image.filename} className="block max-h-80 w-full object-contain" />
    </div>
  )
}

/**
 * A single "+" slot — the line-with-centered-button treatment from the
 * reference prototype's BlockInserter, this app's own tokens instead of
 * hardcoded CSS custom properties. Clicking "+" reveals 2 icon buttons
 * (text, image); "image" expands into a picker of the session's own ready
 * photos rather than inserting directly, since an image block always needs
 * a real media_item_id — no upload UI here (locked V1 scope).
 *
 * Dismissal — matches the reference's own BlockInserter exactly: a fixed,
 * full-viewport, invisible backdrop behind the popover (lower z-index)
 * closes it on any outside click, plus an Escape handler for the same
 * dismiss while keyboard-driven. Both apply from either popover state (the
 * text/image choice, or the photo picker once "image" is picked) — close()
 * always resets both.
 */
function BlockInserter({
  afterIndex,
  sessionImages,
  onAddText,
  onAddImage,
}: {
  afterIndex: number
  sessionImages: SessionImage[]
  onAddText: (afterIndex: number) => void
  onAddImage: (afterIndex: number, mediaItemId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const close = () => {
    setOpen(false)
    setPickerOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close() closes over stable setState setters only; re-attaching on every render isn't needed, just on open toggling
  }, [open])

  return (
    <div className="relative my-0.5 flex h-[22px] items-center">
      <div className={`h-px flex-1 transition-colors ${open ? 'bg-border' : 'bg-transparent'}`} />
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Add a block"
        aria-expanded={open}
        className={`grid size-[22px] shrink-0 place-items-center rounded-full border border-border bg-surface text-text-muted transition-opacity hover:text-text-primary hover:opacity-100 ${open ? 'opacity-100' : 'opacity-35'}`}
      >
        <Plus size={13} aria-hidden />
      </button>
      <div className={`h-px flex-1 transition-colors ${open ? 'bg-border' : 'bg-transparent'}`} />

      {open && (
        <>
          {/* Full-viewport, invisible click-catcher — lower z-index than the
              popover below, so a real option click still lands on the
              option, not this. Matches the reference's own backdrop
              exactly, just this app's z-index convention (bg-black/40
              mobile-sidebar-overlay pattern, ChatHero.tsx) instead of a
              hardcoded zIndex number. */}
          <div onClick={close} aria-hidden="true" data-testid="block-inserter-backdrop" className="fixed inset-0 z-10" />
          <div className="absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 rounded-[11px] border border-border bg-surface-2 p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
            {!pickerOpen ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onAddText(afterIndex)
                    close()
                  }}
                  aria-label="Add text"
                  title="Text"
                  className="grid size-8 place-items-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
                >
                  <Type size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  aria-label="Add image"
                  title="Image"
                  className="grid size-8 place-items-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
                >
                  <ImagePlus size={15} aria-hidden />
                </button>
              </div>
            ) : sessionImages.length === 0 ? (
              <span className="block max-w-[160px] px-1 py-1 font-body text-xs text-text-muted">No photos in this conversation yet.</span>
            ) : (
              <div className="flex max-w-[220px] flex-wrap gap-[7px]">
                {sessionImages.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      onAddImage(afterIndex, img.id)
                      close()
                    }}
                    aria-label={`Add photo: ${img.filename}`}
                    className="grid size-12 place-items-center overflow-hidden rounded-[8px] border border-border bg-surface transition-colors hover:border-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail of a signed URL, same as ImageBlockRow above */}
                    <img src={img.url} alt={img.filename} className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function BlockCanvas({ blocks, sessionImages, onContentChange, onAddText, onAddImage, onRemove, canRemove }: BlockCanvasProps) {
  let textIndex = -1
  return (
    <div>
      <BlockInserter afterIndex={-1} sessionImages={sessionImages} onAddText={onAddText} onAddImage={onAddImage} />
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {blocks.map((block, index) => {
          if (block.type === 'text') textIndex += 1
          const removable = canRemove(block.id)
          return (
            <li key={block.id}>
              <div className="group/block relative">
                <div className="pr-7">
                  {block.type === 'text' ? (
                    <TextBlockRow block={block} index={textIndex} onChange={(content) => onContentChange(block.id, content)} />
                  ) : (
                    <ImageBlockRow block={block} sessionImages={sessionImages} />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(block.id)}
                  disabled={!removable}
                  aria-label={block.type === 'text' ? 'Remove text block' : 'Remove photo'}
                  title={!removable ? 'A memory needs at least one line of text' : undefined}
                  className="absolute right-0 top-0 grid size-6 shrink-0 place-items-center rounded-md border-none bg-transparent text-text-muted opacity-0 transition-opacity hover:text-red-400 group-hover/block:opacity-100 disabled:cursor-not-allowed disabled:opacity-0 [@media(hover:none)]:opacity-100 [@media(hover:none)]:disabled:opacity-30"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
              <BlockInserter afterIndex={index} sessionImages={sessionImages} onAddText={onAddText} onAddImage={onAddImage} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
