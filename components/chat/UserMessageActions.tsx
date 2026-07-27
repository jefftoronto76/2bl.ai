'use client'

/**
 * UserMessageActions — Edit / Copy / Send again on the visitor's own
 * messages. Renders BELOW the user bubble, right-aligned, at reduced opacity
 * by default and full opacity on hover of the message group — never fully
 * hidden, matching the "nothing important is hover-only" rule the assistant
 * action row (MessageActions.tsx) already follows, so the row is reachable on
 * touch without a separate `hover: none` media-query carve-out.
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
    <div className="flex items-center justify-end gap-0.5 pr-1 opacity-60 transition-opacity group-hover:opacity-100">
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
