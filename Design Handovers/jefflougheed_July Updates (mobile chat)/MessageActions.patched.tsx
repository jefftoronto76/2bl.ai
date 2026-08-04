'use client'

import { useState, type ReactNode } from 'react'
import { Copy, Check, RefreshCw, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown } from 'lucide-react'
import { FeedbackPopover, type FeedbackSentiment } from './FeedbackPopover'

// PATCH (README §10): at-rest container opacity 0.6 → 0.9; inactive icon
// className no longer brightens on hover (both states are the same color
// now) — see the two marked lines below. Everything else is unchanged from
// the real components/chat/MessageActions.tsx.

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
  pressed?: boolean
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
        "before:absolute before:content-[''] before:-inset-x-[1px] before:top-[-4px] before:bottom-[-12px]",
        // PATCH: was 'text-text-muted hover:text-text-primary'
        active ? activeClassName ?? 'text-accent' : 'text-text-primary',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export interface MessageActionsProps {
  content: string
  stopped?: boolean
  versionIdx: number
  versionCount: number
  onRegenerate?: () => void
  onVersionChange: (dir: -1 | 1) => void
  rating: 'up' | 'down' | null
  onRate: (val: 'up' | 'down') => void
  onFeedback: (reasons: string[], note: string) => void
}

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
      onRate(val)
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
    // PATCH: was 'opacity-60 transition-opacity group-hover:opacity-100'
    <div className="relative flex items-center gap-0.5 opacity-90 transition-opacity group-hover:opacity-100">
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
