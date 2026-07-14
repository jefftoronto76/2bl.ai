'use client'

import { useState, type ReactNode } from 'react'
import { Copy, Check, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

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
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex items-center justify-center w-6 h-6 rounded-md transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'disabled:opacity-30 disabled:cursor-not-allowed',
        active ? 'text-accent' : 'text-text-muted hover:text-text-primary',
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
}

/**
 * Action row under a completed (non-streaming) assistant message: Copy,
 * Regenerate, and — once versionCount > 1 — the version carousel. Thumbs +
 * feedback are a separate, later addition to this same component.
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
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false)

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
    <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
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
    </div>
  )
}
