import { describe, it, expect } from 'vitest';
import { chatReducer, initialState, type ChatState, type Message } from './chatReducer';

function msg(role: 'user' | 'assistant', content: string): Message {
  return { id: crypto.randomUUID(), role, content, timestamp: new Date() };
}

// A mid-conversation state: messages sent, a real session assigned, sidebar
// expanded, panel open, a turn in flight.
const activeState: ChatState = {
  messages: [msg('user', 'Tell me about heirlooms'), msg('assistant', 'Gladly.')],
  hasStarted: true,
  isSidebarExpanded: true,
  isLoading: true,
  isChatOpen: true,
  sessionId: 'sess-123',
};

describe('chatReducer — RESET (New Chat)', () => {
  it('clears the conversation back to the empty-greeting state', () => {
    const next = chatReducer(activeState, { type: 'RESET' });
    expect(next.messages).toEqual([]);
    expect(next.hasStarted).toBe(false);
    expect(next.isLoading).toBe(false);
    expect(next.sessionId).toBeNull();
  });

  it('preserves UI chrome (sidebar + panel open state)', () => {
    const next = chatReducer(activeState, { type: 'RESET' });
    expect(next.isSidebarExpanded).toBe(true);
    expect(next.isChatOpen).toBe(true);
  });

  it('is a no-op on already-empty state (idempotent)', () => {
    const next = chatReducer(initialState, { type: 'RESET' });
    expect(next).toEqual(initialState);
  });

  it('does not mutate the input state', () => {
    const snapshot = JSON.parse(JSON.stringify(activeState));
    chatReducer(activeState, { type: 'RESET' });
    expect(JSON.parse(JSON.stringify(activeState))).toEqual(snapshot);
  });
});
