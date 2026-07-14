'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { createDefaultRegistry } from '@/services/chat/ui/v1/registry'
import { useBufferedMarkdown } from '@/services/chat/ui/v1/useBufferedMarkdown'
import type { ChatErrorType, MarkerParseResult, UIMessage } from '@/services/chat/ui/v1/types'

// One registry instance, shared across every ChatThread render — mirrors the
// module-level singleton pattern already used in parseBookingCards.ts.
const registry = createDefaultRegistry()

// A real component (not a bare hook call inside .map) so useBufferedMarkdown
// stays legal under the Rules of Hooks — every instance calls it exactly
// once in its own render. `active` gates buffering to only the message
// currently being streamed into; settled messages render in full.
function BufferedMarkdown({
  content,
  active,
  components,
}: {
  content: string
  active: boolean
  components?: Components
}) {
  const buffered = useBufferedMarkdown(content, active)
  if (!buffered) return null
  // components is optional — omitting it falls through to react-markdown's
  // own default HTML element rendering (plain, unstyled bold/lists/links),
  // so a caller gets basic markdown for free without owning a styling map.
  return <ReactMarkdown components={components}>{buffered}</ReactMarkdown>
}

// Distance from the bottom of the scroll container, in pixels, still
// considered "at the bottom" for auto-scroll purposes.
const NEAR_BOTTOM_PX = 100

// ChatThread renders a Fragment, not its own scrollable element — each caller
// (the widget-shell overlay, the Hero inline composer, Heirloom's MessageList)
// owns its own overflow-y-auto container around ChatThread's output. Walk up
// from the bottom anchor to find it rather than threading a new ref prop
// through every call site.
function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const overflowY = window.getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
}

export interface ChatThreadProps {
  messages: UIMessage[]
  isStreaming: boolean
  /** Classified reason the most recent turn failed, or null when it succeeded. */
  errorType: ChatErrorType | null
  retry: () => void

  renderUserMessage: (msg: UIMessage) => ReactNode
  renderAssistantMessage: (msg: UIMessage, parsed: MarkerParseResult, markdown: ReactNode) => ReactNode
  renderError: (retry: () => void, errorType: ChatErrorType) => ReactNode
  renderStreamingIndicator: () => ReactNode
  /** Caller-computed — each surface's "show the dots" trigger differs (e.g. gated on the last message being empty vs. a plain isLoading flag), so ChatThread does not derive this itself. */
  showStreamingIndicator: boolean
  /** react-markdown components map for the assistant prose — each surface owns its own styling (widget's markdownComponents.tsx vs. membership's warm-prose set). Optional: omit for react-markdown's default (unstyled) HTML rendering. */
  markdownComponents?: Components

  scrollBehavior: 'instant' | 'smooth'
  /**
   * Dependency array for the scroll-to-bottom effect, passed through verbatim
   * from the caller so each surface's existing re-scroll triggers (which
   * differ) are preserved exactly.
   */
  scrollDeps: unknown[]
  /** Chat.tsx/membership scroll immediately; Hero.tsx wraps in rAF. Default false. */
  useRaf?: boolean
  /** Only Hero.tsx passes 'end' today; the others rely on the browser default ('start'). */
  scrollBlock?: ScrollLogicalPosition
  /** Reproduces a surface's early-return guard (e.g. Hero skips scrolling while its conversation panel is hidden). Checked before every scroll; no guard = always scroll. */
  scrollGuard?: () => boolean
  /** Hero.tsx's anchor carries `.messages-end` (scroll-margin-bottom, app/(jefflougheed)/globals.css). The others have no class. */
  scrollAnchorClassName?: string
}

export function ChatThread({
  messages,
  isStreaming,
  errorType,
  retry,
  renderUserMessage,
  renderAssistantMessage,
  renderError,
  renderStreamingIndicator,
  showStreamingIndicator,
  markdownComponents,
  scrollBehavior,
  scrollDeps,
  useRaf = false,
  scrollBlock,
  scrollGuard,
  scrollAnchorClassName,
}: ChatThreadProps) {
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  // Whether the viewer is anchored to the bottom of the scroll container.
  // Starts true so first-mount / never-scrolled behavior is unchanged; flips
  // false once the viewer scrolls away from the bottom by more than
  // NEAR_BOTTOM_PX, and back to true once they scroll back within it.
  const isNearBottomRef = useRef(true)

  // Screen-reader announcement text, throttled independently of the visible
  // streaming render so the aria-live container doesn't fire once per chunk.
  // Commits immediately when the turn completes, otherwise at most once per
  // second while still streaming.
  const [announcedText, setAnnouncedText] = useState('')
  const latestProseRef = useRef('')
  const announceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    latestProseRef.current =
      lastMessage?.role === 'assistant' ? registry.parse(lastMessage.content).prose : ''

    if (!isStreaming) {
      if (announceTimeoutRef.current) {
        clearTimeout(announceTimeoutRef.current)
        announceTimeoutRef.current = null
      }
      setAnnouncedText(latestProseRef.current)
      return
    }

    if (announceTimeoutRef.current) return
    announceTimeoutRef.current = setTimeout(() => {
      announceTimeoutRef.current = null
      setAnnouncedText(latestProseRef.current)
    }, 1000)
  }, [messages, isStreaming])

  useEffect(() => {
    return () => {
      if (announceTimeoutRef.current) clearTimeout(announceTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const container = findScrollContainer(scrollAnchorRef.current)
    if (!container) return
    const handleScroll = () => {
      isNearBottomRef.current = isNearBottom(container)
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (scrollGuard && !scrollGuard()) return
    if (!isNearBottomRef.current) return
    const scrollToAnchor = () => {
      scrollAnchorRef.current?.scrollIntoView({
        behavior: scrollBehavior as ScrollBehavior,
        ...(scrollBlock ? { block: scrollBlock } : {}),
      })
    }
    if (useRaf) {
      requestAnimationFrame(scrollToAnchor)
    } else {
      scrollToAnchor()
    }
    // scrollDeps is caller-supplied (not a literal array), so exhaustive-deps
    // can't verify it — each surface's existing re-scroll triggers differ and
    // are passed through verbatim on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, scrollDeps)

  return (
    <>
      {messages.map((msg, index) => {
        if (msg.role === 'user') {
          return renderUserMessage(msg)
        }
        // registry.parse('') is a harmless no-op ({ prose: '', markers: [] }),
        // so parsing unconditionally here (rather than pre-checking raw
        // content) changes nothing observable — each surface's render slot
        // still decides whether an empty result renders as null.
        const parsed = registry.parse(msg.content)
        // Only the last message while streaming is still being appended to
        // — every earlier (settled) message renders in full, unbuffered.
        const active = isStreaming && index === messages.length - 1
        const markdown = (
          <BufferedMarkdown content={parsed.prose} active={active} components={markdownComponents} />
        )
        const rendered = renderAssistantMessage(msg, parsed, markdown)
        return active ? (
          <div aria-live="off" key={msg.id}>
            {rendered}
          </div>
        ) : (
          rendered
        )
      })}
      <span className="sr-only">{announcedText}</span>
      {errorType && !isStreaming && renderError(retry, errorType)}
      {showStreamingIndicator && renderStreamingIndicator()}
      <div ref={scrollAnchorRef} className={scrollAnchorClassName} />
    </>
  )
}
