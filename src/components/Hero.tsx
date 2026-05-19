'use client'

import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { useSageStore } from '../lib/store'
import { streamSageResponse } from '../lib/sage'
import { parseBookingCards } from './sage/parseBookingCards'
import { SageReply } from './sage/SageReply'
import { useSageParameters } from './sage/useSageParameters'

function detectModeFromLocation(): 'question' | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  const hashQueryStart = hash.indexOf('?')
  const hashParams =
    hashQueryStart >= 0 ? new URLSearchParams(hash.slice(hashQueryStart + 1)) : null
  const searchParams = new URLSearchParams(window.location.search)
  const value = hashParams?.get('mode') ?? searchParams.get('mode')
  return value === 'question' ? 'question' : null
}

export function Hero() {
  const {
    messages,
    isStreaming,
    sessionId,
    mode,
    addMessage,
    updateLastMessage,
    setStreaming,
    setSessionId,
    setMode,
    setComposerRef,
  } = useSageStore()

  const [input, setInput] = useState('')
  const [isError, setIsError] = useState(false)
  // Hero-local: when true the conversation canvas renders; toggled off by
  // the close-x and back on by textarea focus or a chip click. Independent
  // of isEngaged so the compact hero stays compact after dismissing.
  const [conversationVisible, setConversationVisible] = useState(true)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerWrapperRef = useRef<HTMLDivElement>(null)
  const retryMsgsRef = useRef<typeof messages>([])
  const retrySessionIdRef = useRef<string | null>(null)

  const sageParameters = useSageParameters()

  useEffect(() => {
    setComposerRef(textareaRef)
    return () => setComposerRef(null)
  }, [setComposerRef])

  useEffect(() => {
    if (detectModeFromLocation() === 'question') {
      setMode('question')
      requestAnimationFrame(() => {
        setTimeout(() => textareaRef.current?.focus({ preventScroll: false }), 60)
      })
    }
  }, [setMode])

  const isEngaged = messages.length > 0 && conversationVisible

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!conversationVisible) return
    if (messages.length === 0) return
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'end' })
    })
  }, [messages.length, conversationVisible])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
  }, [input])

  // iOS keyboard handling — composer offset only. Body lock lives on the
  // textarea's onFocus/onBlur handlers below so the lock cycle is tied to
  // actual user interaction, not to visualViewport timing. This effect just
  // keeps composer.style.bottom tracking the keyboard top on every vv event.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return

    const onViewportChange = () => {
      const composer = composerWrapperRef.current
      if (!composer) return
      const offset = window.innerHeight - vv.height - vv.offsetTop
      composer.style.bottom = `${Math.max(0, offset)}px`
    }

    vv.addEventListener('resize', onViewportChange)
    vv.addEventListener('scroll', onViewportChange)
    return () => {
      vv.removeEventListener('resize', onViewportChange)
      vv.removeEventListener('scroll', onViewportChange)
    }
  }, [])

  const handleComposerFocus = () => {
    setConversationVisible(true)
    document.body.style.position = 'fixed'
    document.body.style.width = '100%'
    document.body.style.top = `-${window.scrollY}px`
  }

  const handleChipClick = (text: string) => {
    setConversationVisible(true)
    send(text)
  }

  const handleComposerBlur = () => {
    const savedY = parseInt(document.body.style.top || '0') * -1
    document.body.style.position = ''
    document.body.style.width = ''
    document.body.style.top = ''
    window.scrollTo({ top: savedY, behavior: 'instant' as ScrollBehavior })
  }

  const send = async (override?: string) => {
    const text = (override ?? input).trim()
    if (!text || isStreaming) return

    setIsError(false)
    const userMsg = { role: 'user' as const, content: text }
    const msgsToSend = [...messages, { ...userMsg, id: `${Date.now()}`, timestamp: Date.now() }]
    addMessage(userMsg)
    if (override === undefined) setInput('')
    setStreaming(true)
    addMessage({ role: 'assistant', content: '' })

    let activeSessionId = sessionId
    if (!activeSessionId) {
      try {
        const res = await fetch('/api/sessions', { method: 'POST' })
        const data = await res.json()
        console.log('[Hero] POST /api/sessions status:', res.status, '| response:', JSON.stringify(data))
        if (data.id) {
          activeSessionId = data.id
          setSessionId(data.id)
        }
      } catch (err) {
        console.error('[Hero] POST /api/sessions failed:', err)
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
        .then((r) => r.json().then((d) => console.log('[Hero] PATCH /api/sessions status:', r.status, '| response:', JSON.stringify(d))))
        .catch((err) => console.error('[Hero] PATCH /api/sessions failed:', err))
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
        .then((r) => r.json().then((d) => console.log('[Hero] PATCH /api/sessions status:', r.status, '| response:', JSON.stringify(d))))
        .catch((err) => console.error('[Hero] PATCH /api/sessions failed:', err))
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <section
      id="hero"
      data-screen-label="Hero"
      className={isEngaged ? 'stage engaged' : 'stage'}
    >
      <div className="hero">
        <button
          type="button"
          className="close-x"
          aria-label="Collapse hero conversation"
          onClick={() => setConversationVisible(false)}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        <h1>
          Hi, I&apos;m <em>Jeff</em>.
        </h1>

        <p className="lede">
          I&apos;m an operator, a coach, and a builder. I help technology companies think clearly, develop their people, and grow in <em>ways that last</em>.
        </p>

        <p className="sage-line">
          I built <span className="hilite">Sage</span> to help you figure out if that&apos;s what you need.
        </p>
      </div>

      {conversationVisible && (
        <div className="hero-conversation flex flex-col gap-6" role="log" aria-live="polite">
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

          <div ref={messagesEndRef} className="messages-end" />
        </div>
      )}

      <div className="composer-wrap" ref={composerWrapperRef}>
        <div className="composer">
          <div className="row">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              onFocus={handleComposerFocus}
              onBlur={handleComposerBlur}
              placeholder={isEngaged ? "Keep going…" : "What's the situation you're trying to figure out?"}
              rows={1}
            />
            <button
              className="send"
              onClick={() => send()}
              disabled={!input.trim() || isStreaming}
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10L17 10M11 4L17 10L11 16"/>
              </svg>
            </button>
          </div>
          <div className="meta">
            <span className="left">
              <span className="ai-badge">
                <span className="dot"></span>
                SAGE·AI
              </span>
              <span>{isStreaming ? 'Thinking…' : isEngaged ? 'Live conversation' : <>Trained on Jeff&apos;s playbooks<span className="reply-time"> · Replies in ~5s</span></>}</span>
            </span>
            <span className="send-hint">↵ to send</span>
          </div>
        </div>

        {!isEngaged && (
          <div className="chips">
            <button className="chip" onClick={() => handleChipClick("Pipeline that won't convert")} disabled={isStreaming}>Pipeline that won&apos;t convert<span className="arr">→</span></button>
            <button className="chip" onClick={() => handleChipClick('Is this a fit for me?')} disabled={isStreaming}>Is this a fit for me?<span className="arr">→</span></button>
            <button className="chip" onClick={() => handleChipClick("A deal I can't lose")} disabled={isStreaming}>A deal I can&apos;t lose<span className="arr">→</span></button>
            <button className="chip" onClick={() => handleChipClick('What does "do better" mean?')} disabled={isStreaming}>What does &quot;do better&quot; mean?<span className="arr">→</span></button>
            <button className="chip" onClick={() => handleChipClick('What are companies getting wrong about AI?')} disabled={isStreaming}>What are companies getting wrong about AI?<span className="arr">→</span></button>
          </div>
        )}
      </div>

      <div className="scroll-hint-wrap">
        <div className="scroll-hint">
          <span>Scroll for background, principles, work ↓</span>
        </div>
      </div>
    </section>
  )
}
