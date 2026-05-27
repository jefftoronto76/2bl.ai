'use client'

import { useEffect, useRef, useState } from 'react'
import {
  LinkedinShareButton,
  TwitterShareButton,
  WhatsappShareButton,
  EmailShareButton,
} from 'react-share'

const SHARE_MESSAGE = 'Worth knowing about if you work in tech: jefflougheed.ca'
const EMAIL_SUBJECT = "Thought you'd find this useful"
const EMAIL_BODY =
  "Worth a look if you're in tech or building something: jefflougheed.ca"

const ROW =
  'flex w-full items-center gap-3 rounded-lg border-0 bg-transparent px-4 py-3 text-left font-body text-[15px] text-[color:var(--color-text-primary)] cursor-pointer transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent'

type ShareModalProps = {
  open: boolean
  onClose: () => void
}

export function ShareModal({ open, onClose }: ShareModalProps) {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Resolve the live URL on the client (and refresh whenever the modal opens).
  useEffect(() => {
    if (typeof window !== 'undefined') setUrl(window.location.href)
  }, [open])

  // Escape-to-close + move focus into the dialog while it is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — leave the UI unchanged.
    }
  }

  return (
    <div
      aria-hidden={!open}
      onClick={onClose}
      className={`fixed inset-0 z-[100] flex items-end justify-center p-0 transition-opacity duration-200 sm:items-center sm:p-4 ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Share this page"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full rounded-t-2xl border border-[color:var(--color-border)] bg-surface p-5 shadow-xl outline-none transition-all duration-200 sm:max-w-sm sm:rounded-2xl ${
          open
            ? 'translate-y-0 scale-100'
            : 'translate-y-4 sm:translate-y-0 sm:scale-95'
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[18px] text-[color:var(--color-text-primary)]">
            Share
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent text-[20px] leading-none text-[color:var(--color-text-muted)] transition-colors hover:bg-accent/10 hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            &times;
          </button>
        </div>

        <div className="flex flex-col">
          <LinkedinShareButton
            url={url}
            title={SHARE_MESSAGE}
            summary={SHARE_MESSAGE}
            resetButtonStyle={false}
            className={ROW}
          >
            LinkedIn
          </LinkedinShareButton>

          <TwitterShareButton
            url={url}
            title={SHARE_MESSAGE}
            resetButtonStyle={false}
            className={ROW}
          >
            Twitter / X
          </TwitterShareButton>

          <WhatsappShareButton
            url={url}
            title={SHARE_MESSAGE}
            separator=" "
            resetButtonStyle={false}
            className={ROW}
          >
            WhatsApp
          </WhatsappShareButton>

          <EmailShareButton
            url=""
            subject={EMAIL_SUBJECT}
            body={EMAIL_BODY}
            separator=""
            resetButtonStyle={false}
            className={ROW}
          >
            Email
          </EmailShareButton>

          <button
            type="button"
            onClick={handleCopy}
            className={`${ROW} ${copied ? 'text-accent' : ''}`}
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  )
}
