// components/chat/ChatThread.test.tsx
//
// Smoke coverage for the shared buffered-markdown pipeline: a settled
// assistant message renders full markdown through the caller-supplied
// components map, while the message actively being streamed into holds
// back an incomplete trailing token until it resolves.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ChatThread } from './ChatThread';
import type { UIMessage } from '@/services/chat/ui/v1/types';

afterEach(cleanup);

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
