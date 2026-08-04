'use client'

import { useRef, useEffect, KeyboardEvent, useState, type ReactNode } from 'react'
import { Square } from 'lucide-react'
import { useWidgetShell } from '@/services/chat/ui/v1/useWidgetShell'
import { useChatSessionContext } from '@/services/chat/ui/v1/core/ChatSessionProvider'
import { useKeyboardViewport } from '@/services/chat/ui/v1/core/useKeyboardViewport'
import { useReveal } from '@/services/shared/useReveal'
import { useSageParameters } from '@/services/chat/ui/v1/useSageParameters'
import { useMessageFeedback } from '@/services/chat/ui/v1/useMessageFeedback'
import { clearSession, clearDraft } from '@/services/chat/ui/v1/persistence'
import { ChatThread } from '@/components/chat/ChatThread'
import { DeliveryStatus } from '@/components/chat/DeliveryStatus'
import { MessageActions } from '@/components/chat/MessageActions'
import { ERROR_COPY } from '@/components/chat/errorCopy'
import { SageReply } from './sage/SageReply'
import { markdownComponents } from './sage/markdownComponents'
import type { ChatErrorType, MarkerParseResult, ParsedMarker, UIMessage } from '@/services/chat/ui/v1/types'
import type { BookingCardData, SageParameterPublic } from '@/services/chat/ui/v1/parseBookingCards'
import type { UseMessageFeedbackReturn } from '@/services/chat/ui/v1/useMessageFeedback'

// WidgetShellHero (the marketing hero's inline composer) and WidgetShellChat
// (the #chat anchor section + full-viewport overlay) are consolidated here
// because they share the singleton session (instanceKey "sage"), the same
// ChatThread wiring, and — for user/assistant/error/streaming rendering —
// byte-identical JSX. They remain two separate exports, called from the two
// original, non-adjacent positions in app/(jefflougheed)/page.tsx (Hero at
// the top, Chat's in-flow #chat section + fixed overlay near the bottom):
// merging them into one mounted component would move the #chat section's DOM
// position, a visible layout change. Each keeps its own unmodified
// useKeyboardViewport call — the two configurations are not centralized.
//
// PATCHED per handover-chat-widgets-main/README.md — visual/structural
// deltas from the June 2026 design pass, layered onto the unmodified real
// capability wiring (MessageActions/DeliveryStatus/regenerate/feedback/
// keyboard-viewport/mode-bridge all intact). Search "PATCH:" for each change.

function extractBookingCards(markers: ParsedMarker[]): BookingCardData[] {
  return markers
    .filter((m) => m.type === 'BOOKING')
    .map((m) => ({
      label: m.fields[0] ?? '',
      description: m.fields[1] ?? '',
      ctaLabel: m.fields[2] ?? '',
      url: m.fields[3] ?? '',
    }))
}

interface AssistantMessageContext {
  messages: UIMessage[]
  isStreaming: boolean
  regenerate: (id: string) => void
  setActiveVersion: (id: string, versionIdx: number) => void
  feedback: UseMessageFeedbackReturn
}

function makeRenderAssistantMessage(sageParameters: SageParameterPublic[], ctx: AssistantMessageContext) {
  return function renderAssistantMessage(msg: UIMessage, parsed: MarkerParseResult, markdown: ReactNode) {
    const cards = extractBookingCards(parsed.markers)
    if (!parsed.prose && cards.length === 0) return null

    const messageIndex = ctx.messages.findIndex((m) => m.id === msg.id)
    const isLast = ctx.messages[ctx.messages.length - 1]?.id === msg.id
    const isActive = ctx.isStreaming && isLast
    const versions = msg.versions ?? []
    const versionIdx = msg.versionIdx ?? 0
    const { rating } = ctx.feedback.getFeedback(messageIndex)

    return (
      <div key={msg.id} className="group">
        <SageReply
          prose={parsed.prose}
          markdown={markdown}
          cards={cards}
          sageParameters={sageParameters}
        />
        {!isActive && (
          // PATCH: added msg-action-ink (globals.css.patch.css) as a hard
          // escape hatch on top of the card-level dark-ink token re-scope —
          // belt-and-suspenders, see README §9.
          <div className="mt-1 pl-4 msg-action-ink">
            <MessageActions
              content={msg.content}
              stopped={msg.stopped}
              versionIdx={versionIdx}
              versionCount={versions.length}
              onRegenerate={isLast ? () => ctx.regenerate(msg.id) : undefined}
              onVersionChange={(dir) => ctx.setActiveVersion(msg.id, versionIdx + dir)}
              rating={rating}
              onRate={(val) => ctx.feedback.rate(messageIndex, val)}
              onFeedback={(reasons, note) => ctx.feedback.submitFeedback(messageIndex, reasons, note)}
            />
          </div>
        )}
      </div>
    )
  }
}

