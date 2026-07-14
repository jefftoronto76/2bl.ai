'use client';

import { Loader2, AlertTriangle } from 'lucide-react';

export type DeliveryState = 'sending' | 'sent' | 'failed';

export interface DeliveryStatusProps {
  status: DeliveryState;
  onRetry: () => void;
}

/**
 * Row rendered directly under a user message bubble. Renders nothing for
 * 'sent' — a persistent "sent" chip is noise once delivery succeeds.
 *
 * The bubble itself (not shown here) should additionally:
 *  - drop opacity to ~0.55 while status === 'sending'
 *  - add a danger-tinted 1px border + a one-time shake keyframe when status
 *    flips to 'failed'
 *  - make the whole bubble clickable to onRetry when status === 'failed'
 */
export function DeliveryStatus({ status, onRetry }: DeliveryStatusProps) {
  if (status === 'sent') return null;

  if (status === 'sending') {
    return (
      <div className="flex items-center gap-1.5 pr-1 font-mono text-[11px] tracking-wide text-text-muted">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Sending…
      </div>
    );
  }

  // status === 'failed'
  return (
    <button
      type="button"
      onClick={onRetry}
      className="flex items-center gap-1.5 pr-1 font-mono text-[11px] tracking-wide text-red-600 hover:text-red-500"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      Not delivered · Tap to retry
    </button>
  );
}
