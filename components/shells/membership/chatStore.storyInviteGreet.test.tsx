// Coverage for the one-time contextual auto-greet (story-invite-first-run,
// 2026-08-10): when a story invite resolves a title + inviter name,
// chatStore.tsx's autoGreetSentRef effect sends a richer hidden message
// instead of the bare "Hi", so the AI's first message can reference the
// actual story and inviter. The plain "Hi" path (the pre-existing
// members.auto_open flow, no story invite involved) must be completely
// unchanged.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { __resetPersistenceForTests } from '@/services/chat/ui/v1/persistence';

vi.mock('@/services/auth/client', () => ({
  useAuthUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useAuthActions: () => ({
    signOut: vi.fn(),
    openSignIn: vi.fn(),
    openSignUp: vi.fn(),
    openUserProfile: vi.fn(),
  }),
}));

vi.mock('@/services/auth/useAuthFlow', () => ({
  useAuthFlow: () => ({
    stage: 'idle',
    contactType: null,
    contactValue: '',
    flowType: null,
    error: null,
    sendEmail: vi.fn(),
    sendPhone: vi.fn(),
    verifyOtp: vi.fn(),
    resend: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('@/services/auth/supabase', () => ({
  createClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function streamResponse(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

let capturedSageBody: string | null = null;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';

  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url === '/api/sessions' && method === 'POST') return jsonResponse({ id: 'sess-1' });
  if (url === '/api/sage' && method === 'POST') {
    capturedSageBody = init?.body as string;
    return streamResponse('ok');
  }
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  return jsonResponse({ ok: true });
});

beforeEach(async () => {
  await __resetPersistenceForTests('heirloom');
  capturedSageBody = null;
  fetchMock.mockClear();
  __clearSingletonRegistry();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function lastSentMessageContent(): string {
  expect(capturedSageBody).toBeTruthy();
  const body = JSON.parse(capturedSageBody as string) as { messages: Array<{ role: string; content: string }> };
  return body.messages[body.messages.length - 1].content;
}

describe('story-invite auto-greet', () => {
  it('sends a contextual hidden greet referencing the story title and inviter when a story invite resolved', async () => {
    render(
      <ChatProvider
        autoOpenChat
        storyInviteToken="tok-abc"
        storyInviteStoryTitle="Grandma's Recipes"
        storyInviteInviterName="Jane Doe"
      >
        <div />
      </ChatProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sage', expect.anything()), { timeout: 2000 });

    const content = lastSentMessageContent();
    expect(content).toContain("Grandma's Recipes");
    expect(content).toContain('Jane Doe');
    expect(content).not.toBe('Hi');
  });

  it('still sends the plain "Hi" for the pre-existing auto_open case with no story invite', async () => {
    render(
      <ChatProvider autoOpenChat>
        <div />
      </ChatProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sage', expect.anything()), { timeout: 2000 });

    expect(lastSentMessageContent()).toBe('Hi');
  });

  it('sends the plain "Hi" when a story invite token is present but title/inviter failed to resolve', async () => {
    render(
      <ChatProvider autoOpenChat storyInviteToken="tok-abc">
        <div />
      </ChatProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sage', expect.anything()), { timeout: 2000 });

    expect(lastSentMessageContent()).toBe('Hi');
  });
});
