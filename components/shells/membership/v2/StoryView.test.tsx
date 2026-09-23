// Covers StoryView: an ordered list of a story's memories, fetched from
// GET /api/stories/[id]/memories, with per-row up/down move buttons
// (real-story-view-1c-reorder) PATCHing that same route. No Share/+/
// Publish — those are separate, later phases (see this component's own
// header comment).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';

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

    const titles = screen.getAllByTestId('deck-memory-row').map((li) => li.textContent);
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

  it('shows a thumbnail box only for photo/video memories — not text, audio, or document (Phase 1, row layout parity)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          memories: [
            { id: 'mem-1', title: 'Written up', body: '', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' },
            { id: 'mem-2', title: 'A photo', body: '', source_kind: 'photo', created_at: '2026-08-02T00:00:00Z' },
            { id: 'mem-3', title: 'A video', body: '', source_kind: 'video', created_at: '2026-08-03T00:00:00Z' },
            { id: 'mem-4', title: 'A recording', body: '', source_kind: 'audio', created_at: '2026-08-04T00:00:00Z' },
            { id: 'mem-5', title: 'A document', body: '', source_kind: 'document', created_at: '2026-08-05T00:00:00Z' },
          ],
        }),
      ),
    );

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('Written up');

    expect(screen.queryAllByTestId('memory-thumbnail')).toHaveLength(2); // photo + video only
  });

  it('gives every row the same height regardless of whether it has a thumbnail or a body line (Phase 1)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          memories: [
            { id: 'mem-1', title: 'No body, no thumbnail', body: '', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' },
            { id: 'mem-2', title: 'Has both', body: 'Some passage text.', source_kind: 'photo', created_at: '2026-08-02T00:00:00Z' },
          ],
        }),
      ),
    );

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('No body, no thumbnail');

    const rowButtons = screen.getAllByRole('button', { name: /No body, no thumbnail|Has both/ });
    rowButtons.forEach((btn) => expect(btn.className).toContain('h-24'));
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

    const titles = screen.getAllByTestId('deck-memory-row').map((li) => li.textContent);
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

  it('flashes an error and does not crash when the PATCH fails, refetching to confirm local state matches the server', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES })) // initial GET
      .mockResolvedValueOnce(jsonResponse({ error: 'Already at the top of the list' }, false, 400)) // failing PATCH
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES })); // refetch after failure
    vi.stubGlobal('fetch', fetchMock);
    const onFlash = vi.fn();

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={onFlash} />);
    await screen.findByText('A');

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);

    await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Could not move memory'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    // Local state matches what the server actually has — still the
    // original order here, but via a real refetch, not an assumption that
    // nothing changed (a multi-step drag can partially succeed before a
    // later step fails).
    expect(screen.getAllByText(/^[ABC]$/)[0]).toHaveTextContent('A');
  });

  it('a multi-step move that fails partway refetches so local state reflects the partially-applied server order', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES })) // initial GET
      .mockResolvedValueOnce(jsonResponse({ ok: true })) // PATCH 1 (A -> down) succeeds
      .mockResolvedValueOnce(jsonResponse({ error: 'conflict' }, false, 409)) // PATCH 2 fails
      .mockResolvedValueOnce(jsonResponse({ memories: [THREE_MEMORIES[1], THREE_MEMORIES[0], THREE_MEMORIES[2]] })); // refetch reflects the one step that DID persist
    vi.stubGlobal('fetch', fetchMock);
    const onFlash = vi.fn();

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={onFlash} />);
    await screen.findByText('A');

    const rows = screen.getAllByTestId('deck-memory-row');
    fireEvent.dragStart(rows[0]); // A
    fireEvent.drop(rows[2]); // dropped 2 positions down -> 2 PATCH steps

    await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Could not move memory'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const titles = screen.getAllByTestId('deck-memory-row').map((li) => li.textContent);
    expect(titles[0]).toContain('B'); // reflects the server's real order, not the stale pre-drag one
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

