'use client'

/**
 * UserMessageActions — Edit / Copy / Send again on the visitor's own
 * messages. Renders BELOW the user bubble, right-aligned, hover-gated on
 * pointer devices (invisible at rest, full opacity on hover of the message
 * group or keyboard focus within the row) — unlike the assistant action row
 * (MessageActions.tsx), which is deliberately never fully hidden. Under
 * `@media (hover: none)` (touch) it is always visible, since a touch device
 * has no persistent hover state to reveal it — this is the one carve-out to
 * the "nothing important is hover-only" rule, not a violation of it.
 *
 * Mount rule (owned by the caller): only render this when status is 'sent'
 * and the message isn't being edited — DeliveryStatus owns that space during
 * 'sending'/'failed', and the two must never render together.
 *
 * Per-surface reduction: `showEdit`/`showResend` (both default `true`) let a
 * caller drop the truncate-and-redeliver actions while keeping Copy — used
 * briefly by jefflougheed (components/shells/widget/WidgetShell.tsx) to ship
 * Copy-only ahead of full parity, since editing/truncating history there
 * could silently discard an already-offered booking card or an
 * already-captured NAME/EMAIL/PHONE with no undo. Both surfaces get the full
 * row again once `conversion_events` (services/crm/conversion-events.ts)
 * started tracking that discard instead of silently losing it — see the
 * WidgetShellChat entry in System Docs/Public Site.md. Kept as a live escape hatch in case a
 * future surface needs the same reduction.
 */

import { useState } from 'react'
import { Bookmark, Pencil, Copy, Check, RefreshCw } from 'lucide-react'
import { ActionIconButton } from './ActionIconButton'

export interface UserMessageActionsProps {
  content: string
  edited?: boolean
  /** Show the Edit action. Default true. */
  showEdit?: boolean
  /** Show the Send again action. Default true. */
  showResend?: boolean
  onEdit?: () => void
  onResend?: () => void
  /**
   * Omit to hide the bookmark ("Keep this as a memory") — the widget shell
   * (jefflougheed) simply doesn't pass it, same pattern as showEdit/showResend.
   * Heirloom-only; the shared row itself stays product-agnostic.
   */
  onKeep?: () => void
  /** True once this message already has a memory attached — the bookmark reads as active/accent rather than idle. */
  hasMemory?: boolean
  /** Disables the bookmark without hiding it — streaming, or another draft already open. */
  keepDisabled?: boolean
}

export function UserMessageActions({
  content,
  edited,
  showEdit = true,
  showResend = true,
  onEdit,
  onResend,
  onKeep,
  hasMemory,
  keepDisabled,
}: UserMessageActionsProps) {
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
    <div
      className={[
        'flex items-center justify-end gap-1.5 pr-1',
        // Hover-gated on pointer devices…
        'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
        // …but ALWAYS visible on touch. Without this the actions are unreachable on mobile.
        '[@media(hover:none)]:opacity-100',
      ].join(' ')}
    >
      {onKeep && (
        <ActionIconButton
          label={hasMemory ? 'Memory kept from this message' : 'Keep this as a memory'}
          active={hasMemory}
          disabled={keepDisabled}
          onClick={onKeep}
        >
          <Bookmark size={14} fill={hasMemory ? 'currentColor' : 'none'} />
        </ActionIconButton>
      )}
      {showEdit && edited && (
        <span className="mr-1.5 font-mono text-[10.5px] tracking-wide text-text-muted">Edited</span>
      )}
      {showEdit && onEdit && (
        <ActionIconButton label="Edit message" onClick={onEdit}>
          <Pencil size={14} />
        </ActionIconButton>
      )}
      <ActionIconButton label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </ActionIconButton>
      {showResend && onResend && (
        <ActionIconButton label="Send again" onClick={onResend}>
          <RefreshCw size={14} />
        </ActionIconButton>
      )}
    </div>
  )
}
