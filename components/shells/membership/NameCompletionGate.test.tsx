// components/shells/membership/NameCompletionGate.test.tsx
//
// Item 3b — isolated unit tests for the name-completion interstitial.
// Mocks useChatStore directly (no ChatProvider needed — the component only
// reads state.isMember) and stubs global fetch for /api/members/me and
// /api/members/sync.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NAME_REQUIRED_SINCE } from '@/services/shared/rollout';

let isMember = true;

vi.mock('./chatStore', () => ({
  useChatStore: () => ({ state: { isMember } }),
}));

import { NameCompletionGate } from './NameCompletionGate';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  isMember = true;
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/members/me')) {
      return jsonResponse({ name: null, invitedName: null, createdAt: null });
    }
    return jsonResponse({ error: 'unexpected call' }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
});

const RECENT = '2026-09-10T00:00:00Z'; // after NAME_REQUIRED_SINCE
const OLD = '2020-01-01T00:00:00Z'; // before NAME_REQUIRED_SINCE

function meResponse(overrides: Partial<{ name: string | null; invitedName: string | null; createdAt: string | null }>) {
  return jsonResponse({ name: null, invitedName: null, createdAt: null, ...overrides });
}

describe('NameCompletionGate', () => {
  it('renders children immediately when the visitor is not a member', async () => {
    isMember = false;

    render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);

    expect(screen.getByText('chat surface')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders children while the /api/members/me check is still in flight', () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves

    render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);

    expect(screen.getByText('chat surface')).toBeInTheDocument();
  });

  it('renders the interstitial when no name is resolvable and createdAt is on/after the cutover', async () => {
    fetchMock.mockImplementation(async () => meResponse({ createdAt: NAME_REQUIRED_SINCE }));

    render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);

    await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument());
    expect(screen.queryByText('chat surface')).not.toBeInTheDocument();
  });

  it('does not gate when createdAt is before the cutover, even with no name (grandfathering)', async () => {
    fetchMock.mockImplementation(async () => meResponse({ createdAt: OLD }));

    render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('chat surface')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('First name')).not.toBeInTheDocument();
  });

  it('does not gate when a name is present, regardless of createdAt', async () => {
    fetchMock.mockImplementation(async () => meResponse({ name: 'Jane', createdAt: RECENT }));

    render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('chat surface')).toBeInTheDocument();
  });

  it('resolves the display name via invitedName when name is null, same precedence as resolveMemberName', async () => {
    fetchMock.mockImplementation(async () => meResponse({ invitedName: 'Invited Jane', createdAt: RECENT }));

    render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('chat surface')).toBeInTheDocument();
  });

  it('fails open on a 401 from /api/members/me', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'Unauthorized' }, 401));

    render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('chat surface')).toBeInTheDocument();
  });

  it('fails open on a non-ok response', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'boom' }, 500));

    render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('chat surface')).toBeInTheDocument();
  });

  it('fails open on a network throw', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });

    render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('chat surface')).toBeInTheDocument();
  });

  describe('once gated', () => {
    beforeEach(() => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/members/me')) return meResponse({ createdAt: RECENT });
        if (url.includes('/api/members/sync')) return jsonResponse({ member: { id: 'm1' } });
        return jsonResponse({ error: 'unexpected call' }, 500);
      });
    });

    it('submit button is disabled for an empty or whitespace-only name', async () => {
      render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);
      await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument());

      const button = screen.getByRole('button', { name: 'Continue' });
      expect(button).toBeDisabled();

      fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: '   ' } });
      expect(button).toBeDisabled();
    });

    it('submits to POST /api/members/sync with { name } only, never a session-claim endpoint', async () => {
      render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);
      await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Jane' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      await waitFor(() => {
        const syncCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/members/sync'));
        expect(syncCall).toBeDefined();
      });

      const syncCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/members/sync'))!;
      const [, init] = syncCall as [RequestInfo | URL, RequestInit];
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ name: 'Jane' });

      const claimCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/claim'));
      expect(claimCall).toBeUndefined();
    });

    it('clears the gate optimistically on a successful submit, without refetching /api/members/me', async () => {
      render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);
      await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument());

      const meCallsBefore = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/members/me')).length;

      fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Jane' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      await waitFor(() => expect(screen.getByText('chat surface')).toBeInTheDocument());

      const meCallsAfter = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/members/me')).length;
      expect(meCallsAfter).toBe(meCallsBefore);
    });

    it('keeps the gate up and shows an inline error on a failed submit', async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/members/me')) return meResponse({ createdAt: RECENT });
        if (url.includes('/api/members/sync')) return jsonResponse({ error: 'boom' }, 500);
        return jsonResponse({ error: 'unexpected call' }, 500);
      });

      render(<NameCompletionGate><p>chat surface</p></NameCompletionGate>);
      await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Jane' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      await waitFor(() => expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument());
      expect(screen.getByPlaceholderText('First name')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
    });
  });
});
