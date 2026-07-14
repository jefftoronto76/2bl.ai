// components/chat/ChatThread.test.tsx
//
// Two independent behavior contracts for the shared ChatThread component:
//   1. Buffered markdown — a settled assistant message renders full markdown
//      through the caller-supplied components map, while the message
//      actively being streamed into holds back an incomplete trailing token
//      until it resolves.
//   2. Scroll anchoring — auto-scrolls to bottom on new messages while the
//      viewer is at/near the bottom, stops once they scroll away, resumes
//      once they scroll back within range, and falls back to
//      always-scrolling when no overflow-y ancestor is found.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { ChatThread } from './ChatThread';
import type { UIMessage } from '@/services/chat/ui/v1/types';

afterEach(() => cleanup());

// ── Buffered markdown ───────────────────────────────────────────────────────

function msg(role: 'user' | 'assistant', content: string, id = crypto.randomUUID()): UIMessage {
  return { id, role, content, timestamp: 0 };
}

const testMarkdownComponents = {
  strong: ({ children }: any) => <strong data-testid="bold">{children}</strong>,
}

function renderThread(messages: UIMessage[], isStreaming: boolean) {
  return render(
    <ChatThread
      messages={messages}
      isStreaming={isStreaming}
      isError={false}
      retry={() => {}}
      renderUserMessage={(m) => <div key={m.id}>{m.content}</div>}
      renderAssistantMessage={(m, _parsed, markdown) => (
        <div key={m.id} data-testid="assistant-msg">
          {markdown}
        </div>
      )}
      renderError={() => null}
      renderStreamingIndicator={() => null}
      showStreamingIndicator={false}
      markdownComponents={testMarkdownComponents}
      scrollBehavior="instant"
      scrollDeps={[messages, isStreaming]}
    />,
  );
}

describe('ChatThread markdown rendering', () => {
  it('renders complete markdown for a settled assistant message', () => {
    renderThread([msg('assistant', 'Here is **bold** text.')], false);
    expect(screen.getByTestId('bold')).toHaveTextContent('bold');
  });

  it('does not render an unclosed bold token on the actively-streaming last message', () => {
    renderThread([msg('assistant', "Here's **bold text still typing")], true);
    expect(screen.queryByTestId('bold')).toBeNull();
    expect(screen.getByTestId('assistant-msg')).not.toHaveTextContent('bold text still typing');
  });

  it('renders full content once the message is no longer the one being streamed', () => {
    renderThread([msg('assistant', "Here's **bold text still typing", 'a'), msg('assistant', 'And a second one.', 'b')], true);
    // Only the LAST message is actively streaming — the first is settled and
    // should render in full even though its bold run never closed within
    // this fixture (an edge case, but it demonstrates `active` is scoped to
    // the last message only, not every assistant message).
    expect(screen.getAllByTestId('assistant-msg')[0]).toHaveTextContent('bold text still typing');
  });
});

// ── Scroll anchoring ─────────────────────────────────────────────────────────

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
