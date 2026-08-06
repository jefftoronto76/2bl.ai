'use client'

/**
 * UploadErrorCard — a failed upload attempt. Full card, not the single-line
 * MemoryErrorLine used elsewhere in the memory system (see MemoryCard.tsx) —
 * KNOWN UNKNOWN, flagged in the handoff doc: these are two separately-built
 * error patterns (this one, MemoryErrorLine, and MessageBubble's own failed-
 * delivery bubble make three) that should probably converge on one shared
 * error-status component/token set. Not resolved here — building this as
 * its own component so that convergence is a deliberate follow-up, not an
 * accidental fork discovered later.
 *
 * Copy is plain and generic ("Couldn't finish uploading…") rather than
 * sourced from components/chat/errorCopy.ts's ChatErrorType vocabulary,
 * because an upload failure isn't classified into a ChatErrorType today —
 * see the handoff doc for whether it should be.
 */

import { AlertTriangle } from 'lucide-react'
import type { MemorySourceKind } from '@/services/chat/ui/v1/useMemories'
import { memoryKindOf } from './memoryKinds'
import { Feather, Image as ImageIcon, Video, Mic, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const KIND_ICONS: Record<string, LucideIcon> = {
  feather: Feather,
  image: ImageIcon,
  video: Video,
  mic: Mic,
  'file-text': FileText,
}

const RAIL = 'w-8 shrink-0'
const EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted'

export interface UploadErrorCardProps {
  sourceKind: MemorySourceKind
  onRetry: () => void
  onDiscard: () => void
}

export function UploadErrorCard({ sourceKind, onRetry, onDiscard }: UploadErrorCardProps) {
  const kind = memoryKindOf(sourceKind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather

  return (
    <div className="flex gap-3">
      <span className={RAIL} />
      <div className="motion-safe:animate-[chat-bubble-shake_0.32s_ease] min-w-0 max-w-[420px] flex-1 overflow-hidden rounded-2xl border border-red-400/45 bg-red-400/[0.06] shadow-[0_18px_44px_-26px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-3 px-4 py-[13px]">
          <span className="grid size-11 shrink-0 place-items-center rounded-[11px] bg-red-400/[0.14] text-red-400">
            <AlertTriangle size={19} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className={EYEBROW}>{kind.eyebrow}</div>
            <div className="mt-0.5 font-body text-[12.5px] text-red-400">Couldn&apos;t finish uploading — check your connection.</div>
          </div>
          <span className="shrink-0 text-text-muted"><Icon size={14} aria-hidden /></span>
        </div>
        <div className="flex items-center gap-2 border-t border-red-400/20 px-4 py-[13px]">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[9px] bg-accent px-4 py-2 font-body text-[12.5px] font-semibold text-bg hover:bg-accent-hover [@media(hover:none)]:min-h-[44px]"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="ml-auto whitespace-nowrap rounded-[9px] px-[13px] py-2 font-body text-[12.5px] font-medium text-text-muted hover:text-red-400 [@media(hover:none)]:min-h-[44px]"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}
