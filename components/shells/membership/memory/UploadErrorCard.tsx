'use client'

/**
 * UploadErrorCard — a failed media_items processing attempt (status ===
 * 'failed'). Full card, not the single-line MemoryErrorLine used elsewhere
 * in the memory system (see MemoryCard.tsx) — a known, deliberate fork (the
 * design handoff flags three separately-built error patterns — this one,
 * MemoryErrorLine, and MessageBubble's own failed-delivery bubble — that
 * should probably converge on one shared error-status component/token set
 * someday; not resolved here).
 *
 * `errorMessage` must already be the SANITIZED phrase (services/media/errorCopy.ts's
 * sanitizeFailureReason), never the raw media_items.error_message — that raw
 * string is internal/vendor detail (e.g. "Deepgram API error: 401
 * unauthorized") and GET /api/media passes it through untouched today. This
 * card intentionally does no sanitization itself — it renders exactly what
 * it's given — so the caller (UploadCard.tsx) is the one place that decision
 * lives.
 *
 * Retry is real: onRetry is wired to POST /api/media/{id}/retry, which
 * already exists and works (see UploadCard.tsx). Discard is a client-local
 * dismiss (see UploadReadyCard.tsx's doc comment — no backend delete route
 * or `discarded` status exists).
 */

import { AlertTriangle } from 'lucide-react'
import type { MemorySourceKind } from '@/services/chat/ui/v1/useMemories'
import { memoryKindOf, KIND_ICONS } from './memoryKinds'
import { Feather } from 'lucide-react'

const RAIL = 'w-8 shrink-0'
const EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted'

export interface UploadErrorCardProps {
  sourceKind: MemorySourceKind
  /** Already sanitized — see file doc comment. Never the raw error_message. */
  errorMessage: string
  onRetry: () => void
  onDiscard: () => void
}

export function UploadErrorCard({ sourceKind, errorMessage, onRetry, onDiscard }: UploadErrorCardProps) {
  const kind = memoryKindOf(sourceKind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather

  return (
    <div className="flex gap-3">
      <span className={RAIL} />
      {/* chat-bubble-shake is the same global animation (app/globals.css) the
          composer's own failed-message bubble already uses — reused as-is
          (not reimplemented via an arbitrary animate-[] value) so both
          failure surfaces shake identically, including under
          prefers-reduced-motion, which the shared class already handles. */}
      <div className="chat-bubble-shake min-w-0 max-w-[420px] flex-1 overflow-hidden rounded-2xl border border-red-400/45 bg-red-400/[0.06] shadow-[0_18px_44px_-26px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-3 px-4 py-[13px]">
          <span className="grid size-11 shrink-0 place-items-center rounded-[11px] bg-red-400/[0.14] text-red-400">
            <AlertTriangle size={19} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className={EYEBROW}>{kind.eyebrow}</div>
            <div className="mt-0.5 font-body text-[12.5px] text-red-400">{errorMessage}</div>
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
