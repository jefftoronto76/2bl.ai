'use client'

/**
 * EditableUserBubble — the user bubble in its editing state, swapped in place
 * of the read-state bubble (same position) so nothing jumps when editing
 * starts. Shared by both chat surfaces (Heirloom's MessageList.tsx and
 * jefflougheed's WidgetShell.tsx) — bg-surface, the border classes, and
 * text-text-primary all resolve to each brand's own tokens via its own CSS
 * cascade, so this one component renders correctly on both without any
 * per-brand branching.
 *
 * Per docs/spec_visitor_bubble.md's "editing" state: 15.5px/1.62 type ramp
 * (matches the read-state bubble so text doesn't reflow on the swap), 18px
 * radius with a 5px tail (same as read state), border-border-hover (the
 * spec's "border-border-strong" doesn't exist as a token in this repo — this
 * reuses the existing --color-border-hover CSS var via an arbitrary value),
 * 12px padding on all sides, max-width widened to 86% (more room to type
 * than the read state's 76% measure).
 *
 * Enter saves · Shift+Enter newline · Esc cancels.
 */

import { useEffect, useRef, useState } from 'react'

export interface EditableUserBubbleProps {
  initialValue: string
  onCancel: () => void
  onSave: (text: string) => void
}

// Mirrors the composer's auto-grow cap (components/shells/membership/ChatInput.tsx).
const MAX_HEIGHT_PX = 200

export function EditableUserBubble({ initialValue, onCancel, onSave }: EditableUserBubbleProps) {
  const [draft, setDraft] = useState(initialValue)
  const ref = useRef<HTMLTextAreaElement>(null)

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    autoResize(el)
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    // Only on mount — subsequent resizes are driven by onChange below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = () => {
    const trimmed = draft.trim()
    // No-op when unchanged or empty — must not truncate or re-deliver.
    if (!trimmed || trimmed === initialValue) {
      onCancel()
      return
    }
    onSave(trimmed)
  }

  return (
    <div className="flex w-full max-w-[86%] flex-col gap-2 rounded-[18px] rounded-br-[5px] border border-[rgb(var(--color-border-hover))] bg-surface p-3">
      <textarea
        ref={ref}
        rows={1}
        value={draft}
        onChange={e => {
          setDraft(e.target.value)
          autoResize(e.target)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            save()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        className="w-full resize-none overflow-hidden border-none bg-transparent p-0 font-body text-[15.5px] leading-[1.62] text-text-primary outline-none"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="relative rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-text-muted transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent before:absolute before:content-[''] before:-inset-y-2 before:-inset-x-1"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!draft.trim()}
          className="relative rounded-md bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-background hover:bg-accent-hover disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent before:absolute before:content-[''] before:-inset-y-2 before:-inset-x-1"
        >
          Send
        </button>
      </div>
    </div>
  )
}
