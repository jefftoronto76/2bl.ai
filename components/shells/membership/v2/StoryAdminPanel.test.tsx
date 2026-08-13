// Covers StoryAdminPanel (story-admin-panel, 2026-08-13): description
// commits on blur only when changed, the member roster renders from a real
// fetch, and Remove requires confirmation before ever calling the DELETE
// endpoint — success drops the row locally (no re-fetch), failure shows an
// inline error and leaves the row in place.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';

import { StoryAdminPanel } from './StoryAdminPanel';
import type { Story } from './types';

const story: Story = { id: 'story-1', name: 'A Life in Full', description: 'The long arc.' };

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('StoryAdminPanel', () => {
  it('seeds the description textarea from story.description and fetches the roster on mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ collaborators: [] }));
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryAdminPanel story={story} onClose={vi.fn()} onDescriptionCommit={vi.fn()} />);

    expect(screen.getByLabelText('Description')).toHaveValue('The long arc.');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/heirloom/story-invites?story_id=story-1'),
    );
  });

  it('does NOT commit on blur when the description is unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ collaborators: [] })));
    const onDescriptionCommit = vi.fn();

    render(<StoryAdminPanel story={story} onClose={vi.fn()} onDescriptionCommit={onDescriptionCommit} />);
    await screen.findByText('No members yet.'); // let the roster fetch settle

    fireEvent.blur(screen.getByLabelText('Description'));

    expect(onDescriptionCommit).not.toHaveBeenCalled();
  });

  it('commits the trimmed description on blur when it changed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ collaborators: [] })));
    const onDescriptionCommit = vi.fn();

    render(<StoryAdminPanel story={story} onClose={vi.fn()} onDescriptionCommit={onDescriptionCommit} />);
    await screen.findByText('No members yet.'); // let the roster fetch settle

    const textarea = screen.getByLabelText('Description');
    fireEvent.change(textarea, { target: { value: '  A new description.  ' } });
    fireEvent.blur(textarea);

    expect(onDescriptionCommit).toHaveBeenCalledTimes(1);
    expect(onDescriptionCommit).toHaveBeenCalledWith('A new description.');
  });

  it('renders the real collaborator roster from the fetch response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          collaborators: [
            { memberId: 'member-1', name: 'Eleanor Hayes', email: null, joinedAt: '2026-08-03T00:00:00Z' },
            { memberId: 'member-2', name: null, email: 'marcus@example.com', joinedAt: '2026-08-05T00:00:00Z' },
          ],
        }),
      ),
    );

    render(<StoryAdminPanel story={story} onClose={vi.fn()} onDescriptionCommit={vi.fn()} />);

    expect(await screen.findByText('Eleanor Hayes')).toBeInTheDocument();
    // Falls back to email when name is null.
    expect(await screen.findByText('marcus@example.com')).toBeInTheDocument();
    expect(screen.queryByText('No members yet.')).not.toBeInTheDocument();
  });

  it('shows "No members yet." for an empty roster', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ collaborators: [] })));

    render(<StoryAdminPanel story={story} onClose={vi.fn()} onDescriptionCommit={vi.fn()} />);

    expect(await screen.findByText('No members yet.')).toBeInTheDocument();
  });

  it('Remove requires confirmation before calling the DELETE endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        collaborators: [{ memberId: 'member-1', name: 'Eleanor Hayes', email: null, joinedAt: '2026-08-03T00:00:00Z' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryAdminPanel story={story} onClose={vi.fn()} onDescriptionCommit={vi.fn()} />);
    await screen.findByText('Eleanor Hayes');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Remove Eleanor Hayes from this story?');
    // Only the initial roster GET has fired — opening the confirm dialog
    // itself must not call the API.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // Cancelling doesn't remove the row either.
    expect(screen.getByText('Eleanor Hayes')).toBeInTheDocument();
  });

  it('a successful remove drops the row from the list without a full re-fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          collaborators: [{ memberId: 'member-1', name: 'Eleanor Hayes', email: null, joinedAt: '2026-08-03T00:00:00Z' }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryAdminPanel story={story} onClose={vi.fn()} onDescriptionCommit={vi.fn()} />);
    await screen.findByText('Eleanor Hayes');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.queryByText('Eleanor Hayes')).not.toBeInTheDocument());
    expect(screen.getByText('No members yet.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // Exactly two calls total: the initial roster GET, then the DELETE —
    // no third call re-fetching the whole roster.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/heirloom/story-invites/collaborators', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story_id: 'story-1', member_id: 'member-1' }),
    });
  });

  it('a failed remove shows an inline error and does NOT silently drop the row', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          collaborators: [{ memberId: 'member-1', name: 'Eleanor Hayes', email: null, joinedAt: '2026-08-03T00:00:00Z' }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'Collaborator not found' }, false, 404));
    vi.stubGlobal('fetch', fetchMock);

    render(<StoryAdminPanel story={story} onClose={vi.fn()} onDescriptionCommit={vi.fn()} />);
    await screen.findByText('Eleanor Hayes');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Collaborator not found');
    // The row is still there — a failure never silently drops it. (Two
    // matches expected: the roster row itself, plus the dialog's own
    // "Remove Eleanor Hayes…" copy.)
    expect(screen.getAllByText('Eleanor Hayes')).toHaveLength(2);
    // The dialog stays open so the member can retry or cancel.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
