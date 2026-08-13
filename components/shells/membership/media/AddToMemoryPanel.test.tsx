import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AddToMemoryPanel } from './AddToMemoryPanel';
import type { MediaItemWithUrl } from '@/services/media/display-url';

// Stage 3 (media_stages_08_2026/stage-3-icon-actions-workflows): the "+"
// icon's slide-in panel. No real persistence — see this file's own header
// comment for why (no many-to-many media<->memory attach mechanism exists
// in this schema) — confirm just toasts and closes, matching the design's
// own "UI-only" spec. The memory LIST itself is real, though: the item's
// own originating chat's saved memories via useMemories.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function makeItem(overrides: Partial<MediaItemWithUrl> = {}): MediaItemWithUrl {
  return {
    id: 'item-1',
    tenant_id: 'tenant-1',
    member_id: 'member-1',
    chat_id: 'chat-1',
    story_id: null,
    type: 'document',
    original_filename: 'letter.pdf',
    storage_path: 'tenant-1/media/member-1/item-1/letter.pdf',
    file_size_bytes: 1024,
    mime_type: 'application/pdf',
    status: 'ready',
    derived_content: null,
    classification: null,
    error_message: null,
    processed_at: '2026-08-05T00:00:00.000Z',
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    url: null,
    ...overrides,
  };
}

const MEMORY_1 = {
  id: 'mem-1',
  session_id: 'chat-1',
  anchor_message_id: 'm1',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer.',
  status: 'published',
  created_at: '2026-08-05T00:00:00.000Z',
  updated_at: '2026-08-05T00:00:00.000Z',
};

const MEMORY_2 = {
  id: 'mem-2',
  session_id: 'chat-1',
  anchor_message_id: 'm2',
  source_kind: 'photo',
  title: 'Grandma’s Kitchen',
  body: 'A photo of the kitchen.',
  status: 'published',
  created_at: '2026-08-05T00:00:00.000Z',
  updated_at: '2026-08-05T00:00:00.000Z',
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AddToMemoryPanel', () => {
  it('lists the item\'s own chat memories, lets the user select one, and toasts + closes on confirm (no persistence)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        if (url.toString().includes('/api/sessions/chat-1/memories')) {
          return jsonResponse({ memories: [MEMORY_1, MEMORY_2] });
        }
        return jsonResponse({});
      }),
    );

    const flash = vi.fn();
    const onClose = vi.fn();
    render(<AddToMemoryPanel item={makeItem()} onClose={onClose} flash={flash} />);

    await waitFor(() => expect(screen.getByText('The Lake House')).toBeInTheDocument());
    expect(screen.getByText('Grandma’s Kitchen')).toBeInTheDocument();

    const addButton = screen.getByRole('button', { name: 'Add to memory' });
    expect(addButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /The Lake House/ }));
    expect(screen.getByRole('button', { name: 'Add to 1 memory' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add to 1 memory' }));
    expect(flash).toHaveBeenCalledWith('Added to memory');
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(onClose).toHaveBeenCalledTimes(1);

    // No write beyond the GET that populated the list — this is UI-only.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const wroteAnything = fetchMock.mock.calls.some((call) => {
      const init = call[1] as RequestInit | undefined;
      return !!init?.method && init.method !== 'GET';
    });
    expect(wroteAnything).toBe(false);
  });

  it('shows an empty state when the chat has no saved memories yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ memories: [] })));

    render(<AddToMemoryPanel item={makeItem()} onClose={() => {}} flash={() => {}} />);

    await waitFor(() => expect(screen.getByText('No memories saved in this chat yet.')).toBeInTheDocument());
  });

  it('is inert and closed when no item is passed', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ memories: [] })));
    render(<AddToMemoryPanel item={null} onClose={() => {}} flash={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'Add to memory' })).toHaveAttribute('inert');
  });
});
