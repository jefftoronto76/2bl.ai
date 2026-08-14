// Covers StoryMemoryEditor (real-story-view-1b-row-tap-editor) — the
// cross-session-safe wrapper around MemoryCardView used when a memory is
// opened from a story view row tap. The whole point of this component is
// that it must NOT rely on whatever chat session happens to be open
// elsewhere in the app — it fetches its own useMemories(sessionId) instance
// and its own session-scoped media list, both keyed by the PROP sessionId
// (the tapped memory's own), never a session id from anywhere else.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { StoryMemoryEditor } from './StoryMemoryEditor';
import type { Story } from './types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const MEMORY = {
  id: 'mem-1',
  session_id: 'sess-a',
  anchor_message_id: 'm1',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the lake.',
  body_blocks: null,
  status: 'published',
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
};

const STORIES: Story[] = [{ id: 'story-1', name: 'A Life in Full' }];

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body } as Response;
}

function makeFetchMock(overrides: Record<string, () => Response | Promise<Response>> = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const key = `${method} ${url}`;
    for (const [pattern, handler] of Object.entries(overrides)) {
      if (key.startsWith(pattern)) return handler();
    }
    if (url === '/api/sessions/sess-a/memories' && method === 'GET') {
      return jsonResponse({ memories: [MEMORY] });
    }
    if (url.startsWith('/api/media?chat_id=sess-a')) {
      return jsonResponse({ items: [] });
    }
    return jsonResponse({ ok: true });
  });
}

describe('StoryMemoryEditor', () => {
  it('shows a loading spinner before the session-scoped memory list resolves', async () => {
    let resolveFetch: (v: Response) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryMemoryEditor memoryId="mem-1" sessionId="sess-a" stories={STORIES} onClose={vi.fn()} onFlash={vi.fn()} />);

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    resolveFetch(jsonResponse({ memories: [MEMORY] }));
    await waitFor(() => expect(screen.getByLabelText('Memory title')).toBeInTheDocument());
  });

  it('fetches the memory list AND session images scoped to the memory\'s own sessionId, not any other', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryMemoryEditor memoryId="mem-1" sessionId="sess-a" stories={STORIES} onClose={vi.fn()} onFlash={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Memory title')).toHaveValue('The Lake House'));
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/sess-a/memories');
    expect(fetchMock).toHaveBeenCalledWith('/api/media?chat_id=sess-a&status=ready');
  });

  it('shows a graceful message when the memory is not found in its own session\'s list', async () => {
    const fetchMock = makeFetchMock({ 'GET /api/sessions/sess-a/memories': () => jsonResponse({ memories: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryMemoryEditor memoryId="mem-missing" sessionId="sess-a" stories={STORIES} onClose={vi.fn()} onFlash={vi.fn()} />);

    expect(await screen.findByText('This memory could not be found.')).toBeInTheDocument();
  });

  it('renaming PATCHes the memory\'s OWN session endpoint, not some other session', async () => {
    const fetchMock = makeFetchMock({
      'PATCH /api/sessions/sess-a/memories/mem-1': () => jsonResponse({ memory: { ...MEMORY, title: 'New Title' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryMemoryEditor memoryId="mem-1" sessionId="sess-a" stories={STORIES} onClose={vi.fn()} onFlash={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Memory title')).toHaveValue('The Lake House'));

    const titleInput = screen.getByLabelText('Memory title');
    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    fireEvent.blur(titleInput);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sessions/sess-a/memories/mem-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ action: 'retitle', title: 'New Title' }) }),
      ),
    );
  });

  it('Remove requires confirmation, then discards and calls onClose', async () => {
    const fetchMock = makeFetchMock({
      'PATCH /api/sessions/sess-a/memories/mem-1': () => jsonResponse({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();

    render(<StoryMemoryEditor memoryId="mem-1" sessionId="sess-a" stories={STORIES} onClose={onClose} onFlash={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Memory title')).toHaveValue('The Lake House'));

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sessions/sess-a/memories/mem-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ action: 'discard' }) }),
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('assigning to a story flashes "Added to X" the first time', async () => {
    const fetchMock = makeFetchMock({
      'PATCH /api/sessions/sess-a/memories/mem-1': () => jsonResponse({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onFlash = vi.fn();

    render(<StoryMemoryEditor memoryId="mem-1" sessionId="sess-a" stories={STORIES} onClose={vi.fn()} onFlash={onFlash} />);
    await waitFor(() => expect(screen.getByLabelText('Memory title')).toHaveValue('The Lake House'));

    fireEvent.click(screen.getByRole('button', { name: 'Add to a story' }));
    const option = await screen.findByRole('button', { name: 'Add to A Life in Full' });
    fireEvent.click(option);

    await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Added to A Life in Full'));
  });
});
