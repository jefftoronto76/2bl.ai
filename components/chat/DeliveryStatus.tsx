'use client'

import { Loader2, AlertTriangle } from 'lucide-react'

export type DeliveryState = 'sending' | 'sent' | 'failed'

export interface DeliveryStatusProps {
  status: DeliveryState
  onRetry: () => void
}

/**
 * Row rendered directly under a right-aligned user message bubble. Renders
 * nothing for 'sent' — a persistent "sent" chip is noise once delivery
 * succeeds.
 *
 * The bubble itself (not owned here) should additionally, while this row is
 * visible:
 *  - drop opacity to ~0.55 while status === 'sending'
 *  - add a red-400 border + the shared `.chat-bubble-shake` class (see
 *    app/globals.css) once, on the transition into status === 'failed'
 *  - be clickable to onRetry when status === 'failed'
 */
export function DeliveryStatus({ status, onRetry }: DeliveryStatusProps) {
  if (status === 'sent') return null

  if (status === 'sending') {
    return (
      <div className="flex items-center justify-end gap-1.5 pr-1 font-mono text-[11px] tracking-wide text-text-muted">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Sending…
      </div>
    )
  }

  // status === 'failed'
  return (
    <button
      type="button"
      onClick={onRetry}
      className="relative ml-auto flex items-center justify-end gap-1.5 pr-1 font-mono text-[11px] tracking-wide text-red-400 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent before:absolute before:inset-x-0 before:-inset-y-4 before:content-['']"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      Not delivered · Tap to retry
    </button>
  )
}
