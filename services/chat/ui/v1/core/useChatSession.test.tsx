import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ChatSessionProvider, useChatSessionContext } from './ChatSessionProvider'
import { __clearSingletonRegistry } from './store-registry'
import { bufferThread, readThread, findMostRecentThread, __resetPersistenceForTests, DRAFT_ID } from '../persistence'

// ── fetch mock ──────────────────────────────────────────────────────────────
// Reproduces the three calls useChatTurn makes per turn: POST /api/sessions
// (lazy session create), POST /api/sage (the SSE-ish data stream), and
// PATCH /api/sessions/[id] (persist). The /api/sage response is a Vercel AI
// SDK data stream: lines of the form 0:"<delta>".

let sageShouldFail = false

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function streamResponse(text: string): Response {
  const payload = `0:${JSON.stringify(text)}\n`
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString()
  const method = init?.method ?? 'GET'
  if (url === '/api/sessions' && method === 'POST') return jsonResponse({ id: 'sess-1' })
  if (url.startsWith('/api/sessions/')) return jsonResponse({ ok: true }) // PATCH persist
  if (url === '/api/sage') {
    return sageShouldFail ? new Response('error', { status: 500 }) : streamResponse('Hello there')
  }
  throw new Error(`unexpected fetch: ${method} ${url}`)
})

function sessionCreateCount(): number {
  return fetchMock.mock.calls.filter(
    ([input, init]) => input === '/api/sessions' && (init?.method ?? 'GET') === 'POST',
  ).length
}

function sageCallCount(): number {
  return fetchMock.mock.calls.filter(([input]) => input === '/api/sage').length
}

// ── test consumer ─────────────────────────────────────────────────────────

function Consumer({ id }: { id: string }) {
  const s = useChatSessionContext()
  return (
    <div data-testid={id}>
      <span data-testid={`${id}-text`}>{s.messages.map((m) => `${m.role}:${m.content}`).join('|')}</span>
      <span data-testid={`${id}-error`}>{String(s.isError)}</span>
      <span data-testid={`${id}-sid`}>{String(s.sessionId)}</span>
      <button data-testid={`${id}-send`} onClick={() => void s.send('hi')}>send</button>
      <button data-testid={`${id}-retry`} onClick={() => void s.retry()}>retry</button>
      <button
        data-testid={`${id}-hydrate`}
        onClick={() =>
          s.hydrate({
            messages: [{ id: 'h1', role: 'user', content: 'recovered', timestamp: 1 }],
            sessionId: 'recovered-1',
          })
        }
      >
        hydrate
      </button>
      <button data-testid={`${id}-reset`} onClick={() => s.reset()}>reset</button>
    </div>
  )
}

beforeEach(async () => {
  sageShouldFail = false
  fetchMock.mockClear()
  __clearSingletonRegistry()
  await __resetPersistenceForTests('heirloom')
  await __resetPersistenceForTests('sage')
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sharing invariant (singleton, one provider, two surfaces)', () => {
  it('a message sent from one surface appears on the other', async () => {
    render(
      <ChatSessionProvider instanceKey="sage">
        <Consumer id="a" />
        <Consumer id="b" />
      </ChatSessionProvider>,
    )

    fireEvent.click(screen.getByTestId('a-send'))

    await waitFor(() =>
      expect(screen.getByTestId('a-text').textContent).toContain('assistant:Hello there'),
    )
    // The other surface observes the same conversation.
    expect(screen.getByTestId('b-text').textContent).toContain('user:hi')
    expect(screen.getByTestId('b-text').textContent).toContain('assistant:Hello there')
  })

  it('creates the shared session only once across surfaces', async () => {
    render(
      <ChatSessionProvider instanceKey="sage">
        <Consumer id="a" />
        <Consumer id="b" />
      </ChatSessionProvider>,
    )

    // First send creates the session.
    fireEvent.click(screen.getByTestId('a-send'))
    await waitFor(() =>
      expect(screen.getByTestId('a-text').textContent).toContain('assistant:Hello there'),
    )
    expect(sessionCreateCount()).toBe(1)

    // Second send from the OTHER surface reuses the shared sessionId — no
    // second POST /api/sessions.
    fireEvent.click(screen.getByTestId('b-send'))
    await waitFor(() => expect(sageCallCount()).toBe(2))
    expect(sessionCreateCount()).toBe(1)
  })
})

