'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { createDefaultRegistry } from '@/services/chat/ui/v1/registry'
import { useBufferedMarkdown } from '@/services/chat/ui/v1/useBufferedMarkdown'
import type { MarkerParseResult, UIMessage } from '@/services/chat/ui/v1/types'

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
  components: Components
}) {
  const buffered = useBufferedMarkdown(content, active)
  if (!buffered) return null
  return <ReactMarkdown components={components}>{buffered}</ReactMarkdown>
}

export interface ChatThreadProps {
  messages: UIMessage[]
  isStreaming: boolean
  isError: boolean
  retry: () => void

  renderUserMessage: (msg: UIMessage) => ReactNode
  renderAssistantMessage: (msg: UIMessage, parsed: MarkerParseResult, markdown: ReactNode) => ReactNode
  renderError: (retry: () => void) => ReactNode
  renderStreamingIndicator: () => ReactNode
  /** Caller-computed — each surface's "show the dots" trigger differs (e.g. gated on the last message being empty vs. a plain isLoading flag), so ChatThread does not derive this itself. */
  showStreamingIndicator: boolean
  /** react-markdown components map for the assistant prose — each surface owns its own styling (widget's markdownComponents.tsx vs. membership's warm-prose set). */
  markdownComponents: Components

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
  markdownComponents,
  scrollBehavior,
  scrollDeps,
  useRaf = false,
  scrollBlock,
  scrollGuard,
  scrollAnchorClassName,
}: ChatThreadProps) {
  const scrollAnchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollGuard && !scrollGuard()) return
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
        return renderAssistantMessage(msg, parsed, markdown)
      })}
      {isError && !isStreaming && renderError(retry)}
      {showStreamingIndicator && renderStreamingIndicator()}
      <div ref={scrollAnchorRef} className={scrollAnchorClassName} />
    </>
  )
}
