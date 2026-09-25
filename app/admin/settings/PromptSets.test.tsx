import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@/test/render'
import { PromptSets } from './PromptSets'
import type { PromptSet } from '@/lib/promptSet'

// PromptSets calls next/navigation's useRouter() ("Open in Composer") — no
// App Router is mounted in a unit test, so it must be mocked.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const SET_BASE: PromptSet = {
  id: 'ps-1',
  tenant_id: 't-1',
  label: 'Sage Base',
  description: 'Base identity + tone',
  status: 'live',
  prompt_type_id: 'pt-1',
  version: 1,
  is_composer_prompt: false,
  is_default: true,
  block_count: 4,
  last_compiled_at: '2026-07-01T00:00:00.000Z',
  compiled_version: 1,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
}

const SET_NEW: PromptSet = { ...SET_BASE, id: 'ps-2', label: 'Created Elsewhere', is_default: false }

function focusWindow() {
  window.dispatchEvent(new Event('focus'))
}

function listCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === '/api/admin/prompt-sets').length
}

function mockFetch(listResponder: () => Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/admin/prompt-sets') return listResponder()
    if (url === '/api/admin/prompt-types') {
      return Promise.resolve({ ok: true, json: async () => ({ types: [], canMakePlatform: false }) } as Response)
    }
    throw new Error(`Unhandled fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function ok(sets: PromptSet[]): Response {
  return { ok: true, json: async () => sets } as Response
}

describe('PromptSets — refetch on window focus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a set created elsewhere once the window regains focus', async () => {
    let sets: PromptSet[] = [SET_BASE]
    const fetchMock = mockFetch(() => Promise.resolve(ok(sets)))

    render(<PromptSets />)
    expect(await screen.findByText('Sage Base')).toBeInTheDocument()
    expect(screen.queryByText('Created Elsewhere')).not.toBeInTheDocument()

    sets = [SET_NEW, SET_BASE]
    await act(async () => focusWindow())

    expect(await screen.findByText('Created Elsewhere')).toBeInTheDocument()
    expect(listCalls(fetchMock)).toBe(2)
  })

  it('does not issue a second list request while the mount fetch is still pending', async () => {
    let release!: () => void
    const fetchMock = mockFetch(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(ok([SET_BASE]))
        }),
    )

    render(<PromptSets />)
    expect(listCalls(fetchMock)).toBe(1)

    focusWindow()
    focusWindow()
    expect(listCalls(fetchMock)).toBe(1)

    await act(async () => release())
    expect(await screen.findByText('Sage Base')).toBeInTheDocument()
    expect(listCalls(fetchMock)).toBe(1)
  })
})
