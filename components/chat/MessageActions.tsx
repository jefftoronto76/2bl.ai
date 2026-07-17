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
        'relative flex items-center justify-center w-6 h-6 rounded-md transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'disabled:opacity-30 disabled:cursor-not-allowed',
        // Invisible hit-area growth. gap-0.5 (2px) between icons only allows
        // 1px each on the shared left/right sides without adjacent buttons'
        // hit-zones overlapping — short of the 48px target (would need a
        // visible gap increase to close that, not done here). Vertical is
        // asymmetric on purpose: the prose bubble sits ~4px above (mt-1) and
        // may contain markdown links, so top stays tight; the ~24px
        // inter-message gap below is genuinely open, so bottom expands more.
        "before:absolute before:content-[''] before:-inset-x-[1px] before:top-[-4px] before:bottom-[-12px]",
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
