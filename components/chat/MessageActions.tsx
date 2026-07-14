'use client'

import { useState, type ReactNode } from 'react'
import { Copy, Check, RefreshCw, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown } from 'lucide-react'
import { FeedbackPopover, type FeedbackSentiment } from './FeedbackPopover'

/**
 * Self-contained icon button — deliberately not `@/components/shells/
 * membership/ui/IconButton` (Heirloom-only; reusing it here would cross the
 * widget/membership shell isolation boundary). Uses the same semantic
 * tokens (text-text-muted / text-text-primary / accent) both shells already
 * define, so it renders identically on jefflougheed and Heirloom routes.
 */
function ActionIconButton({
  label,
  onClick,
  disabled,
  active,
  pressed,
  activeClassName,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  /** Sets aria-pressed for toggle buttons (thumbs). Omit for non-toggle actions. */
  pressed?: boolean
  /** Overrides the default active-state text color (e.g. red for thumbs-down). */
  activeClassName?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex items-center justify-center w-6 h-6 rounded-md transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'disabled:opacity-30 disabled:cursor-not-allowed',
        active ? activeClassName ?? 'text-accent' : 'text-text-muted hover:text-text-primary',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

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

      <ActionIconButton
        label="Good response"
        pressed={rating === 'up'}
        active={rating === 'up'}
        onClick={() => clickThumb('up')}
      >
        <ThumbsUp size={14} />
      </ActionIconButton>
      <ActionIconButton
        label="Bad response"
        pressed={rating === 'down'}
        active={rating === 'down'}
        activeClassName="text-red-400"
        onClick={() => clickThumb('down')}
      >
        <ThumbsDown size={14} />
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