describe('shared retry state (single engine)', () => {
  it('an error from one surface is observed by all surfaces, and retry from any surface recovers', async () => {
    sageShouldFail = true
    render(
      <ChatSessionProvider instanceKey="sage">
        <Consumer id="a" />
        <Consumer id="b" />
      </ChatSessionProvider>,
    )

    fireEvent.click(screen.getByTestId('a-send'))

    // Both surfaces see the shared error state.
    await waitFor(() => expect(screen.getByTestId('a-error').textContent).toBe('true'))
    expect(screen.getByTestId('b-error').textContent).toBe('true')

    // Retry from the OTHER surface succeeds and clears the error on both.
    sageShouldFail = false
    fireEvent.click(screen.getByTestId('b-retry'))

    await waitFor(() =>
      expect(screen.getByTestId('b-text').textContent).toContain('assistant:Hello there'),
    )
    expect(screen.getByTestId('a-error').textContent).toBe('false')
    expect(screen.getByTestId('b-error').textContent).toBe('false')
    expect(sageCallCount()).toBe(2) // initial failure + retry
  })
})

describe('isolation invariant (no instanceKey)', () => {
  it('two providers without an instanceKey do not share a conversation', async () => {
    render(
      <>
        <ChatSessionProvider>
          <Consumer id="a" />
        </ChatSessionProvider>
        <ChatSessionProvider>
          <Consumer id="b" />
        </ChatSessionProvider>
      </>,
    )

    fireEvent.click(screen.getByTestId('a-send'))
    await waitFor(() =>
      expect(screen.getByTestId('a-text').textContent).toContain('assistant:Hello there'),
    )
    // The isolated sibling is untouched.
    expect(screen.getByTestId('b-text').textContent).toBe('')
  })
})

describe('convergence safety net (two providers, same key)', () => {
  it('separate providers sharing an instanceKey converge on one conversation store', async () => {
    render(
      <>
        <ChatSessionProvider instanceKey="shared">
          <Consumer id="a" />
        </ChatSessionProvider>
        <ChatSessionProvider instanceKey="shared">
          <Consumer id="b" />
        </ChatSessionProvider>
      </>,
    )

    fireEvent.click(screen.getByTestId('a-send'))
    await waitFor(() =>
      expect(screen.getByTestId('a-text').textContent).toContain('assistant:Hello there'),
    )
    // Even across separate provider trees, the shared store keeps the
    // conversation unified.
    expect(screen.getByTestId('b-text').textContent).toContain('assistant:Hello there')
  })
})

describe('hydrate (additive API)', () => {
  it('singleton: a hydrate on one surface is observed by all (jefflougheed unaffected)', () => {
    render(
      <ChatSessionProvider instanceKey="sage">
        <Consumer id="a" />
        <Consumer id="b" />
      </ChatSessionProvider>,
    )

    fireEvent.click(screen.getByTestId('a-hydrate'))

    expect(screen.getByTestId('a-text').textContent).toContain('user:recovered')
    expect(screen.getByTestId('b-text').textContent).toContain('user:recovered')
    expect(screen.getByTestId('a-sid').textContent).toBe('recovered-1')
    expect(screen.getByTestId('b-sid').textContent).toBe('recovered-1')
  })

  it('isolated: a hydrate affects only that instance', () => {
    render(
      <>
        <ChatSessionProvider>
          <Consumer id="a" />
        </ChatSessionProvider>
        <ChatSessionProvider>
          <Consumer id="b" />
        </ChatSessionProvider>
      </>,
    )

    fireEvent.click(screen.getByTestId('a-hydrate'))

    expect(screen.getByTestId('a-text').textContent).toContain('user:recovered')
    expect(screen.getByTestId('b-text').textContent).toBe('')
    expect(screen.getByTestId('b-sid').textContent).toBe('null')
  })
})

