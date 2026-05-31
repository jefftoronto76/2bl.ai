'use client'

import { useRef, useEffect, KeyboardEvent, useState } from 'react'
import { useWidgetShell } from '@/services/chat/ui/v1/useWidgetShell'
import { useChatSessionContext } from '@/services/chat/ui/v1/core/ChatSessionProvider'
import { useKeyboardViewport } from '@/services/chat/ui/v1/core/useKeyboardViewport'
import { useReveal } from '@/services/shared/useReveal'
import { parseBookingCards } from '@/services/chat/ui/v1/parseBookingCards'
import { SageReply } from './sage/SageReply'
import { useSageParameters } from '@/services/chat/ui/v1/useSageParameters'

// NOTE: This file owns two surfaces — the in-page `#chat` anchor section
// and the full-viewport overlay. The overlay opens from the in-page `#chat`
// CTA and SectionProcess's "question" link — each calls `expand()` which
// flips `isExpanded` to true. Hero (the inline composer) is a separate,
// independent surface that does NOT use expand() and does NOT render this
// overlay. Hero and the overlay share conversation state (messages, sessionId,
// isStreaming, mode) via the shared session (useChatSession, instanceKey
// "sage"); the overlay open/close + shell mode live in the useWidgetShell store.

export function Chat() {
  const ref = useReveal()
  // Shell state (overlay open/close) lives in useWidgetShell; conversation state
  // comes from the shared session — Hero and this overlay are one conversation
  // via instanceKey "sage".
  const { isExpanded, expand, collapse } = useWidgetShell()
  const { messages, isStreaming, isError, mode, send, retry, setMode } = useChatSessionContext()

  const [input, setInput] = useState('')
  const sageParameters = useSageParameters()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // TEMP DIAGNOSTIC: `?debug=true&nolock=1` skips the body scroll-lock so we
  // can test whether the position:fixed lock is suppressing the iOS
  // visualViewport keyboard signal. Remove after diagnosis.
  const noLock =
    typeof window !== 'undefined' &&
    (() => {
      const p = new URLSearchParams(window.location.search)
      return p.get('debug') === 'true' && p.get('nolock') === '1'
    })()

  // Scroll lock: freezing the body with position:fixed (not just
  // overflow:hidden) stops iOS Safari from scrolling the document under the
  // overlay while the chat is open; the scroll position is restored on close.
  // The overlay's own keyboard handling is pure CSS (100dvh + safe-area
  // insets), so it consumes only the shared hook's scroll-lock —
  // trackViewport:false means no visualViewport listeners are attached here.
  useKeyboardViewport({
    active: isExpanded,
    lockBodyScroll: !noLock,
    trackViewport: false,
  })

  useEffect(() => {
    if (!isExpanded) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [messages, isExpanded])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        collapse()
      }
    }
    window.addEventListener('keydown', handleEscape as any)
    return () => window.removeEventListener('keydown', handleEscape as any)
  }, [isExpanded, collapse])

  // Mode bridge: the shell opens the overlay via expand('question')
  // (SectionProcess), which sets useWidgetShell.mode. Mirror that into the
  // shared session when the overlay opens so the greeting and /api/sage reflect
  // question mode. SectionProcess stays untouched.
  useEffect(() => {
    if (!isExpanded) return
    setMode(useWidgetShell.getState().mode)
  }, [isExpanded, setMode])

  const submit = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    send(text)
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <>
      {/* #chat anchor section — the green CTA opens the overlay via expand(). */}
      <section
        id="chat"
        style={{
          padding: '64px clamp(24px, 5vw, 48px)',
          borderBottom: '1px solid rgba(26,25,23,0.08)',
        }}
      >
        <div ref={ref} className="reveal" style={{ maxWidth: '640px' }}>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13.2px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'rgba(26,25,23,0.34)',
            marginBottom: '40px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}>
            Not Sure Yet?
            <span style={{
              flex: 1,
              height: '1px',
              background: 'rgba(26,25,23,0.1)',
              maxWidth: '120px',
              display: 'block',
            }} />
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 3.5vw, 48px)',
            fontWeight: 400,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            color: 'var(--color-text-primary)',
            marginBottom: '12px',
          }}>
            Ask first.<br /><em style={{ fontStyle: 'italic' }}>No commitment.</em>
          </h2>
          <p style={{
            fontSize: 'clamp(16px, 1.6vw, 17px)',
            lineHeight: 1.75,
            color: 'var(--color-text-muted)',
            fontWeight: 400,
            marginBottom: '40px',
          }}>
            This AI knows Jeff&apos;s background. It&apos;ll give you a straight answer about whether it&apos;s a fit.
          </p>

          <button
            onClick={() => expand()}
            style={{
              background: '#2d6a4f',
              color: 'white',
              border: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              padding: '16px 32px',
              cursor: 'pointer',
              marginBottom: '24px',
            }}
          >
            {messages.length > 0 ? 'Continue Conversation' : 'Start a Conversation'}
          </button>

          <div style={{
            paddingTop: '24px',
            borderTop: '1px solid rgba(26,25,23,0.08)',
          }}>
            <a
              href="#work"
              onClick={(e) => { e.preventDefault(); document.getElementById('work')?.scrollIntoView({ behavior: 'smooth' }) }}
              style={{
                display: 'inline-block',
                border: '1px solid rgba(26,25,23,0.15)',
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                padding: '14px 28px',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Book a Session
            </a>
          </div>
        </div>
      </section>

      {isExpanded && (
        <div className="fixed inset-0 z-[100] overflow-hidden bg-bg animate-[expandChat_0.3s_ease-out]">
          <div className="flex h-dvh min-h-0 flex-col">
            <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-black/[0.06] bg-bg/90 px-4 backdrop-blur-md backdrop-saturate-150 sm:px-8 [-webkit-backdrop-filter:saturate(180%)_blur(12px)]">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${isStreaming ? 'bg-accent' : 'bg-accent/35'}`}
                />
                <h1 className="font-display text-[22px] font-normal leading-none tracking-[-0.01em] text-[color:var(--color-text-primary)]">
                  Sage
                </h1>
              </div>
              <button
                onClick={collapse}
                aria-label="Close chat"
                className="flex h-11 w-11 items-center justify-center bg-transparent text-[color:var(--color-text-muted)]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-[clamp(24px,5vw,48px)]">
              <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-6">
                {messages.length === 0 && (
                  <div className="sage-animate max-w-[680px] border-l-2 border-accent/35 pl-4 [animation:sage-slide-up_0.28s_ease-out_both]">
                    <p className="mb-3 font-display font-normal leading-[1.15] tracking-[-0.01em] text-[color:var(--color-text-primary)] text-[clamp(26px,4vw,36px)]">
                      {mode === 'question' ? (
                        <>Ask me anything about <em className="italic">Jeff&apos;s work</em>.</>
                      ) : (
                        <>Hi, I&apos;m Sage. <em className="italic">What brings you here?</em></>
                      )}
                    </p>
                  </div>
                )}
                {messages.map((msg) => {
                  if (msg.role === 'assistant' && !msg.content) return null
                  if (msg.role === 'user') {
                    return (
                      <div key={msg.id} className="flex justify-end">
                        <p className="sage-visitor-msg sage-animate max-w-[560px] whitespace-pre-wrap text-right font-display text-[18px] italic leading-[1.5] text-[color:var(--color-text-muted)] [animation:sage-slide-up_0.24s_ease-out_both] [text-wrap:pretty]">
                          {msg.content}
                        </p>
                      </div>
                    )
                  }
                  const { prose, cards } = parseBookingCards(msg.content)
                  if (!prose && cards.length === 0) return null
                  return (
                    <SageReply
                      key={msg.id}
                      prose={prose}
                      cards={cards}
                      sageParameters={sageParameters}
                    />
                  )
                })}
                {isError && !isStreaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[70%] rounded-lg border border-black/[0.08] bg-surface p-4 font-body text-base leading-[1.7] text-[color:var(--color-text-primary)]">
                      Something went wrong. Please try again.
                      <button
                        onClick={() => retry()}
                        className="mt-3 block rounded-md border border-black/[0.15] bg-transparent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}
                {isStreaming && messages[messages.length - 1]?.content === '' && (
                  <div data-sage-streaming className="flex justify-start">
                    <div className="flex gap-1.5 rounded-lg border border-black/[0.08] bg-surface p-4">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-accent"
                          style={{ animation: `sage-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="flex-shrink-0 border-t border-black/[0.08] bg-surface px-4 pt-3 sm:px-12 pb-[max(12px,env(safe-area-inset-bottom))]">
              <div className="mx-auto flex max-w-[900px] items-center gap-3">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder=""
                  rows={1}
                  className="min-h-[48px] max-h-[120px] flex-1 resize-none rounded-xl border border-black/[0.12] bg-bg px-[18px] py-3.5 font-body text-base leading-[1.5] text-[color:var(--color-text-primary)] outline-none"
                />
                <button
                  onClick={submit}
                  disabled={isStreaming || !input.trim()}
                  aria-label="Send message"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-0 bg-accent text-xl text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                >
                  →
                </button>
              </div>
              <p className="mt-2 text-center font-body text-[11px] text-[color:var(--color-text-muted)]">
                Sage knows Jeff&apos;s background and will give you a straight answer.
              </p>
            </div>
          </div>
        </div>
      )}

    </>
  )
}