describe('StoryView — desktop drag-and-drop reorder (Phase 2)', () => {
  it('dragging row A onto row C (2 positions down) PATCHes "down" twice, then refetches once', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES })) // initial GET
      .mockResolvedValueOnce(jsonResponse({ ok: true })) // PATCH 1
      .mockResolvedValueOnce(jsonResponse({ ok: true })) // PATCH 2
      .mockResolvedValueOnce(jsonResponse({ memories: [THREE_MEMORIES[1], THREE_MEMORIES[2], THREE_MEMORIES[0]] })); // refetch
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    const rows = screen.getAllByTestId('deck-memory-row');
    fireEvent.dragStart(rows[0]); // A
    fireEvent.dragEnter(rows[2]); // over C
    fireEvent.drop(rows[2]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/stories/story-1/memories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memoryId: 'mem-a', direction: 'down' }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/stories/story-1/memories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memoryId: 'mem-a', direction: 'down' }),
    });

    const titles = screen.getAllByTestId('deck-memory-row').map((li) => li.textContent);
    expect(titles[2]).toContain('A'); // server's new order reflected
  });

  it('dropping a row on itself does nothing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ memories: THREE_MEMORIES }));
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    const rows = screen.getAllByTestId('deck-memory-row');
    fireEvent.dragStart(rows[0]);
    fireEvent.drop(rows[0]);

    expect(fetchMock).toHaveBeenCalledTimes(1); // just the initial GET
  });

  it('rows are not draggable at mobile widths — the existing up/down buttons remain the only affordance', async () => {
    (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
      width: 390,
    });
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: THREE_MEMORIES })));

      render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
      await screen.findByText('A');

      screen.getAllByRole('listitem').forEach((li) => {
        expect(li).toHaveAttribute('draggable', 'false');
      });
      // The up/down buttons are still there and enabled where applicable.
      expect(screen.getAllByRole('button', { name: 'Move down' })[0]).not.toBeDisabled();
    } finally {
      (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
        width: 1024,
      });
    }
  });
});

describe('StoryView — List/Grid toggle, persisted per-story (Phase 3)', () => {
  it('defaults to list view when the story has no saved preference', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: THREE_MEMORIES })));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens straight into grid view when the story\'s saved preference is grid', async () => {
    const gridStory: Story = { ...story, viewMode: 'grid' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: THREE_MEMORIES })));

    render(<StoryView story={gridStory} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking "Grid view" switches layout immediately and PATCHes the preference in the background', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES })) // initial GET
      .mockResolvedValueOnce(jsonResponse({ story: { id: 'story-1', name: 'A Life in Full', viewMode: 'grid' } })); // PATCH
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));

    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/stories/story-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ view_mode: 'grid' }),
    });
  });

  it('reverts to the previous view and flashes an error when the PATCH fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES }))
      .mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false, 500));
    vi.stubGlobal('fetch', fetchMock);
    const onFlash = vi.fn();

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={onFlash} />);
    await screen.findByText('A');

    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));

    await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Could not save view preference'));
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking the already-active view does nothing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ memories: THREE_MEMORIES }));
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    expect(fetchMock).toHaveBeenCalledTimes(1); // just the initial GET, no PATCH
  });

  it('disables both buttons while a PATCH is in flight, so a second click can\'t fire an overlapping request (found in review)', async () => {
    // A controllable, not-yet-resolved PATCH response — lets the test
    // observe the disabled state DURING the request, not just before/after.
    let resolvePatch!: (value: ReturnType<typeof jsonResponse>) => void;
    const patchPromise = new Promise<ReturnType<typeof jsonResponse>>((resolve) => { resolvePatch = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES })) // initial GET
      .mockReturnValueOnce(patchPromise); // PATCH — held open
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(screen.getByRole('button', { name: 'List view' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Grid view' })).toBeDisabled();

    // A click while disabled must not fire a second PATCH.
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(fetchMock).toHaveBeenCalledTimes(2); // still just GET + the one held-open PATCH

    resolvePatch(jsonResponse({ story: { id: 'story-1', name: 'A Life in Full', viewMode: 'grid' } }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'List view' })).not.toBeDisabled());
    expect(screen.getByRole('button', { name: 'Grid view' })).not.toBeDisabled();
    // The one click that landed (Grid) is still what's shown as active.
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports a successful save to onViewModeCommit, but never on a failed/reverted one (found in review)', async () => {
    const onViewModeCommit = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ memories: THREE_MEMORIES }))
      .mockResolvedValueOnce(jsonResponse({ story: { id: 'story-1', name: 'A Life in Full', viewMode: 'grid' } }))
      .mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false, 500));
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} onViewModeCommit={onViewModeCommit} />);
    await screen.findByText('A');

    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    await waitFor(() => expect(onViewModeCommit).toHaveBeenCalledWith('grid'));
    expect(onViewModeCommit).toHaveBeenCalledTimes(1);

    onViewModeCommit.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true')); // reverted
    expect(onViewModeCommit).not.toHaveBeenCalled();
  });

  it('grid view has no up/down buttons but keeps the thumbnail rule and opens memories the same way', async () => {
    const gridStory: Story = { ...story, viewMode: 'grid' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          memories: [
            { id: 'mem-1', session_id: 'sess-1', title: 'A photo', body: '', source_kind: 'photo', created_at: '2026-08-01T00:00:00Z' },
            { id: 'mem-2', session_id: 'sess-1', title: 'Written up', body: '', source_kind: 'conversation', created_at: '2026-08-02T00:00:00Z' },
          ],
        }),
      ),
    );
    const onOpenMemory = vi.fn();

    render(<StoryView story={gridStory} onClose={vi.fn()} onOpenMemory={onOpenMemory} onFlash={vi.fn()} />);
    await screen.findByText('A photo');

    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /A photo/ }));
    expect(onOpenMemory).toHaveBeenCalledWith('mem-1', 'sess-1');
  });

  it('mobile always renders list, with no Deck-layout toggle at all, even when the saved preference is grid', async () => {
    (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
      width: 390,
    });
    try {
      const gridStory: Story = { ...story, viewMode: 'grid' };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: THREE_MEMORIES })));

      render(<StoryView story={gridStory} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
      await screen.findByText('A');

      expect(screen.queryByRole('group', { name: 'Deck layout' })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Move down' })[0]).toBeInTheDocument(); // still the list view
    } finally {
      (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
        width: 1024,
      });
    }
  });
});

