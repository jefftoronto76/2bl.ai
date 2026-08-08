'use client'

/**
 * BlockCanvas — the block-canvas body for a memory whose `body_blocks` is
 * populated (Memory Canvas V1, two block types only: text, image). Fully
 * controlled/presentational: MemoryCardView.tsx owns all state (the blocks
 * array, when to persist via revise_blocks, the "does this commit violate
 * the server's own invariant" checks) — this component only renders `blocks`
 * and reports user intent through callbacks. Kept separate from
 * MemoryCardView.tsx so each stays independently testable, same convention
 * as memoryKinds.ts being its own file.
 *
 * Deliberately absent, per the locked V1 scope (see the handover in
 * Design Handovers/handover_canvas_update_notion_08_2026/): no drag-to-
 * reorder, no hover-insert-between-blocks, no video/quote/divider/gallery
 * block types. The only structural affordances are "Add text" / "Add
 * photo" appended after the last block, and a per-block remove.
 */

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Type, X } from 'lucide-react'
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
  /** Every keystroke on a text block — local draft only, never fired at the network (see MemoryCardView.tsx). */
  onContentChange: (blockId: string, content: string) => void
  /** Blur on a text block — the caller decides whether this is safe to persist. */
  onContentCommit: (blockId: string) => void
  onAddText: () => void
  onAddImage: (mediaItemId: string) => void
  onRemove: (blockId: string) => void
  /** Purely presentational — disables removal on the one block that would leave the passage empty. */
  canRemove: (blockId: string) => boolean
}

function TextBlockRow({
  block,
  index,
  onChange,
  onCommit,
}: {
  block: MemoryBlock
  index: number
  onChange: (content: string) => void
  onCommit: () => void
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
      onBlur={onCommit}
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

/** "Add text" / "Add photo" — appended once, after the last block. The photo option expands into a picker of this session's own ready images; no upload UI (locked V1 scope — media_item_id references an existing upload only). */
function AddBlockControls({ sessionImages, onAddText, onAddImage }: { sessionImages: SessionImage[]; onAddText: () => void; onAddImage: (mediaItemId: string) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onAddText}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-border px-[11px] py-[7px] font-body text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-text-primary [@media(hover:none)]:min-h-[44px]"
        >
          <Type size={13} aria-hidden />
          Add text
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-border px-[11px] py-[7px] font-body text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-text-primary [@media(hover:none)]:min-h-[44px]"
        >
          <ImagePlus size={13} aria-hidden />
          Add photo
        </button>
      </div>

      {pickerOpen && (
        <div className="mt-2 rounded-[10px] border border-border bg-surface-2 p-2.5">
          {sessionImages.length === 0 ? (
            <span className="font-body text-xs text-text-muted">No photos in this conversation yet.</span>
          ) : (
            <div className="flex flex-wrap gap-[7px]">
              {sessionImages.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => {
                    onAddImage(img.id)
                    setPickerOpen(false)
                  }}
                  aria-label={`Add photo: ${img.filename}`}
                  className="grid size-14 place-items-center overflow-hidden rounded-[10px] border border-border bg-surface transition-colors hover:border-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail of a signed URL, same as ImageBlockRow above */}
                  <img src={img.url} alt={img.filename} className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function BlockCanvas({ blocks, sessionImages, onContentChange, onContentCommit, onAddText, onAddImage, onRemove, canRemove }: BlockCanvasProps) {
  let textIndex = -1
  return (
    <div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {blocks.map((block) => {
          if (block.type === 'text') textIndex += 1
          const removable = canRemove(block.id)
          return (
            <li key={block.id} className="group/block relative">
              <div className="pr-7">
                {block.type === 'text' ? (
                  <TextBlockRow
                    block={block}
                    index={textIndex}
                    onChange={(content) => onContentChange(block.id, content)}
                    onCommit={() => onContentCommit(block.id)}
                  />
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
            </li>
          )
        })}
      </ul>

      <AddBlockControls sessionImages={sessionImages} onAddText={onAddText} onAddImage={onAddImage} />
    </div>
  )
}
