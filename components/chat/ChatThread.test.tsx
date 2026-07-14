// components/chat/ChatThread.test.tsx
//
// Behavior contract for scroll anchoring:
//   1. Auto-scrolls to bottom on new messages while the viewer is at/near
//      the bottom (default, unscrolled state).
//   2. Stops auto-scrolling once the viewer scrolls more than 100px away
//      from the bottom — a new message must not yank them back down.
//   3. Resumes auto-scrolling once the viewer scrolls back within 100px of
//      the bottom.
//   4. A container with no scrollable ancestor (no overflow-y: auto/scroll
//      found) falls back to always-scrolling — today's behavior.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'
import { ChatThread } from './ChatThread'
import type { UIMessage } from '@/services/chat/ui/v1/types'

afterEach(() => cleanup())

function makeMessage(id: string, content: string): UIMessage {
  return { id, role: 'assistant', content, timestamp: Date.now() }
}

function mockScrollMetrics(
  el: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  Object.defineProperty(el, 'scrollHeight', { value: metrics.scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: metrics.clientHeight, configurable: true })
  Object.defineProperty(el, 'scrollTop', {
    value: metrics.scrollTop,
    configurable: true,
    writable: true,
  })
}

const noop = () => {}
const renderNull = () => null

function Harness({
  messages,
  containerStyle,
}: {
  messages: UIMessage[]
  containerStyle?: React.CSSProperties
}) {
  return (
    <div data-testid="scroll-container" style={{ overflowY: 'auto', ...containerStyle }}>
      <ChatThread
        messages={messages}
        isStreaming={false}
        isError={false}
        retry={noop}
        renderUserMessage={renderNull}
        renderAssistantMessage={(msg) => <p key={msg.id}>{msg.content}</p>}
        renderError={renderNull}
        renderStreamingIndicator={renderNull}
        showStreamingIndicator={false}
        scrollBehavior="instant"
        scrollDeps={[messages]}
      />
    </div>
  )
}

describe('ChatThread scroll anchoring', () => {
  it('auto-scrolls on new messages by default (never scrolled)', () => {
    const { rerender, getByTestId } = render(<Harness messages={[makeMessage('1', 'hi')]} />)
    const container = getByTestId('scroll-container')
    const scrollIntoView = vi.fn()
    container.querySelector('div:last-child')!.scrollIntoView = scrollIntoView

    rerender(<Harness messages={[makeMessage('1', 'hi'), makeMessage('2', 'again')]} />)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('stops auto-scrolling once the viewer scrolls away from the bottom', () => {
    const { rerender, getByTestId } = render(<Harness messages={[makeMessage('1', 'hi')]} />)
    const container = getByTestId('scroll-container')
    const scrollIntoView = vi.fn()
    container.querySelector('div:last-child')!.scrollIntoView = scrollIntoView

    // Scroll up so the distance from the bottom exceeds the 100px threshold.
    mockScrollMetrics(container, { scrollHeight: 1000, clientHeight: 400, scrollTop: 200 })
    fireEvent.scroll(container)

    rerender(<Harness messages={[makeMessage('1', 'hi'), makeMessage('2', 'again')]} />)

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('resumes auto-scrolling once the viewer scrolls back within 100px of the bottom', () => {
    const { rerender, getByTestId } = render(<Harness messages={[makeMessage('1', 'hi')]} />)
    const container = getByTestId('scroll-container')
    const scrollIntoView = vi.fn()
    container.querySelector('div:last-child')!.scrollIntoView = scrollIntoView

    mockScrollMetrics(container, { scrollHeight: 1000, clientHeight: 400, scrollTop: 200 })
    fireEvent.scroll(container)
    rerender(<Harness messages={[makeMessage('1', 'hi'), makeMessage('2', 'again')]} />)
    expect(scrollIntoView).not.toHaveBeenCalled()

    // Scroll back within 100px of the bottom (1000 - 400 = 600 max scrollTop).
    mockScrollMetrics(container, { scrollHeight: 1000, clientHeight: 400, scrollTop: 590 })
    fireEvent.scroll(container)
    rerender(<Harness messages={[makeMessage('1', 'hi'), makeMessage('2', 'again'), makeMessage('3', 'third')]} />)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('falls back to always-scrolling when no overflow-y ancestor is found', () => {
    function NoContainerHarness({ messages }: { messages: UIMessage[] }) {
      return (
        <ChatThread
          messages={messages}
          isStreaming={false}
          isError={false}
          retry={noop}
          renderUserMessage={renderNull}
          renderAssistantMessage={(msg) => <p key={msg.id}>{msg.content}</p>}
          renderError={renderNull}
          renderStreamingIndicator={renderNull}
          showStreamingIndicator={false}
          scrollBehavior="instant"
          scrollDeps={[messages]}
        />
      )
    }

    const { rerender, container } = render(<NoContainerHarness messages={[makeMessage('1', 'hi')]} />)
    const anchor = container.querySelector('div:last-child')!
    const scrollIntoView = vi.fn()
    anchor.scrollIntoView = scrollIntoView

    rerender(<NoContainerHarness messages={[makeMessage('1', 'hi'), makeMessage('2', 'again')]} />)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })
})