describe('StoryView — Share stub (Phase 4)', () => {
  it('renders a disabled Share button that does nothing on click', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText(/0 memories/);

    const shareButton = screen.getByRole('button', { name: 'Share this story — coming soon' });
    expect(shareButton).toBeDisabled();
  });
});

describe('StoryView — Add menu (Phase 4)', () => {
  it('opens to show Memory (disabled), Cover page, and Back page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText(/0 memories/);

    fireEvent.click(screen.getByRole('button', { name: 'Add to this story' }));

    expect(screen.getByRole('menuitem', { name: /Memory/ })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Cover page' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Back page' })).toBeInTheDocument();
  });
});

describe('StoryView — Cover/Back stub, list view (Phase 4)', () => {
  it('shows "Not added yet" placeholders for both cover and back before anything is saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText(/0 memories/);

    expect(screen.getAllByText('Not added yet')).toHaveLength(2); // cover + back
  });

  it('Add > Cover page opens the panel; saving renders the cover row and flips the menu label to "Edit cover page"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText(/0 memories/);

    fireEvent.click(screen.getByRole('button', { name: 'Add to this story' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cover page' }));

    expect(screen.getByRole('dialog', { name: 'Cover page' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A Life in Full' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.queryByRole('dialog', { name: 'Cover page' })).not.toBeInTheDocument();
    expect(screen.getByText('A Life in Full', { selector: 'p' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add to this story' }));
    expect(screen.getByRole('menuitem', { name: 'Edit cover page' })).toBeInTheDocument();
  });

  it('removing a saved back page reverts it to "Not added yet"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText(/0 memories/);

    fireEvent.click(screen.getByRole('button', { name: 'Add to this story' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Back page' }));
    fireEvent.change(screen.getByLabelText('Heading'), { target: { value: 'With love, always' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('With love, always', { selector: 'p' })).toBeInTheDocument();

    // Re-open to remove it.
    const backRowButtons = screen.getAllByRole('button', { name: /With love, always/ });
    fireEvent.click(backRowButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove back page' }));

    expect(screen.queryByText('With love, always')).not.toBeInTheDocument();
    expect(screen.getAllByText('Not added yet')).toHaveLength(2); // cover + back, both empty again
  });

  it('switching to a different story resets the stub cover/back — nothing leaks across stories', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

    const { rerender } = render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText(/0 memories/);

    fireEvent.click(screen.getByRole('button', { name: 'Add to this story' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cover page' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A Life in Full' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('A Life in Full', { selector: 'p' })).toBeInTheDocument();

    rerender(<StoryView story={collaboratorStory} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('The Bell Family');

    expect(screen.queryByText('A Life in Full')).not.toBeInTheDocument();
    expect(screen.getAllByText('Not added yet')).toHaveLength(2);
  });
});

describe('StoryView — Cover/Back stub, grid view (Phase 4)', () => {
  it('renders cover and back as end tiles pinned first/last', async () => {
    const gridStory: Story = { ...story, viewMode: 'grid' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          memories: [{ id: 'mem-1', session_id: 'sess-1', title: 'A', body: '', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' }],
        }),
      ),
    );

    render(<StoryView story={gridStory} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A');

    const endTiles = screen.getAllByTestId('deck-end-row');
    expect(endTiles).toHaveLength(2);
  });
});

describe('StoryView — Preview entry point (Phase 5)', () => {
  it('clicking "Preview this story" opens the reader, showing the story name in its header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          memories: [{ id: 'mem-1', session_id: 'sess-1', title: 'The Lake House', body: 'A quiet summer.', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' }],
        }),
      ),
    );

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('The Lake House');

    fireEvent.click(screen.getByRole('button', { name: 'Preview this story' }));

    const dialog = screen.getByRole('dialog', { name: 'Preview A Life in Full' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('A quiet summer.')).toBeInTheDocument();
  });

  it('closing the reader and reopening it returns to page 1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          memories: [
            { id: 'mem-1', session_id: 'sess-1', title: 'First', body: 'First page.', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' },
            { id: 'mem-2', session_id: 'sess-1', title: 'Second', body: 'Second page.', source_kind: 'conversation', created_at: '2026-08-02T00:00:00Z' },
          ],
        }),
      ),
    );

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('First');

    fireEvent.click(screen.getByRole('button', { name: 'Preview this story' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(within(screen.getByRole('dialog', { name: /Preview/ })).getByText('Second page.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(screen.queryByRole('dialog', { name: /Preview/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Preview this story' }));
    expect(within(screen.getByRole('dialog', { name: /Preview/ })).getByText('First page.')).toBeInTheDocument();
  });

  it('Preview includes the stub cover/back pages when they exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText(/0 memories/);

    fireEvent.click(screen.getByRole('button', { name: 'Add to this story' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cover page' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A Life in Full, Remembered' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    fireEvent.click(screen.getByRole('button', { name: 'Preview this story' }));

    expect(screen.getByRole('heading', { name: 'A Life in Full, Remembered' })).toBeInTheDocument();
  });

  it('paginates a long memory body across multiple reader pages — 620-word chunks past the first page', async () => {
    // No media on a 'conversation' memory -> first-page limit is 620 words,
    // same as every later page, so exactly 1300 words makes 3 pages
    // (620 + 620 + 60), not 2.
    const longBody = Array.from({ length: 1300 }, (_, i) => `word${i}`).join(' ');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          memories: [{ id: 'mem-1', session_id: 'sess-1', title: 'A Long One', body: longBody, source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' }],
        }),
      ),
    );

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
    await screen.findByText('A Long One');

    fireEvent.click(screen.getByRole('button', { name: 'Preview this story' }));

    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: /Preview/ });
    expect(dialog.textContent).toContain('word0 ');
    expect(dialog.textContent).not.toContain('word620 ');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(dialog.textContent).toContain('word620 ');
  });
});

describe('StoryView — mobile Preview gating (Phase 6)', () => {
  it('tapping Preview at mobile widths flashes a toast instead of opening the reader', async () => {
    (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
      width: 390,
    });
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));
      const onFlash = vi.fn();

      render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={onFlash} />);
      await screen.findByText(/0 memories/);

      fireEvent.click(screen.getByRole('button', { name: 'Preview this story' }));

      expect(onFlash).toHaveBeenCalledWith(
        'Preview looks best on a bigger screen — open Heirloom on your computer to see the finished book.',
      );
      expect(screen.queryByRole('dialog', { name: /Preview/ })).not.toBeInTheDocument();
    } finally {
      (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
        width: 1024,
      });
    }
  });

  it('the Preview button itself still renders on mobile — only its click behavior changes', async () => {
    (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
      width: 390,
    });
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

      render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={vi.fn()} />);
      await screen.findByText(/0 memories/);

      expect(screen.getByRole('button', { name: 'Preview this story' })).toBeInTheDocument();
    } finally {
      (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
        width: 1024,
      });
    }
  });

  it('desktop is unaffected — tapping Preview still opens the reader, no toast', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));
    const onFlash = vi.fn();

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} onFlash={onFlash} />);
    await screen.findByText(/0 memories/);

    fireEvent.click(screen.getByRole('button', { name: 'Preview this story' }));

    expect(screen.getByRole('dialog', { name: /Preview/ })).toBeInTheDocument();
    expect(onFlash).not.toHaveBeenCalled();
  });
});
