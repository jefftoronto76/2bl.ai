'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export type FeedbackSentiment = 'up' | 'down'

const REASONS: Record<FeedbackSentiment, string[]> = {
  up: ['Felt personal', 'Great question', 'Nice pacing', 'Other'],
  down: ['Too generic', 'Off tone', 'Repetitive', 'Missed the point', 'Other'],
}

export interface FeedbackPopoverProps {
  sentiment: FeedbackSentiment
  onClose: () => void
  onSubmit: (reasons: string[], note: string) => void
}

/**
 * Reason-chip picker shown after either thumb is tapped. Absolutely
 * positioned by the caller (MessageActions renders it inside a `relative`
 * wrapper); this component only owns its own contents + dismissal.
 *
 * On mount, scrolls the nearest scrollable ancestor so this popover is
 * actually visible — in a long conversation it can otherwise render below
 * the fold with no indication anything happened. Doesn't rely on the
 * transcript's bottom-pinned auto-scroll, since that only fires on new
 * messages/loading state, not on this local open state.
 */
export function FeedbackPopover({ sentiment, onClose, onSubmit }: FeedbackPopoverProps) {
  const [reasons, setReasons] = useState<string[]>([])
  const [note, setNote] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)

    const raf = requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      let node: HTMLElement | null = el.parentElement
      let container: HTMLElement | null = null
      while (node) {
        const style = getComputedStyle(node)
        if (node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(style.overflowY)) {
          container = node
          break
        }
        node = node.parentElement
      }
      if (!container) return
      const elRect = el.getBoundingClientRect()
      const contRect = container.getBoundingClientRect()
      if (elRect.bottom > contRect.bottom) container.scrollTop += elRect.bottom - contRect.bottom + 16
      else if (elRect.top < contRect.top) container.scrollTop -= contRect.top - elRect.top + 16
    })

    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      cancelAnimationFrame(raf)
    }
  }, [onClose])

  const toggle = (r: string) =>
    setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))

  return (
    <div
      ref={ref}
      className="absolute left-11 top-full z-10 mt-1 w-[340px] rounded-2xl border border-border bg-surface p-3 shadow-2xl"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-text-primary/10 hover:text-text-primary before:absolute before:content-[''] before:-inset-3"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <span className="block pr-5 font-mono text-[10.5px] uppercase tracking-wide text-text-muted">
        {sentiment === 'up' ? 'What worked?' : 'What went wrong?'}
      </span>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {REASONS[sentiment].map((r) => {
          const active = reasons.includes(r)
          return (
            <button
              key={r}
              type="button"
              onClick={() => toggle(r)}
              className={
                active
                  ? 'relative rounded-full border border-accent bg-accent/10 px-2.5 py-1.5 text-[12.5px] font-medium text-accent before:absolute before:content-[\'\'] before:-inset-[3px]'
                  : 'relative rounded-full border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-text-muted hover:border-text-primary/30 before:absolute before:content-[\'\'] before:-inset-[3px]'
              }
            >
              {r}
            </button>
          )
        })}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add detail (optional)"
        rows={2}
        className="mt-2 w-full resize-none rounded-lg border border-border bg-bg p-2 text-base text-text-primary outline-none"
      />

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="relative rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-text-muted before:absolute before:content-[''] before:-inset-y-2 before:-inset-x-1"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => onSubmit(reasons, note)}
          className="relative rounded-md bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-background hover:bg-accent-hover before:absolute before:content-[''] before:-inset-y-2 before:-inset-x-1"
        >
          Send feedback
        </button>
      </div>
    </div>
  )
}
