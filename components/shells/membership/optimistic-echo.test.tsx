// Coverage for the optimistic-send echo (chatStore.tsx's pendingEcho,
// ChatInput.tsx's handleSend wiring, MessageList.tsx's PendingEchoBubble) —
// the fix for the noticeable gap between hitting Send with an attachment and
// anything appearing (2026-08-06 investigation: ChatInput.tsx's handleSend
// blocks message creation on the full upload round trip).
//
// Mounts a minimal harness mirroring ChatHero.tsx's own hasStarted-gated
// choice between MessageList and an empty state, plus the real ChatInput —
// both against one real ChatProvider, so pendingEcho/addMediaItem/sendMessage
// all flow exactly as they do in the app. useMediaUpload is mocked with a
// controllable, manually-resolved promise so the test can assert what's on
// screen DURING the upload, not just after it settles.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { ChatProvider, useChatStore } from './chatStore';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { __resetPersistenceForTests } from '@/services/chat/ui/v1/persistence';

vi.mock('@/services/auth/client', () => ({
  useAuthUser: () => ({ isLoaded: true, isSignedIn: true, user: { providerUserId: 'u1', isPlatformAdmin: false } }),
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

// Controllable upload — resolved manually mid-test so assertions can capture
// what's on screen DURING the (still-pending) upload, not just the settled end.
type UploadResolver = (result: { mediaItemId: string; type: 'image'; filename: string; status: 'pending' } | null) => void;
let pendingUploadResolvers: UploadResolver[] = [];
const mockUpload = vi.fn(
  () =>
    new Promise((resolve: UploadResolver) => {
      pendingUploadResolvers.push(resolve);
    }),
);
vi.mock('@/services/media/useMediaUpload', () => ({
  useMediaUpload: () => ({ upload: mockUpload, isUploading: false, error: null }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
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

let capturedSessionsPostBody: string | null | undefined;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url === '/api/sessions' && method === 'POST') {
    capturedSessionsPostBody = init?.body as string | undefined;
    return jsonResponse({ id: 'sess-1' });
  }
  if (url === '/api/sage' && method === 'POST') return streamResponse('ok');
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories')) return jsonResponse({ memories: [] });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  return jsonResponse({ ok: true });
});

let objectUrlCallCount = 0;

beforeEach(async () => {
  await __resetPersistenceForTests('heirloom');
  pendingUploadResolvers = [];
  capturedSessionsPostBody = undefined;
  objectUrlCallCount = 0;
  fetchMock.mockClear();
  mockUpload.mockClear();
  __clearSingletonRegistry();
  vi.stubGlobal('fetch', fetchMock);
  // Sequential, distinguishable values — lets assertions tell the echo's
  // pick-time preview (created first, in ChatInput.tsx's addFiles) apart
  // from the real message's freshly re-created one (created second, inside
  // handleSend's Promise.all callback, after the mocked upload resolves).
  global.URL.createObjectURL = vi.fn(() => `blob:preview-${++objectUrlCallCount}`);
  global.URL.revokeObjectURL = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Mirrors ChatHero.tsx's own state.hasStarted-gated choice between
// MessageList and an empty state, so the §6 hasStarted-widening fix
// (pendingEcho !== null also counts) is exercised for real, not assumed.
function Harness() {
  const { state } = useChatStore();
  return (
    <div>
      {state.hasStarted ? (
        <MessageList messages={state.messages} isLoading={state.isLoading} errorType={null} />
      ) : (
        <div data-testid="empty-state">empty</div>
      )}
      <ChatInput />
    </div>
  );
}

function attachImage(container: HTMLElement, filename = 'campfire.jpg') {
  const file = new File(['hello'], filename, { type: 'image/jpeg' });
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [file] } });
}

describe('optimistic send — attachment gap', () => {
  it('shows the local-preview echo synchronously on Send, before the upload resolves — replaces it with the real message once the upload settles, no duplicate', async () => {
    const { container } = render(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    attachImage(container, 'campfire.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    // Synchronous — no await/waitFor before this assertion — proves the
    // echo is on screen the instant Send is clicked, not after any network
    // round trip. The empty-state placeholder must be gone too (§6).
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    const echoImgs = screen.getAllByAltText('campfire.jpg');
    expect(echoImgs).toHaveLength(1);
    expect(echoImgs[0].getAttribute('src')).toBe('blob:preview-1'); // the pick-time preview, from addFiles

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(pendingUploadResolvers).toHaveLength(1);

    // Resolve the upload — this is the moment the real message (and its
    // fresh, second, independent local preview) should take over.
    await act(async () => {
      pendingUploadResolvers[0]({ mediaItemId: 'media-1', type: 'image', filename: 'campfire.jpg', status: 'pending' });
    });

    await waitFor(() => {
      const imgs = screen.getAllByAltText('campfire.jpg');
      expect(imgs).toHaveLength(1);
      expect(imgs[0].getAttribute('src')).toBe('blob:preview-2'); // the real message's own fresh preview
    });

    // The chat_id backfill payload (PR #291) — unchanged by the echo, per
    // this session's investigation finding: the echo is purely visual and
    // sits entirely outside the real upload()/sendMessage() timing.
    await waitFor(() => expect(capturedSessionsPostBody).toBeDefined());
    expect(JSON.parse(capturedSessionsPostBody as string)).toEqual({ mediaItemIds: ['media-1'] });
  });

  it('a text-only send never shows an echo', async () => {
    render(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'hello there' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(screen.getByText('hello there')).toBeInTheDocument());
    expect(mockUpload).not.toHaveBeenCalled();
    // No shimmer overlay anywhere — the only thing an echo would add.
    expect(document.querySelector('.animate-upload-shimmer')).not.toBeInTheDocument();
  });
});
