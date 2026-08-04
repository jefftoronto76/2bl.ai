'use client';

/**
 * MemoryOffer — the guide asking, inline, whether to write the memory up.
 *
 * Appended under an assistant message when `offer` is set, and ONLY after that
 * message has finished streaming (offering mid-stream reads as an interruption).
 *
 * Fires at most once per conversation. "Not yet" disarms both this and the
 * automatic tool invocation permanently for that conversation.
 */

import { Bookmark } from 'lucide-react';

export function MemoryOffer({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="flex items-center gap-2 pl-11 motion-safe:animate-[hl-modal-in_.2s_ease]">
      <button
        onClick={onAccept}
        className="inline-flex items-center gap-[7px] rounded-full border border-accent bg-accent-soft px-[14px] py-[7px] font-body text-[12.5px] font-semibold text-accent [@media(hover:none)]:min-h-[44px]"
      >
        <Bookmark size={13} />
        Write it up
      </button>
      <button
        onClick={onDecline}
        className="rounded-full px-3 py-[7px] font-body text-[12.5px] text-text-tertiary [@media(hover:none)]:min-h-[44px]"
      >
        Not yet
      </button>
    </div>
  );
}
