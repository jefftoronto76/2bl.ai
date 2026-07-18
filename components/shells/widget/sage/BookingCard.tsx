'use client'

import { useRef, useState } from 'react'
import type { BookingCardData, OpenAs } from '@/services/chat/ui/v1/parseBookingCards'

interface BookingCardProps extends BookingCardData {
  openAs: OpenAs
  embedCode: string | null
}

// Injects an embed snippet into a target element, re-materializing <script>
// tags so they execute (setting innerHTML alone does NOT execute scripts).
function injectInlineEmbed(target: HTMLElement, embedCode: string): void {
  const trimmed = embedCode.trim()
  if (!trimmed) return

  const hasScriptTag = /<script[\s>]/i.test(trimmed)
  if (!hasScriptTag) {
    const script = document.createElement('script')
    script.text = trimmed
    target.appendChild(script)
    return
  }

  const temp = document.createElement('div')
  temp.innerHTML = trimmed
  Array.from(temp.childNodes).forEach(node => {
    if (node.nodeType !== 1) {
      target.appendChild(node.cloneNode(true))
      return
    }
    if (node.nodeName === 'SCRIPT') {
      const original = node as HTMLScriptElement
      const script = document.createElement('script')
      if (original.src) {
        script.src = original.src
        script.async = original.async
        script.defer = original.defer
      } else {
        script.text = original.textContent ?? ''
      }
      for (const attr of Array.from(original.attributes)) {
        if (attr.name !== 'src' && attr.name !== 'async' && attr.name !== 'defer') {
          script.setAttribute(attr.name, attr.value)
        }
      }
      target.appendChild(script)
    } else if (node.nodeName === 'LINK') {
      document.head.appendChild(node.cloneNode(true))
    } else {
      target.appendChild(node.cloneNode(true))
    }
  })
}

// TODO(hero-chat-first): inline embed container is min-h-[700px] which can
// push the page when rendered inside the hero. Revisit lazy-loading or
// new-tab default once we have real-world QA.
export function BookingCard({ label, description, ctaLabel, url, openAs, embedCode }: BookingCardProps) {
  const inlineRef = useRef<HTMLDivElement>(null)
  const [inlineOpen, setInlineOpen] = useState(false)

  const effectiveOpenAs: OpenAs =
    openAs === 'popup' && (!embedCode || embedCode.trim().length === 0) ? 'new_tab' : openAs

  const handleInlineClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (!embedCode) {
      console.warn('[BookingCard] inline selected but embed_code missing — falling back to new tab')
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    if (inlineOpen) return
    const target = inlineRef.current
    if (!target) return
    console.log('[BookingCard] injecting inline embed for', label || url)
    setInlineOpen(true)
    try {
      injectInlineEmbed(target, embedCode)
    } catch (err) {
      console.error('[BookingCard] inline embed injection failed — falling back to new tab:', err)
      setInlineOpen(false)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  if (openAs === 'popup' && (!embedCode || embedCode.trim().length === 0)) {
    console.warn('[BookingCard] inline requested without embed_code for', label || url)
  }

  const buttonClass =
    'mt-3 inline-block rounded-md bg-accent px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-[color:var(--color-surface)] no-underline hover:opacity-90'

  return (
    <div className="w-full">
      <div className="w-full rounded-lg border border-[color:var(--color-border)] bg-surface p-4 shadow-sm">
        <p className="m-0 font-body text-base font-semibold text-[color:var(--color-text-primary)]">{label}</p>
        {description && (
          <p className="mt-1 mb-0 font-body text-sm text-[color:var(--color-text-muted)]">{description}</p>
        )}
        {effectiveOpenAs === 'popup' ? (
          <button
            type="button"
            onClick={handleInlineClick}
            disabled={inlineOpen}
            className={`${buttonClass} cursor-pointer border-0 disabled:opacity-50`}
          >
            {ctaLabel || 'Book'}
          </button>
        ) : url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass}>
            {ctaLabel || 'Book'}
          </a>
        ) : null}
      </div>
      {effectiveOpenAs === 'new_tab' && (
        <p className="mt-2 m-0 font-body text-xs text-[color:var(--color-text-muted)]">
          Heads up — clicking the button will open in a new tab to complete your booking.
        </p>
      )}
      <div
        ref={inlineRef}
        aria-hidden={!inlineOpen}
        className={`mt-2 w-full min-h-[700px] ${inlineOpen ? 'block' : 'hidden'}`}
      />
    </div>
  )
}
