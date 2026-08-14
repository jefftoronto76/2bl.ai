// Covers StoryView (real-story-view-1a-static-list): a read-only ordered
// list of a story's memories, fetched from GET /api/stories/[id]/memories.
// No drag-reorder, no row-tap-to-editor, no Share/+/Publish — those are
// separate, later phases (see this component's own header comment).

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

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/stories/story-1/memories'));
  });

  it('shows a loading spinner before the fetch resolves', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} />);

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

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} />);

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

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} />);

    expect(await screen.findByText(/1 memory\b/)).toBeInTheDocument();
  });

  it('shows the ownership line only when story.isOwner is true — a real check, not fixed text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

    const { unmount } = render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} />);
    expect(await screen.findByText(/you own this story/)).toBeInTheDocument();
    unmount();

    render(<StoryView story={collaboratorStory} onClose={vi.fn()} onOpenMemory={vi.fn()} />);
    await screen.findByText('0 memories');
    expect(screen.queryByText(/you own this story/)).not.toBeInTheDocument();
  });

  it('shows an empty-state message when the story has no memories', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} />);

    expect(await screen.findByText(/No memories in this story yet/)).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails, without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Story not found' }, false, 404)));

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} />);

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

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={vi.fn()} />);
    await screen.findByText('Second');

    const titles = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(titles[0]).toContain('Second');
    expect(titles[1]).toContain('First');
  });

  it('calls onClose when the close button is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ memories: [] })));
    const onClose = vi.fn();

    render(<StoryView story={story} onClose={onClose} onOpenMemory={vi.fn()} />);
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

    render(<StoryView story={story} onClose={vi.fn()} onOpenMemory={onOpenMemory} />);
    await screen.findByText('The Lake House');

    fireEvent.click(screen.getByRole('button', { name: /The Lake House/ }));

    expect(onOpenMemory).toHaveBeenCalledWith('mem-1', 'sess-from-another-chat');
  });
});
