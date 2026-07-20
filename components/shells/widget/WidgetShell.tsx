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

    // Suppress actions on the message currently being streamed into — same
    // "active" condition ChatThread computes internally, derived here from
    // data already in scope rather than a ChatThread prop. Regenerate is
    // scoped to the latest assistant message only (see MessageActions.tsx).
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
          <div className="mt-1 pl-4">
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
        {/* Shake lives on this wrapper (not the <p>) so it doesn't collide
            with the <p>'s own entrance-animation `animation` shorthand. */}
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

  // Scroll lock: freezing the body with position:fixed (not just
  // overflow:hidden) stops iOS Safari from scrolling the document under the
  // overlay while the chat is open; the scroll position is restored on close.
  // Keyboard handling is pure CSS (h-dvh + safe-area insets, see the overlay
  // className below) — app/layout.tsx's interactiveWidget: 'resizes-content'
  // is what makes dvh shrink correctly on keyboard-open on both iOS Safari
  // and Android Chrome, so no JS-computed height is needed here. Mirrors
  // components/shells/membership/ChatHero.tsx's overlay fix (same pattern,
  // applied there first).
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
      {/* #chat anchor section — the green CTA opens the overlay via expand(). */}
      <section
        id="footerchat"
        style={{
          padding: '64px 0',
          borderBottom: '1px solid rgba(26,25,23,0.08)',
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 clamp(24px, 5vw, 48px)' }}>
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
              fontSize: '16px',
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
        </div>
      </section>

      {isExpanded && (
        <div id="sage-chat-overlay" className="fixed inset-0 z-[100] overflow-hidden bg-[rgb(var(--color-bg))] animate-[expandChat_0.3s_ease-out]">
          <div className="flex h-dvh min-h-0 flex-col">
            <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-[color:var(--color-border)] bg-[rgb(var(--color-bg)/0.9)] px-4 backdrop-blur-md backdrop-saturate-150 sm:px-8 [-webkit-backdrop-filter:saturate(180%)_blur(12px)]">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${isStreaming ? 'bg-accent' : 'bg-accent/35'}`}
                />
                <h1 className="font-display text-[22px] font-normal leading-none tracking-[-0.01em] text-[color:var(--color-text-primary)]">
                  Sage
                </h1>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    onClick={startNewConversation}
                    className="new-convo-pill"
                  >
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M3 10a7 7 0 1 1 2 5M3 10V5m0 5h5"/>
                    </svg>
                    New chat
                  </button>
                )}
                <button
                  onClick={collapse}
                  aria-label="Close chat"
                  className="relative flex h-11 w-11 items-center justify-center bg-transparent text-[color:var(--color-text-muted)] before:absolute before:inset-[-2px] before:content-['']"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
              <div
                className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-6 p-[clamp(24px,5vw,48px)] pr-[clamp(32px,7vw,64px)]"
                role="log"
                aria-live="polite"
                aria-label="Conversation"
                aria-atomic="false"
                aria-busy={isStreaming}
              >
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
                />
              </div>

              {/* Sticky inside the scroll container, not a flex sibling after
                  it — composer-inside-scroll-container pattern (Claude.ai/
                  ChatGPT), mirrors the fix already applied to Heirloom's
                  MessageList. */}
              <div className="sticky bottom-0 border-t border-[color:var(--color-border)] bg-surface px-4 pt-3 sm:px-12 pb-[max(12px,env(safe-area-inset-bottom))]">
                <div className="mx-auto flex max-w-[900px] items-center gap-3">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder=""
                    rows={1}
                    className="min-h-[48px] max-h-[120px] flex-1 resize-none rounded-xl border border-[color:var(--color-border)] bg-[rgb(var(--color-bg))] px-[18px] py-3.5 font-body text-base leading-[1.5] text-[color:var(--color-text-primary)] outline-none"
                  />
                  {isStreaming ? (
                    <button
                      onClick={stop}
                      aria-label="Stop generating"
                      className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-0 bg-accent text-[color:var(--color-surface)] transition-opacity before:absolute before:inset-[-2px] before:content-['']"
                    >
                      <Square size={16} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      onClick={submit}
                      disabled={!input.trim()}
                      aria-label="Send message"
                      className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-0 bg-accent text-xl text-[color:var(--color-surface)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40 before:absolute before:inset-[-2px] before:content-['']"
                    >
                      →
                    </button>
                  )}
                </div>
                <p className="mt-2 text-center font-body text-[11px] text-[color:var(--color-text-muted)]">
                  Sage knows Jeff&apos;s background and will give you a straight answer.
                </p>
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
  // Conversation state comes from the shared session — Hero and the Chat
  // overlay drive ONE conversation via instanceKey "sage". Only setComposerRef
  // is shell state and lives in useWidgetShell.
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
  // Hero-local: when true the conversation canvas renders; toggled off by
  // the close-x and back on by textarea focus. Independent of isEngaged so
  // the compact hero stays compact after dismissing.
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

  // iOS keyboard handling. Syncs the chat surface to the visual viewport: when
  // the keyboard opens, visualViewport.height shrinks and offsetTop grows — we
  // mirror both onto the surface CSS vars (height + a compositor translateY, no
  // transition) so the surface exactly covers the visible area above the
  // keyboard. keyboardOpen flips the surface from display:contents to a fixed
  // flex box (CSS, mobile only). On desktop vv.height never drops, so
  // keyboardOpen stays false and nothing changes. The visualViewport plumbing
  // (listener lifecycle, SSR guards, threshold) lives in the shared hook; this
  // surface deliberately runs it WITHOUT body scroll-lock (position:fixed on the
  // body breaks iOS keyboard detection in this inline context).
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
    syncViewport() // prime the surface before the first vv event lands
    // No body scroll-lock: on iOS, body { position: fixed } collapses
    // window.innerHeight to the visual-viewport height and injects a
    // visualViewport.offsetTop, which breaks keyboard detection and floats the
    // composer. The .chat-surface--kb fixed overlay masks the page instead.
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
      id="herochat"
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
      {conversationVisible && (
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
        <div className="composer">
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