function makeRenderUserMessage(retry: () => void) {
  return function renderUserMessage(msg: UIMessage): ReactNode {
    const status = msg.status ?? 'sent'
    return (
      <div key={msg.id} className="flex flex-col items-end gap-1">
        <div className={status === 'failed' ? 'chat-bubble-shake' : undefined}>
          <p
            onClick={status === 'failed' ? retry : undefined}
            className={[
              'sage-visitor-msg sage-animate max-w-[560px] whitespace-pre-wrap text-right font-display text-[18px] italic leading-[1.5] text-[color:var(--color-text-muted)] [animation:sage-slide-up_0.24s_ease-out_both] [text-wrap:pretty]',
              status === 'sending' ? 'opacity-55' : '',
              status === 'failed' ? 'cursor-pointer rounded-md border border-red-400/60 px-2 py-1' : '',
            ].filter(Boolean).join(' ')}
          >
            {msg.content}
          </p>
        </div>
        <DeliveryStatus status={status} onRetry={retry} />
      </div>
    )
  }
}

function renderError(retry: () => void, errorType: ChatErrorType): ReactNode {
  return (
    <div className="flex justify-start">
      <div className="max-w-[70%] rounded-lg border border-[color:var(--color-border)] bg-surface p-4 font-body text-base leading-[1.7] text-[color:var(--color-text-primary)]">
        {ERROR_COPY[errorType]}
        <button
          onClick={() => retry()}
          className="relative mt-3 block rounded-md border border-[color:var(--color-border-hover)] bg-transparent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text-muted)] before:absolute before:content-[''] before:-inset-[10px]"
        >
          Retry
        </button>
      </div>
    </div>
  )
}

