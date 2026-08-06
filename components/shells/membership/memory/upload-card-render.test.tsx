// Rendering-layer coverage for the upload progress cards (UploadCard.tsx and
// the three cards it selects between). No test previously rendered
// InlineImage/InlineFileChip/MediaStatusBadge either — this is net-new
// coverage over MessageList.tsx's media rendering, not a rewrite of
// anything existing. Mounts ChatProvider + MessageList directly (not the
// full ChatHero tree) since MessageList takes `messages` as a plain prop —
// no session-load/fetch machinery needed to seed message content, only
// mediaItems (via the real addMediaItem, same as chatStore.mediaPolling.test.tsx's
// mkItem convention) needs a ChatProvider to live in.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { ChatProvider, useChatStore, type ClientMediaItem } from '../chatStore';
import { MessageList } from '../MessageList';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchCalls: Array<{ url: string; method: string }> = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  fetchCalls.push({ url, method });
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories')) return jsonResponse({ memories: [] });
  if (url.startsWith('/api/media/') && url.endsWith('/retry') && method === 'POST') return jsonResponse({ ok: true });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  return jsonResponse({ ok: true });
});

beforeEach(() => {
  fetchCalls.length = 0;
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

function mkItem(overrides: {
  id: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error_message?: string | null;
}): ClientMediaItem {
  return {
    id: overrides.id,
    tenant_id: 't1',
    member_id: 'm1',
    chat_id: 'sess-1',
    story_id: null,
    type: 'image',
    original_filename: 'campfire.jpg',
    storage_path: '',
    file_size_bytes: 100,
    mime_type: 'image/jpeg',
    status: overrides.status,
    derived_content: overrides.status === 'ready' ? 'two people at a campfire' : null,
    classification: null,
    error_message: overrides.error_message ?? null,
    processed_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

/** Captionless upload — the case UploadCard actually renders for (see
 *  MessageList.tsx's isCaptionless branch). */
const CAPTIONLESS_UPLOAD_MESSAGE = {
  id: 'm1',
  role: 'user' as const,
  content: '[MEDIA_UPLOAD: campfire.jpg | media-1 | image]',
  timestamp: 1,
};

/** A client-side upload failure — no media_items row ever existed, so this
 *  must never route through UploadCard (see MessageList.tsx's comment on
 *  userMsg.failures). */
const CLIENT_SIDE_FAILURE_MESSAGE = {
  id: 'm2',
  role: 'user' as const,
  content: '[MEDIA_UPLOAD_FAILED: broken.jpg]',
  timestamp: 2,
};

function Harness({ messages, seedItem }: { messages: typeof CAPTIONLESS_UPLOAD_MESSAGE[]; seedItem?: ClientMediaItem }) {
  const { addMediaItem } = useChatStore();
  return (
    <>
      {seedItem && <button onClick={() => addMediaItem(seedItem)}>seed</button>}
      <MessageList messages={messages} isLoading={false} errorType={null} />
    </>
  );
}

describe('UploadCard rendering — status drives which card shows', () => {
  it('renders UploadRunningCard chrome while status is processing', async () => {
    render(
      <ChatProvider>
        <Harness messages={[CAPTIONLESS_UPLOAD_MESSAGE]} seedItem={mkItem({ id: 'media-1', status: 'processing' })} />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed'));
    });

    expect(screen.getAllByText('A photograph, remembered').length).toBeGreaterThan(0);
    // Running card's own copy — proves it's UploadRunningCard, not Ready/Error.
    expect(screen.queryByRole('button', { name: 'Keep this' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('renders UploadReadyCard with working Keep/Discard once status is ready', async () => {
    render(
      <ChatProvider>
        <Harness messages={[CAPTIONLESS_UPLOAD_MESSAGE]} seedItem={mkItem({ id: 'media-1', status: 'ready' })} />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed'));
    });

    expect(screen.getByRole('button', { name: 'Keep this' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('renders the SANITIZED error phrase, never the raw error_message, once status is failed', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[CAPTIONLESS_UPLOAD_MESSAGE]}
          seedItem={mkItem({ id: 'media-1', status: 'failed', error_message: 'Deepgram API error: 401 unauthorized' })}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed'));
    });

    expect(screen.getByText("the audio transcription service couldn't process this file")).toBeInTheDocument();
    expect(screen.queryByText(/Deepgram/)).not.toBeInTheDocument();
    expect(screen.queryByText(/401/)).not.toBeInTheDocument();
  });

  it('clicking "Try again" on the error card issues POST /api/media/{id}/retry', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[CAPTIONLESS_UPLOAD_MESSAGE]}
          seedItem={mkItem({ id: 'media-1', status: 'failed', error_message: 'Storage object not available after 4 attempts' })}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });

    await waitFor(() =>
      expect(fetchCalls.some(c => c.url === '/api/media/media-1/retry' && c.method === 'POST')).toBe(true),
    );
  });

  it('a client-side (pre-upload) failure still renders FailedUploadChip, never UploadErrorCard', async () => {
    render(
      <ChatProvider>
        <Harness messages={[CLIENT_SIDE_FAILURE_MESSAGE]} />
      </ChatProvider>,
    );

    expect(screen.getByText('broken.jpg — upload failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
