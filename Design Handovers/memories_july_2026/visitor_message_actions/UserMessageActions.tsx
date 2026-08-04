'use client';

/**
 * UserMessageActions — Edit / Copy / Send again on the visitor's own messages.
 *
 * Renders BELOW the user bubble, right-aligned. Hover-gated on pointer devices,
 * always visible on touch (see the group-hover + hover-none rules below).
 *
 * Mount rule: only when status is 'sent'. During 'sending' / 'failed' the
 * DeliveryStatus row owns this slot — the two must never render together.
 */

import { Pencil, Copy, RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';

export type UserMessageActionsProps = {
  edited?: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onResend: () => void;
};

export function UserMessageActions({ edited, onEdit, onCopy, onResend }: UserMessageActionsProps) {
  return (
    <div
      className={[
        'flex items-center gap-px pr-0.5',
        // hover-gated on pointer devices…
        'opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100',
        // …but ALWAYS visible on touch. Without this the actions are unreachable on mobile.
        '[@media(hover:none)]:opacity-100',
      ].join(' ')}
    >
      {edited && (
        <span className="mr-1.5 font-mono text-[10.5px] tracking-[0.06em] text-text-tertiary">
          Edited
        </span>
      )}
      <IconButton icon={Pencil} size={14} aria-label="Edit message" onClick={onEdit} />
      <IconButton icon={Copy} size={14} aria-label="Copy" onClick={onCopy} />
      <IconButton icon={RefreshCw} size={14} aria-label="Send again" onClick={onResend} />
    </div>
  );
}