function renderStreamingIndicator(): ReactNode {
  return (
    <div data-sage-streaming className="flex justify-start">
      <div className="flex gap-1.5 rounded-lg border border-[color:var(--color-border)] bg-surface p-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-accent"
            style={{ animation: `sage-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  )
}

// ── WidgetShellChat — the in-page #chat anchor section + the full-viewport overlay ──

export function WidgetShellChat() {
  const ref = useReveal()
  const { isExpanded, expand, collapse } = useWidgetShell()
  const { messages, sessionId, isStreaming, errorType, mode, send, retry, stop, regenerate, setActiveVersion, setMode, reset } =
    useChatSessionContext()
  const feedback = useMessageFeedback(sessionId)

  const [input, setInput] = useState('')
  const sageParameters = useSageParameters()

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const startNewConversation = () => {
    if (!window.confirm('Start a new conversation? This clears the current chat.')) return
    void (sessionId ? clearSession('sage', sessionId) : clearDraft('sage'))
    reset()
  }

  useKeyboardViewport({
    active: isExpanded,
    lockBodyScroll: true,
    trackViewport: false,
  })

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        collapse()
      }
    }
    window.addEventListener('keydown', handleEscape as any)
    return () => window.removeEventListener('keydown', handleEscape as any)
  }, [isExpanded, collapse])

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

  const renderAssistantMessage = makeRenderAssistantMessage(sageParameters, {
    messages,
    isStreaming,
    regenerate,
    setActiveVersion,
    feedback,
  })
  const renderUserMessage = makeRenderUserMessage(retry)

  return (
    <>
      {/* PATCH: #chat anchor section now uses className="chat-cta" (custom
          CSS, see globals.css.patch.css) instead of inline styles — copy
          unchanged, sizing/padding/colors differ (README §8). */}
      <section id="chat" className="chat-cta" data-screen-label="Chat CTA">
        <div className="container">
          <div ref={ref} className="reveal chat-cta-inner">
            <p className="eyebrow">Not Sure Yet?</p>
            <h2 className="display" style={{ marginBottom: 12 }}>
              Ask first.<br /><em>No commitment.</em>
            </h2>
            <p className="chat-cta-body">
              This AI knows Jeff&apos;s background. It&apos;ll give you a straight answer about whether it&apos;s a fit.
            </p>
            <button className="chat-cta-btn" onClick={() => expand()}>
              {messages.length > 0 ? 'Continue Conversation' : 'Start a Conversation'}
            </button>
            <div className="chat-cta-secondary-wrap">
              <a
                href="#work"
                className="chat-cta-secondary"
                onClick={(e) => { e.preventDefault(); document.getElementById('work')?.scrollIntoView({ behavior: 'smooth' }) }}
              >
                Book a Session
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* PATCH: overlay chrome now uses custom classes (chat-overlay-*) —
          same DOM shape, README §8. Overlay composer (below) now reuses the
          shared .composer component instead of a bespoke Tailwind bar —
          README §7. */}
      {isExpanded && (
        <div className="chat-overlay">
          <div className="chat-overlay-inner">
            <header className="chat-overlay-header">
              <div className="chat-overlay-title">
                <span aria-hidden className={'chat-overlay-dot' + (isStreaming ? ' live' : '')} />
                <h1>Sage</h1>
              </div>
              <div className="chat-overlay-actions">
                {messages.length > 0 && (
                  <button className="new-convo-pill" onClick={startNewConversation}>
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M3 10a7 7 0 1 1 2 5M3 10V5m0 5h5"/>
                    </svg>
                    New chat
                  </button>
                )}
                <button className="chat-overlay-close" aria-label="Close chat" onClick={collapse}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </header>

            <div className="chat-overlay-scroll">
              <div
                className="chat-overlay-log"
                role="log"
                aria-live="polite"
                aria-label="Conversation"
                aria-atomic="false"
                aria-busy={isStreaming}
              >
                {messages.length === 0 && (
                  <div className="chat-overlay-greeting sage-animate [animation:sage-slide-up_0.28s_ease-out_both]">
                    <p>
                      {mode === 'question' ? (
                        <>Ask me anything about <em>Jeff&apos;s work</em>.</>
                      ) : (
                        <>Hi, I&apos;m Sage. <em>What brings you here?</em></>
                      )}
                    </p>
                  </div>
                )}
                <ChatThread
                  messages={messages}
                  isStreaming={isStreaming}
                  errorType={errorType}
                  retry={retry}
                  renderUserMessage={renderUserMessage}
                  renderAssistantMessage={renderAssistantMessage}
                  renderError={renderError}
                  renderStreamingIndicator={renderStreamingIndicator}
                  showStreamingIndicator={isStreaming && messages[messages.length - 1]?.content === ''}
                  markdownComponents={markdownComponents}
                  scrollBehavior="instant"
                  scrollDeps={[messages, isExpanded]}
                  scrollGuard={() => isExpanded}
                  scrollBlock="end"
                  scrollAnchorClassName="messages-end"
                />
              </div>

              <div className="chat-overlay-composer">
                <div className="composer" style={{ maxWidth: 900, margin: '0 auto' }}>
                  <div className="row">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder={messages.length > 0 ? 'Keep going…' : "What's the situation you're trying to figure out?"}
                      rows={1}
                    />
                    {isStreaming ? (
                      <button className="send" onClick={stop} aria-label="Stop generating">
                        <Square size={15} fill="currentColor" />
                      </button>
                    ) : (
                      <button className="send" onClick={submit} disabled={!input.trim()} aria-label="Send">
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 10L17 10M11 4L17 10L11 16"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="meta">
                    <span className="left">
                      <span className="ai-badge"><span className="dot" />SAGE·AI</span>
                      <span>{isStreaming ? 'Thinking…' : messages.length > 0 ? 'Live conversation' : <>Trained on Jeff&apos;s playbooks<span className="reply-time"> · Replies in ~5s</span></>}</span>
                    </span>
                    {messages.length > 0 && (
                      <button type="button" className="new-convo-link" onClick={startNewConversation}>
                        <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                          <path d="M3 10a7 7 0 1 1 2 5M3 10V5m0 5h5"/>
                        </svg>
                        New conversation
                      </button>
                    )}
                    <span className="send-hint">↵ to send</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── WidgetShellHero — the chat-first hero's inline composer ──

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

export function WidgetShellHero() {
  const { setComposerRef } = useWidgetShell()
  const { messages, sessionId, isStreaming, errorType, send, retry, stop, regenerate, setActiveVersion, setMode, reset } =
    useChatSessionContext()
  const feedback = useMessageFeedback(sessionId)

  const startNewConversation = () => {
    if (!window.confirm('Start a new conversation? This clears the current chat.')) return
    void (sessionId ? clearSession('sage', sessionId) : clearDraft('sage'))
    reset()
  }

  const [input, setInput] = useState('')
  // PATCH: conversationVisible now starts true (June's default) — was false
  // on main. Combined with the §3 close-button change, the conversation
  // canvas can only ever mount once messages exist, so the starting value
  // only matters pre-engagement and has no visible effect either way; kept
  // for parity with the design source.
  const [conversationVisible, setConversationVisible] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerWrapperRef = useRef<HTMLDivElement>(null)
  const chatSurfaceRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
  }, [input])

  const { keyboardOpen, sync: syncViewport } = useKeyboardViewport({
    keyboardThreshold: 120,
    onViewportChange: ({ height, offsetTop }) => {
      const surface = chatSurfaceRef.current
      if (surface) {
        surface.style.setProperty('--kb-surface-h', `${height}px`)
        surface.style.setProperty('--kb-surface-y', `${offsetTop}px`)
      }
    },
  })

  const handleComposerFocus = () => {
    setConversationVisible(true)
    syncViewport()
  }

  const submit = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    send(text)
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const renderAssistantMessage = makeRenderAssistantMessage(sageParameters, {
    messages,
    isStreaming,
    regenerate,
    setActiveVersion,
    feedback,
  })
  const renderUserMessage = makeRenderUserMessage(retry)

  return (
    <section
      id="hero"
      data-screen-label="Hero"
      className={isEngaged ? 'stage engaged' : 'stage'}
    >
      <div className="hero">
        {/* PATCH (README §3): was an always-mounted className="close-x"
            button (position absolute top/right, CSS-driven opacity fade).
            Now conditionally rendered only while engaged, inline-styled,
            bottom/right. */}
        {isEngaged && (
          <button
            type="button"
            onClick={() => setConversationVisible(false)}
            aria-label="Collapse conversation"
            style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 36, height: 36, borderRadius: '50%',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}

        <p className="eyebrow">Coach · Operator · Builder</p>

        <h1>
          Hi, I&apos;m <em>Jeff</em>.
        </h1>

        <p className="lede">
          I help technology companies and the people who drive them think clearly, develop their capabilities, and grow in ways that last.
        </p>

        <p className="sage-line">
          I built <span className="hilite">Sage</span> to help you figure out if that&apos;s what you need.
        </p>
      </div>

      <div
        className={keyboardOpen ? 'chat-surface chat-surface--kb' : 'chat-surface'}
        ref={chatSurfaceRef}
      >
      {conversationVisible && messages.length > 0 && (
        <div
          className="hero-conversation flex flex-col gap-6"
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          aria-atomic="false"
          aria-busy={isStreaming}
        >
          <ChatThread
            messages={messages}
            isStreaming={isStreaming}
            errorType={errorType}
            retry={retry}
            renderUserMessage={renderUserMessage}
            renderAssistantMessage={renderAssistantMessage}
            renderError={renderError}
            renderStreamingIndicator={renderStreamingIndicator}
            showStreamingIndicator={isStreaming && messages[messages.length - 1]?.content === ''}
            markdownComponents={markdownComponents}
            scrollBehavior="instant"
            scrollDeps={[messages.length, conversationVisible]}
            useRaf
            scrollBlock="end"
            scrollGuard={() => conversationVisible && messages.length > 0}
            scrollAnchorClassName="messages-end"
          />
        </div>
      )}

      <div className="composer-wrap" ref={composerWrapperRef}>
        {/* PATCH (README §6): added composer--sage-glow accent class. */}
        <div className="composer composer--sage-glow">
          <div className="row">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              onFocus={handleComposerFocus}
              placeholder={isEngaged ? "Keep going…" : "What's the situation you're trying to figure out?"}
              rows={1}
            />
            {isStreaming ? (
              <button className="send" onClick={stop} aria-label="Stop generating">
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button className="send" onClick={submit} disabled={!input.trim()} aria-label="Send">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10L17 10M11 4L17 10L11 16"/>
                </svg>
              </button>
            )}
          </div>
          <div className="meta">
            <span className="left">
              <span className="ai-badge">
                <span className="dot"></span>
                SAGE·AI
              </span>
              <span>{isStreaming ? 'Thinking…' : isEngaged ? 'Live conversation' : <>Trained on Jeff&apos;s playbooks<span className="reply-time"> · Replies in ~5s</span></>}</span>
            </span>
            {isEngaged && (
              <button type="button" className="new-convo-link" onClick={startNewConversation}>
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M3 10a7 7 0 1 1 2 5M3 10V5m0 5h5"/>
                </svg>
                New conversation
              </button>
            )}
            <span className="send-hint">↵ to send</span>
          </div>
        </div>
      </div>
      </div>
    </section>
  )
}
