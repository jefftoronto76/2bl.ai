import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, userEvent, waitFor, within } from '@/test/render'
import { TenantPrompts } from './TenantPrompts'
import type { PlatformPromptSet } from '@/lib/promptSet'

// "Open in Composer" calls next/navigation's useRouter() — no App Router is
// mounted in a unit test, so it must be mocked (first component in this
// suite to need it — see the test-pattern research from round one).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const SET_JEFF: PlatformPromptSet = {
  id: 'ps-1',
  tenant_id: 't-1',
  tenant_name: 'Jeff Lougheed',
  label: 'Sage Base',
  description: 'Base identity + tone',
  status: 'live',
  prompt_type_id: 'pt-1',
  version: 3,
  is_composer_prompt: false,
  is_default: false,
  block_count: 4,
  last_compiled_at: '2026-07-01T00:00:00.000Z',
  compiled_version: 3,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
}

const SET_HEIRLOOM: PlatformPromptSet = {
  ...SET_JEFF,
  id: 'ps-2',
  tenant_id: 't-2',
  tenant_name: 'Heirloom',
  label: 'Heirloom Base',
  description: 'Heirloom identity',
}

function mockFetch({
  sets = [SET_JEFF, SET_HEIRLOOM],
  savedSet,
}: {
  sets?: PlatformPromptSet[]
  savedSet?: PlatformPromptSet
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/platform/prompt-sets' && (!init || init.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => sets } as Response)
    }
    if (url === '/api/platform/prompt-sets' && init?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => savedSet } as Response)
    }
    if (url === '/api/platform/tenants') {
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: 't-1', name: 'Jeff Lougheed' },
          { id: 't-2', name: 'Heirloom' },
        ],
      } as Response)
    }
    if (url.startsWith('/api/platform/prompt-types')) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }
    throw new Error(`Unhandled fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('TenantPrompts — nested per-tenant tree', () => {
  afterEach(() => {
    // See page.test.tsx: vi.restoreAllMocks() also empties the plain-vi.fn()
    // ResizeObserver global mock from vitest.setup.ts, so only unstub here.
    vi.unstubAllGlobals()
  })

  it('renders every tenant closed by default, with its set count', async () => {
    mockFetch()
    render(<TenantPrompts />)

    expect(await screen.findByText('Jeff Lougheed')).toBeInTheDocument()
    expect(screen.getByText('Heirloom')).toBeInTheDocument()
    expect(screen.getAllByText('1 set')).toHaveLength(2)

    expect(screen.queryByText('Sage Base')).not.toBeInTheDocument()
    expect(screen.queryByText('Heirloom Base')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /jeff lougheed/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('clicking a tenant row expands it without affecting the other tenant', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<TenantPrompts />)

    const jeffRow = await screen.findByRole('button', { name: /jeff lougheed/i })
    await user.click(jeffRow)

    expect(await screen.findByText('Sage Base')).toBeInTheDocument()
    expect(jeffRow).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText('Heirloom Base')).not.toBeInTheDocument()
  })

  it('typing a search query force-expands only the matching tenant', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<TenantPrompts />)

    await screen.findByText('Jeff Lougheed')
    await user.type(screen.getByPlaceholderText(/search prompt set/i), 'Heirloom Base')

    expect(await screen.findByText('Heirloom Base')).toBeInTheDocument()
    expect(screen.queryByText('Sage Base')).not.toBeInTheDocument()
    // Jeff Lougheed doesn't match the query at all, so it's filtered out of the list entirely.
    expect(screen.queryByText('Jeff Lougheed')).not.toBeInTheDocument()
  })

  it('Add New opens a Modal dialog, not an inline card', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<TenantPrompts />)

    await screen.findByText('Jeff Lougheed')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add new/i }))

    expect(await screen.findByRole('dialog', { name: 'New prompt set' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Select a tenant')).toBeInTheDocument()
  })

  it('Edit opens the same Modal, prefilled, and leaves the card in place behind it', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<TenantPrompts />)

    await user.click(await screen.findByRole('button', { name: /jeff lougheed/i }))
    await user.click(await screen.findByRole('button', { name: /^edit sage base$/i }))

    const dialog = await screen.findByRole('dialog', { name: 'Edit prompt set' })
    expect(within(dialog).getByDisplayValue('Sage Base')).toBeInTheDocument()
    // The card itself is untouched by editingId — no inline form swaps in for it.
    expect(screen.getByRole('button', { name: /^edit sage base$/i })).toBeInTheDocument()
  })

  it('canceling the modal closes it without changing the list', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<TenantPrompts />)

    await screen.findByText('Jeff Lougheed')
    await user.click(screen.getByRole('button', { name: /add new/i }))
    await screen.findByRole('dialog', { name: 'New prompt set' })

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getAllByText('1 set')).toHaveLength(2)
  })

  it('saving a set expands and scrolls its tenant into view', async () => {
    const user = userEvent.setup()
    const saved: PlatformPromptSet = { ...SET_JEFF, id: 'ps-3', label: 'New Set', tenant_id: 't-2', tenant_name: 'Heirloom' }
    mockFetch({ savedSet: saved })
    render(<TenantPrompts />)

    await screen.findByText('Jeff Lougheed')
    await user.click(screen.getByRole('button', { name: /add new/i }))

    await user.click(screen.getByPlaceholderText('Select a tenant'))
    await user.click(await screen.findByRole('option', { name: 'Heirloom' }))
    await user.type(screen.getByPlaceholderText(/e\.g\. sage base/i), 'New Set')
    await user.click(screen.getByRole('button', { name: /^create set$/i }))

    // The newly-saved set's tenant (Heirloom) auto-expands to show it. Anchor
    // the name at the start — the tenant row's own card actions ("View
    // compiled prompt for Heirloom Base", "Edit Heirloom Base", …) also
    // contain "Heirloom" once the row is expanded.
    expect(await screen.findByText('New Set')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^heirloom/i })).toHaveAttribute('aria-expanded', 'true')
  })
})
