'use client';

import { useState } from 'react';
import { Copy, RefreshCw, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton'; // adjust import path to match repo
import { FeedbackPopover, type FeedbackSentiment } from './FeedbackPopover';

export interface MessageActionsProps {
  content: string;
  stopped?: boolean;
  versionIdx: number;
  versionCount: number;
  rating: 'up' | 'down' | null;
  onCopy: () => void;
  onRegenerate: () => void;
  onVersionChange: (dir: -1 | 1) => void;
  onRate: (val: 'up' | 'down') => void;
  onFeedback: (reasons: string[], note: string) => void;
}

/**
 * Action row under a completed (non-streaming) assistant message.
 * Rendered at reduced opacity by default, full opacity on hover of the
 * message group — wrap the message + this row in one hoverable container
 * and toggle via CSS group-hover rather than local state where possible.
 */
export function MessageActions({
  content,
  stopped,
  versionIdx,
  versionCount,
  rating,
  onCopy,
  onRegenerate,
  onVersionChange,
  onRate,
  onFeedback,
}: MessageActionsProps) {
  const [popover, setPopover] = useState<FeedbackSentiment | null>(null);

  const clickThumb = (val: 'up' | 'down') => {
    if (rating === val) {
      onRate(val); // parent toggles off
      setPopover(null);
      return;
    }
    onRate(val);
    setPopover(val);
  };

  return (
    <div className="relative flex items-center gap-0.5 pl-11 opacity-50 transition-opacity group-hover:opacity-100">
      {stopped && <span className="mr-1 font-mono text-[10.5px] tracking-wide text-text-muted">Stopped</span>}

      <IconButton icon={Copy} size={14} aria-label="Copy" onClick={onCopy} />
      <IconButton icon={RefreshCw} size={14} aria-label="Regenerate response" onClick={onRegenerate} />

      {versionCount > 1 && (
        <>
          <IconButton
            icon={ChevronLeft}
            size={14}
            aria-label="Previous version"
            disabled={versionIdx === 0}
            onClick={() => onVersionChange(-1)}
          />
          <span className="min-w-[30px] text-center font-mono text-[11px] text-text-muted">
            {versionIdx + 1}/{versionCount}
          </span>
          <IconButton
            icon={ChevronRight}
            size={14}
            aria-label="Next version"
            disabled={versionIdx === versionCount - 1}
            onClick={() => onVersionChange(1)}
          />
        </>
      )}

      <span className="mx-1.5 h-3.5 w-px bg-border" />

      <IconButton
        icon={ThumbsUp}
        size={14}
        aria-pressed={rating === 'up'}
        aria-label="Good response"
        className={rating === 'up' ? 'text-accent' : undefined}
        onClick={() => clickThumb('up')}
      />
      <IconButton
        icon={ThumbsDown}
        size={14}
        aria-pressed={rating === 'down'}
        aria-label="Bad response"
        className={rating === 'down' ? 'text-red-600' : undefined}
        onClick={() => clickThumb('down')}
      />

      {popover && (
        <FeedbackPopover
          sentiment={popover}
          onClose={() => setPopover(null)}
          onSubmit={(reasons, note) => {
            onFeedback(reasons, note);
            setPopover(null);
          }}
        />
      )}
    </div>
  );
}
