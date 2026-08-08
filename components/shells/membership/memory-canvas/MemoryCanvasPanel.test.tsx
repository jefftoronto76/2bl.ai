// Component-level coverage for the memory canvas panel (Stage 1: list +
// card view, browse mode only — select mode is a later stage). Mocks fetch
// directly rather than the useMemories hook, mirroring this shell's
// established convention (see ../memory/bookmark-scoping-and-retry.test.tsx).
import { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryCanvasPanel } from './MemoryCanvasPanel';
import type { MemoryCanvasMode } from './types';
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const MEM_1: MemoryRow = {
  id: 'mem-1',
  session_id: 'sess-1',
  anchor_message_id: 'm1',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the water.',
  status: 'published',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

const MEM_2: MemoryRow = {
  id: 'mem-2',
  session_id: 'sess-1',
  anchor_message_id: 'm3',
  source_kind: 'photo',
  title: 'The Garden',
  body: 'The garden bloomed every June.',
  status: 'published',
  created_at: '2026-08-02T00:00:00.000Z',
  updated_at: '2026-08-02T00:00:00.000Z',
};

describe('MemoryCanvasPanel', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let patchCalls: Array<{ url: string; body: unknown }>;

  beforeEach(() => {
    patchCalls = [];
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.endsWith('/memories') && method === 'GET') return jsonResponse({ memories: [MEM_1, MEM_2] });
      if (/\/memories\/mem-\d$/.test(url) && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        patchCalls.push({ url, body });
        if (body.action === 'discard') return jsonResponse({ ok: true });
        return jsonResponse({ memory: { ...MEM_1, title: body.title ?? MEM_1.title } });
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function Harness({ initialMode }: { initialMode: MemoryCanvasMode }) {
    const [mode, setMode] = useState<MemoryCanvasMode>(initialMode);
    return (
      <MemoryCanvasPanel
        sessionId="sess-1"
        mode={mode}
        onModeChange={setMode}
        onClose={() => setMode({ view: 'closed' })}
        stories={[]}
        onMoveToStory={() => {}}
      />
    );
  }

  it('closed mode renders nothing', () => {
    const { container } = render(<Harness initialMode={{ view: 'closed' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('list view renders every fetched memory and opens a card on click', async () => {
    render(<Harness initialMode={{ view: 'list' }} />);

    await waitFor(() => expect(screen.getByText('The Lake House')).toBeTruthy());
    expect(screen.getByText('The Garden')).toBeTruthy();
    expect(screen.getByText('2 kept this session')).toBeTruthy();

    fireEvent.click(screen.getByText('The Lake House').closest('button')!);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'The Lake House' })).toBeTruthy());
    expect(screen.getByText('It was a quiet summer by the water.')).toBeTruthy();
  });

  it('empty list shows the empty-state copy, not a blank panel', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ memories: [] }));
    render(<Harness initialMode={{ view: 'list' }} />);
    await waitFor(() => expect(screen.getByText('No memories kept yet.')).toBeTruthy());
  });

  it('card view: editing the title commits a trimmed rename on Enter', async () => {
    render(<Harness initialMode={{ view: 'card', memoryId: 'mem-1' }} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'The Lake House' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Edit title' }));

    const input = screen.getByRole('textbox', { name: 'Memory title' });
    fireEvent.change(input, { target: { value: '  The Lake House, Revisited  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(patchCalls.length).toBe(1));
    expect(patchCalls[0]).toEqual({
      url: expect.stringContaining('/memories/mem-1'),
      body: { action: 'retitle', title: 'The Lake House, Revisited' },
    });
  });

  it('card view: Escape reverts the title without calling rename', async () => {
    render(<Harness initialMode={{ view: 'card', memoryId: 'mem-1' }} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'The Lake House' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Edit title' }));

    const input = screen.getByRole('textbox', { name: 'Memory title' });
    fireEvent.change(input, { target: { value: 'Something else entirely' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.getByRole('heading', { name: 'The Lake House' })).toBeTruthy();
    expect(patchCalls.length).toBe(0);
  });

  it('card view: Remove calls discard and returns to the list', async () => {
    render(<Harness initialMode={{ view: 'card', memoryId: 'mem-1' }} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'The Lake House' })).toBeTruthy());
    fireEvent.click(screen.getByText('Remove'));

    await waitFor(() => expect(patchCalls.length).toBe(1));
    expect(patchCalls[0].body).toEqual({ action: 'discard' });
    await waitFor(() => expect(screen.getByText('Memories from this chat')).toBeTruthy());
  });

  it('card view: "Talk about this" / "Use as a base" fire a local stub toast, not a network call', async () => {
    render(<Harness initialMode={{ view: 'card', memoryId: 'mem-1' }} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'The Lake House' })).toBeTruthy());
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByText('Talk about this'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Talking about this is coming soon.'));
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('a stale memoryId with no seed falls back to the list view', async () => {
    render(<Harness initialMode={{ view: 'card', memoryId: 'not-a-real-id' }} />);
    await waitFor(() => expect(screen.getByText('Memories from this chat')).toBeTruthy());
  });

  it('a seedMemory renders immediately, before the panel\'s own fetch resolves', async () => {
    // Never resolves within the test — proves the card renders from seedMemory
    // alone, not from the GET.
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const seed: MemoryRow = { ...MEM_1, id: 'mem-fresh', title: 'Just Kept' };
    render(<Harness initialMode={{ view: 'card', memoryId: 'mem-fresh', seedMemory: seed }} />);
    expect(screen.getByRole('heading', { name: 'Just Kept' })).toBeTruthy();
  });

  it('compact renders icon-only footer actions (accessible name still present)', async () => {
    function CompactHarness() {
      const [mode, setMode] = useState<MemoryCanvasMode>({ view: 'card', memoryId: 'mem-1' });
      return (
        <MemoryCanvasPanel
          sessionId="sess-1"
          mode={mode}
          onModeChange={setMode}
          onClose={() => setMode({ view: 'closed' })}
          stories={[]}
          onMoveToStory={() => {}}
          compact
        />
      );
    }
    render(<CompactHarness />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'The Lake House' })).toBeTruthy());
    const removeBtn = screen.getByRole('button', { name: 'Remove' });
    expect(within(removeBtn).queryByText('Remove')).toBeNull();
    expect(screen.getByRole('button', { name: 'Talk about this' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use as a base' })).toBeTruthy();
  });
});