describe('reset (additive API)', () => {
  it('singleton: clears the shared conversation across all surfaces', async () => {
    render(
      <ChatSessionProvider instanceKey="sage">
        <Consumer id="a" />
        <Consumer id="b" />
      </ChatSessionProvider>,
    )

    fireEvent.click(screen.getByTestId('a-send'))
    await waitFor(() =>
      expect(screen.getByTestId('a-text').textContent).toContain('assistant:Hello there'),
    )
    expect(screen.getByTestId('a-sid').textContent).toBe('sess-1')

    fireEvent.click(screen.getByTestId('b-reset'))

    await waitFor(() => expect(screen.getByTestId('a-text').textContent).toBe(''))
    expect(screen.getByTestId('b-text').textContent).toBe('')
    expect(screen.getByTestId('a-sid').textContent).toBe('null')
  })

  it('clears the shared error state (reset clears isError)', async () => {
    sageShouldFail = true
    render(
      <ChatSessionProvider instanceKey="sage">
        <Consumer id="a" />
      </ChatSessionProvider>,
    )

    fireEvent.click(screen.getByTestId('a-send'))
    await waitFor(() => expect(screen.getByTestId('a-error').textContent).toBe('true'))

    fireEvent.click(screen.getByTestId('a-reset'))
    await waitFor(() => expect(screen.getByTestId('a-error').textContent).toBe('false'))
  })

  it('isolated: reset clears only that instance', async () => {
    render(
      <>
        <ChatSessionProvider>
          <Consumer id="a" />
        </ChatSessionProvider>
        <ChatSessionProvider>
          <Consumer id="b" />
        </ChatSessionProvider>
      </>,
    )

    fireEvent.click(screen.getByTestId('a-hydrate'))
    fireEvent.click(screen.getByTestId('b-hydrate'))
    expect(screen.getByTestId('a-text').textContent).toContain('user:recovered')

    fireEvent.click(screen.getByTestId('a-reset'))
    await waitFor(() => expect(screen.getByTestId('a-text').textContent).toBe(''))
    // b is a separate isolated instance — untouched by a's reset.
    expect(screen.getByTestId('b-text').textContent).toContain('user:recovered')
  })
})

describe('IndexedDB persistence (opt-in via persistNamespace)', () => {
  it('persists nothing when persistNamespace is omitted', async () => {
    render(
      <ChatSessionProvider>
        <Consumer id="a" />
      </ChatSessionProvider>,
    )
    fireEvent.click(screen.getByTestId('a-send'))
    await waitFor(() =>
      expect(screen.getByTestId('a-text').textContent).toContain('assistant:Hello there'),
    )
    expect(await findMostRecentThread('heirloom')).toBeNull()
    expect(await findMostRecentThread('sage')).toBeNull()
  })

  it('buffers at turn boundaries, re-keys draft to the session id, and rehydrates a fresh mount', async () => {
    const { unmount } = render(
      <ChatSessionProvider persistNamespace="sage">
        <Consumer id="a" />
      </ChatSessionProvider>,
    )
    fireEvent.click(screen.getByTestId('a-send'))
    await waitFor(() =>
      expect(screen.getByTestId('a-text').textContent).toContain('assistant:Hello there'),
    )

    await waitFor(async () => {
      expect(await readThread('sage', DRAFT_ID)).toBeNull()
      const thread = await readThread('sage', 'sess-1')
      expect(thread?.messages.map((m) => m.content)).toEqual(['hi', 'Hello there'])
    })

    unmount()

    render(
      <ChatSessionProvider persistNamespace="sage">
        <Consumer id="b" />
      </ChatSessionProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('b-text').textContent).toContain('assistant:Hello there'),
    )
    expect(screen.getByTestId('b-sid').textContent).toBe('sess-1')
  })

  it('flushes the live transcript on pagehide even without a turn boundary', async () => {
    render(
      <ChatSessionProvider persistNamespace="sage">
        <Consumer id="a" />
      </ChatSessionProvider>,
    )
    fireEvent.click(screen.getByTestId('a-hydrate')) // hydrate never touches isStreaming
    expect(await findMostRecentThread('sage')).toBeNull() // not buffered by hydrate itself

    window.dispatchEvent(new Event('pagehide'))

    await waitFor(async () => {
      const thread = await findMostRecentThread('sage')
      expect(thread?.sessionId).toBe('recovered-1')
    })
  })
})

describe('context guard', () => {
  it('throws when used outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Consumer id="orphan" />)).toThrow(/within a ChatSessionProvider/)
  })
})
