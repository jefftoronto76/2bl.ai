'use client'

import { useState } from 'react'
import { Copy, Check, RefreshCw, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown } from 'lucide-react'
import { ActionIconButton } from './ActionIconButton'
import { FeedbackPopover, type FeedbackSentiment } from './FeedbackPopover'

export interface MessageActionsProps {
  /** The currently-displayed content of this message (Copy target). */
  content: string
  stopped?: boolean
  /** Only rendered when versionCount > 1. */
  versionIdx: number
  versionCount: number
  /** Omit to hide the Regenerate button — callers restrict it to the latest
   *  assistant message (see components/shells/widget/WidgetShell.tsx and
   *  components/shells/membership/MessageList.tsx). */
  onRegenerate?: () => void
  onVersionChange: (dir: -1 | 1) => void
  /** Current rating for this message. Mutually exclusive up/down. */
  rating: 'up' | 'down' | null
  /** Tapping the already-active thumb toggles it off (caller flips rating to null). */
  onRate: (val: 'up' | 'down') => void
  onFeedback: (reasons: string[], note: string) => void
}

/**
 * Action row under a completed (non-streaming) assistant message: Copy,
 * Regenerate, version carousel, and thumbs up/down (opens FeedbackPopover).
 *
 * Rendered at reduced opacity by default, full opacity on hover — the caller
 * wraps the message + this row in one `group` container.
 */
export function MessageActions({
  content,
  stopped,
  versionIdx,
  versionCount,
  onRegenerate,
  onVersionChange,
  rating,
  onRate,
  onFeedback,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false)
  const [popover, setPopover] = useState<FeedbackSentiment | null>(null)

  const clickThumb = (val: 'up' | 'down') => {
    if (rating === val) {
      onRate(val) // parent toggles off
      setPopover(null)
      return
    }
    onRate(val)
    setPopover(val)
  }

  const handleCopy = () => {
    navigator.clipboard
      .writeText(content)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  return (
    <div className="relative flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
      {stopped && (
        <span className="mr-1 font-mono text-[10.5px] tracking-wide text-text-muted">Stopped</span>
      )}

      <ActionIconButton label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </ActionIconButton>
      {onRegenerate && (
        <ActionIconButton label="Regenerate response" onClick={onRegenerate}>
          <RefreshCw size={14} />
        </ActionIconButton>
      )}

      {versionCount > 1 && (
        <>
          <ActionIconButton
            label="Previous version"
            onClick={() => onVersionChange(-1)}
            disabled={versionIdx === 0}
          >
            <ChevronLeft size={14} />
          </ActionIconButton>
          <span className="min-w-[30px] text-center font-mono text-[11px] text-text-muted">
            {versionIdx + 1}/{versionCount}
          </span>
          <ActionIconButton
            label="Next version"
            onClick={() => onVersionChange(1)}
            disabled={versionIdx === versionCount - 1}
          >
            <ChevronRight size={14} />
          </ActionIconButton>
        </>
      )}

      <span className="mx-1.5 h-3.5 w-px bg-border" />

      {/* Thumb active colors are deliberately hardcoded hex, not tenant/CSS-var
          tokens (text-accent etc.) — rating color is a fixed product
          convention, not brand-themed. */}
      <ActionIconButton
        label="Good response"
        pressed={rating === 'up'}
        active={rating === 'up'}
        activeClassName="text-[#16a34a]"
        onClick={() => clickThumb('up')}
      >
        <ThumbsUp size={14} fill={rating === 'up' ? '#16a34a' : 'none'} />
      </ActionIconButton>
      <ActionIconButton
        label="Bad response"
        pressed={rating === 'down'}
        active={rating === 'down'}
        activeClassName="text-[#dc2626]"
        onClick={() => clickThumb('down')}
      >
        <ThumbsDown size={14} fill={rating === 'down' ? '#dc2626' : 'none'} />
      </ActionIconButton>

      {popover && (
        <FeedbackPopover
          sentiment={popover}
          onClose={() => setPopover(null)}
          onSubmit={(reasons, note) => {
            onFeedback(reasons, note)
            setPopover(null)
          }}
        />
      )}
    </div>
  )
}
