'use client'

import { useRef, useEffect, KeyboardEvent, useState } from 'react'
import { useSageStore } from '../lib/store'
import { streamSageResponse } from '../lib/sage'
import { useReveal } from '@/hooks/useReveal'
import { parseBookingCards } from './sage/parseBookingCards'
import { SageReply } from './sage/SageReply'
import { useSageParameters } from './sage/useSageParameters'

// NOTE: This file owns two surfaces — the in-page `#chat` anchor section
// and the full-viewport overlay. The overlay opens from the Nav "CHAT"
// link, the in-page `#chat` CTA, and Work's "Click here" — each calls
// `expand()` which flips `isExpanded` to true. Hero (src/components/Hero.tsx)
// is a separate, independent inline chat that does NOT use expand() and does
// NOT render this overlay. Hero and the overlay share session state
// (messages, sessionId, isStreaming, mode) via useSageStore.

export function Chat() {
  const ref = useReveal()
  const {
    messages,
    isExpanded,
    isStreaming,
    sessionId,
    mode,
    expand,
    collapse,
    addMessage,
    updateLastMessage,
    setStreaming,
    setSessionId,
  } = useSageStore()

  const [input, setInput] = useState('')
  const [isError, setIsError] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const sageParameters = useSageParameters()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const retryMsgsRef = useRef<typeof messages>([])
  const retrySessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isExpanded])

  useEffect(() => {
    if (!isExpanded) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [messages, isExpanded])

  useEffect(() => {
    if (!isExpanded) return
    const vv = window.visualViewport
    if (!vv) return
    const onViewportChange = () => {
      if (!overlayRef.current) return
      overlayRef.current.style.top = `${vv.offsetTop}px`
      overlayRef.current.style.height = `${vv.height}px`
      setKeyboardOpen(vv.height < window.screen.height * 0.75)
    }
    vv.addEventListener('resize', onViewportChange)
    vv.addEventListener('scroll', onViewportChange)
    return () => {
      vv.removeEventListener('resize', onViewportChange)
      vv.removeEventListener('scroll', onViewportChange)
    }
  }, [isExpanded])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        collapse()
      }
    }
    window.addEventListener('keydown', handleEscape as any)
    return () => window.removeEventListener('keydown', handleEscape as any)
  }, [isExpanded, collapse])

  const send = async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    setIsError(false)
    const userMsg = { role: 'user' as const, content: text }
    const msgsToSend = [...messages, { ...userMsg, id: `${Date.now()}`, timestamp: Date.now() }]
    addMessage(userMsg)
    setInput('')
    setStreaming(true)
    addMessage({ role: 'assistant', content: '' })

    let activeSessionId = sessionId
    if (!activeSessionId) {
      try {
        const res = await fetch('/api/sessions', { method: 'POST' })
        const data = await res.json()
        console.log('[Chat] POST /api/sessions status:', res.status, '| response:', JSON.stringify(data))
        if (data.id) {
          activeSessionId = data.id
          setSessionId(data.id)
        }
      } catch (err) {
        console.error('[Chat] POST /api/sessions failed:', err)
      }
    }

    retryMsgsRef.current = msgsToSend
    retrySessionIdRef.current = activeSessionId

    try {
      await streamSageResponse(msgsToSend, (chunk: string) => {
        updateLastMessage(chunk)
      }, { mode, sessionId: activeSessionId })
    } catch (error) {
      updateLastMessage('')
      setIsError(true)
      setStreaming(false)
      return
    }
    setStreaming(false)

    if (activeSessionId) {
      const { messages: finalMessages, visitorName } = useSageStore.getState()
      fetch(`/api/sessions/${activeSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: finalMessages, visitorName }),
      })
        .then((r) => r.json().then((d) => console.log('[Chat] PATCH /api/sessions status:', r.status, '| response:', JSON.stringify(d))))
        .catch((err) => console.error('[Chat] PATCH /api/sessions failed:', err))
    }
  }

  const retryLastSend = async () => {
    if (isStreaming) return
    setIsError(false)
    setStreaming(true)
    updateLastMessage('')

    try {
      await streamSageResponse(retryMsgsRef.current, (chunk: string) => {
        updateLastMessage(chunk)
      }, { mode, sessionId: retrySessionIdRef.current })
    } catch (error) {
      updateLastMessage('')
      setIsError(true)
      setStreaming(false)
      return
    }
    setStreaming(false)

    const activeSessionId = retrySessionIdRef.current
    if (activeSessionId) {
      const { messages: finalMessages, visitorName } = useSageStore.getState()
      fetch(`/api/sessions/${activeSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: finalMessages, visitorName }),
      })
        .then((r) => r.json().then((d) => console.log('[Chat] PATCH /api/sessions status:', r.status, '| response:', JSON.stringify(d))))
        .catch((err) => console.error('[Chat] PATCH /api/sessions failed:', err))
    }
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
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
        <div ref={overlayRef} style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '100dvh',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgb(var(--color-bg))',
          animation: 'expandChat 0.3s ease-out',
          transition: 'height 0.3s ease, top 0.3s ease',
        }}>
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

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'clamp(24px, 5vw, 48px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}>
            <div style={{
              maxWidth: '900px',
              width: '100%',
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              flex: 1,
            }}>
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
                      onClick={retryLastSend}
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
                onClick={send}
                disabled={isStreaming || !input.trim()}
                aria-label="Send message"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-0 bg-accent text-xl text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                →
              </button>
            </div>
            <p
              className="mt-2 text-center font-body text-[11px] text-[color:var(--color-text-muted)] transition-opacity duration-300"
              style={{ opacity: keyboardOpen ? 0 : 1 }}
            >
              Sage knows Jeff&apos;s background and will give you a straight answer.
            </p>
          </div>
        </div>
      )}

    </>
  )
}
