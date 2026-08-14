// Covers StoryView: an ordered list of a story's memories, fetched from
// GET /api/stories/[id]/memories, with per-row up/down move buttons
// (real-story-view-1c-reorder) PATCHing that same route. No Share/+/
// Publish — those are separate, later phases (see this component's own
// header comment).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { StoryView } from './StoryView';
import type { Story } from './types';

const story: Story = { id: 'story-1', name: 'A Life in Full', isOwner: true };
const collaboratorStory: Story = { id: 'story-2', name: 'The Bell Family', isOwner: false };

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('StoryView', () => {
  it('fetches the story\'s memories on mount, scoped by story id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ memories: [] }));
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/stories/story-1/memories'));
  });

  it('shows a loading spinner before the fetch resolves', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    resolveFetch(jsonResponse({ memories: [] }));
    await waitFor(() => expect(document.querySelector('.animate-spin')).not.toBeInTheDocument());
  });

  it('renders the real memory count and the story name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          memories: [
            { id: 'mem-1', title: 'The Lake House', body: 'A quiet summer.', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' },
            { id: 'mem-2', title: 'The Workshop', body: 'Sawdust and stories.', source_kind: 'photo', created_at: '2026-08-02T00:00:00Z' },
          ],
        }),
      ),
    );

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);

    expect(screen.getByText('A Life in Full')).toBeInTheDocument();
    expect(await screen.findByText(/2 memories/)).toBeInTheDocument();
    expect(screen.getByText('The Lake House')).toBeInTheDocument();
    expect(screen.getByText('The Workshop')).toBeInTheDocument();
  });

  it('uses singular "memory" for a count of exactly one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          memories: [{ id: 'mem-1', title: 'The Lake House', body: 'A quiet summer.', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' }],
        }),
      ),
    );

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);

    expect(await screen.findByText(/1 memory\b/)).toBeInTheDocument();
  });

  it('shows the ownership line only when story.isOwner is true — a real check, not fixed text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

    const { unmount } = render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    expect(await screen.findByText(/you own this story/)).toBeInTheDocument();
    unmount();

    render(<StoryView story={collaboratorStory} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('0 memories');
    expect(screen.queryByText(/you own this story/)).not.toBeInTheDocument();
  });

  it('shows an empty-state message when the story has no memories', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);

    expect(await screen.findByText(/No memories in this story yet/)).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails, without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Story not found' }, false, 404)));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);

    expect(await screen.findByText(/Could not load this story/)).toBeInTheDocument();
  });

  it('renders memories in exactly the order the API returned them — no client-side re-sort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          memories: [
            { id: 'mem-2', title: 'Second', body: '', source_kind: 'conversation', created_at: '2026-08-02T00:00:00Z' },
            { id: 'mem-1', title: 'First', body: '', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' },
          ],
        }),
      ),
    );

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('Second');

    const titles = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(titles[0]).toContain('Second');
    expect(titles[1]).toContain('First');
  });

  it('calls onClose when the close button is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));
    const onClose = vi.fn();

    render(<StoryView story={story} onClose={onClose} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText(/0 memories/);

    fireEvent.click(screen.getByRole('button', { name: 'Close story' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('tapping a row calls onOpenMemory with that memory\'s id AND its own session_id — not any other session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          memories: [
            { id: 'mem-1', session_id: 'sess-from-another-chat', title: 'The Lake House', body: '', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' },
          ],
        }),
      ),
    );
    const onOpenMemory = vi.fn();

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={onOpenMemory} onFlash={vi.fn()} />);
    await screen.findByText('The Lake House');

    fireEvent.click(screen.getByRole('button', { name: /The Lake House/ }));

    expect(onOpenMemory).toHaveBeenCalledWith('mem-1', 'sess-from-another-chat');
  });
});

const THREE_MEMORIES = [
  { id: 'mem-a', session_id: 'sess-1', title: 'A', body: '', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' },
  { id: 'mem-b', session_id: 'sess-1', title: 'B', body: '', source_kind: 'conversation', created_at: '2026-08-02T00:00:00Z' },
  { id: 'mem-c', session_id: 'sess-1', title: 'C', body: '', source_kind: 'conversation', created_at: '2026-08-03T00:00:00Z' },
];

describe('StoryView — reorder (real-story-view-1c-reorder)', () => {
  it('disables the top row\'s "Move up" and the bottom row\'s "Move down", middle row fully enabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: THREE_MEMORIES })));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    const ups = screen.getAllByRole('button', { name: 'Move up' });
    const downs = screen.getAllByRole('button', { name: 'Move down' });

    expect(ups[0]).toBeDisabled(); // row A — top
    expect(downs[0]).not.toBeDisabled();
    expect(ups[1]).not.toBeDisabled(); // row B — middle
    expect(downs[1]).not.toBeDisabled();
    expect(ups[2]).not.toBeDisabled(); // row C — bottom
    expect(downs[2]).toBeDisabled();
  });

  it('disables BOTH buttons when the story has exactly one memory', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [THREE_MEMORIES[0]] })));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    expect(screen.getByRole('button', { name: 'Move up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move down' })).toBeDisabled();
  });

  it('clicking "Move down" PATCHes with the right body, then refetches and re-renders the new order', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES })) // initial GET
      .mockResolvedValueOnce(jsonResponse({ ok: true })) // PATCH
      .mockResolvedValueOnce(jsonResponse({ memories: [THREE_MEMORIES[1], THREE_MEMORIES[0], THREE_MEMORIES[2]] })); // refetch, B now first
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]); // move A down

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/stories/story-1/memories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memoryId: 'mem-a', direction: 'down' }),
    });

    const titles = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(titles[0]).toContain('B'); // server's new order reflected, not a client-side guess
  });

  it('disables every row\'s move buttons while a move is in flight, not just the moved row\'s', async () => {
    let resolvePatch: (v: unknown) => void = () => {};
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES })) // initial GET
      .mockReturnValueOnce(new Promise((resolve) => { resolvePatch = resolve; })) // PATCH — held open
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES })); // refetch once released
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Move down' })[1]).toBeDisabled());
    expect(screen.getAllByRole('button', { name: 'Move up' })[1]).toBeDisabled(); // row B, otherwise enabled

    resolvePatch(jsonResponse({ ok: true }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Move up' })[1]).not.toBeDisabled());
  });

  it('flashes an error and does not crash when the PATCH fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Already at the top of the list' }, false, 400));
    vi.stubGlobal('fetch', fetchMock);
    const onFlash = vi.fn();

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={onFlash} />);
    await screen.findByText('A');

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);

    await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Could not move memory'));
    // Local state is untouched — still the original order, not corrupted.
    expect(screen.getAllByText(/^[ABC]$/)[0]).toHaveTextContent('A');
  });

  it('flashes an error when the move throws (network failure)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES }))
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const onFlash = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={onFlash} />);
    await screen.findByText('A');

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);

    await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Could not move memory'));
  });
});
