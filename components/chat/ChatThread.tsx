'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createDefaultRegistry } from '@/services/chat/ui/v1/registry'
import type { MarkerParseResult, UIMessage } from '@/services/chat/ui/v1/types'

// One registry instance, shared across every ChatThread render — mirrors the
// module-level singleton pattern already used in parseBookingCards.ts.
const registry = createDefaultRegistry()

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
  isError: boolean
  retry: () => void

  renderUserMessage: (msg: UIMessage) => ReactNode
  renderAssistantMessage: (msg: UIMessage, parsed: MarkerParseResult) => ReactNode
  renderError: (retry: () => void) => ReactNode
  renderStreamingIndicator: () => ReactNode
  /** Caller-computed — each surface's "show the dots" trigger differs (e.g. gated on the last message being empty vs. a plain isLoading flag), so ChatThread does not derive this itself. */
  showStreamingIndicator: boolean

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
  isError,
  retry,
  renderUserMessage,
  renderAssistantMessage,
  renderError,
  renderStreamingIndicator,
  showStreamingIndicator,
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
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return renderUserMessage(msg)
        }
        // registry.parse('') is a harmless no-op ({ prose: '', markers: [] }),
        // so parsing unconditionally here (rather than pre-checking raw
        // content) changes nothing observable — each surface's render slot
        // still decides whether an empty result renders as null.
        const parsed = registry.parse(msg.content)
        return renderAssistantMessage(msg, parsed)
      })}
      {isError && !isStreaming && renderError(retry)}
      {showStreamingIndicator && renderStreamingIndicator()}
      <div ref={scrollAnchorRef} className={scrollAnchorClassName} />
    </>
  )
}
