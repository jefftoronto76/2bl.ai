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
 */

import { useState } from 'react'
import { Pencil, Copy, Check, RefreshCw } from 'lucide-react'
import { ActionIconButton } from './ActionIconButton'

export interface UserMessageActionsProps {
  content: string
  edited?: boolean
  onEdit: () => void
  onResend: () => void
}

export function UserMessageActions({ content, edited, onEdit, onResend }: UserMessageActionsProps) {
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
        'flex items-center justify-end gap-0.5 pr-1',
        // Hover-gated on pointer devices…
        'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
        // …but ALWAYS visible on touch. Without this the actions are unreachable on mobile.
        '[@media(hover:none)]:opacity-100',
      ].join(' ')}
    >
      {edited && (
        <span className="mr-1.5 font-mono text-[10.5px] tracking-wide text-text-muted">Edited</span>
      )}
      <ActionIconButton label="Edit message" onClick={onEdit}>
        <Pencil size={14} />
      </ActionIconButton>
      <ActionIconButton label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </ActionIconButton>
      <ActionIconButton label="Send again" onClick={onResend}>
        <RefreshCw size={14} />
      </ActionIconButton>
    </div>
  )
}
