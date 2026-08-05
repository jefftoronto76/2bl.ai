import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, userEvent, waitFor } from '@/test/render'
import PlatformSettingsPage from './page'
import type { MasterPromptOption, MasterPromptSetting } from './types'

// page.tsx mounts <TenantPrompts>, which calls next/navigation's useRouter()
// for "Open in Composer" — no App Router is mounted in a unit test, so it
// must be mocked here too. page.tsx itself also now calls useRouter() for the
// Edit pencil's navigation to Blocks.
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const COMPOSER_OPTIONS: MasterPromptOption[] = [
  { id: 'ps-1', label: 'Composer v1', tenantId: 't-sbl', tenantName: 'Second Brain Labs', status: 'live', compiled_version: 3, is_composer_prompt: true },
]

function mockFetch({
  options = COMPOSER_OPTIONS,
  master = { promptSetId: 'ps-1' },
  createResponse,
}: {
  options?: MasterPromptOption[]
  master?: MasterPromptSetting
  createResponse?: { ok: boolean; body: unknown }
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/platform/prompt-sets' && init?.method === 'PATCH') {
      const response = createResponse ?? { ok: true, body: { id: 'ps-new', label: 'New', is_composer_prompt: true, status: 'draft' } }
      return Promise.resolve({ ok: response.ok, json: async () => response.body } as Response)
    }
    if (url === '/api/platform/prompt-sets') {
      return Promise.resolve({ ok: true, json: async () => options } as Response)
    }
    if (url === '/api/platform/tenants') {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }
    if (url.startsWith('/api/platform/prompt-types')) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }
    if (url === '/api/platform/settings/master-prompt') {
      return Promise.resolve({ ok: true, json: async () => master } as Response)
    }
    throw new Error(`Unhandled fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('PlatformSettingsPage — Composer Prompt (read-only list + Add New)', () => {
  afterEach(() => {
    // Only unstub — vi.restoreAllMocks() also clears the plain-vi.fn()
    // ResizeObserver global mock set up in vitest.setup.ts (it wasn't
    // created via vi.spyOn, so "restoring" it empties its implementation),
    // which breaks Mantine's Modal/ScrollArea on every test after the first.
    vi.unstubAllGlobals()
    pushMock.mockClear()
  })

  it('there is no Select, Save, Cancel, or Revert to fallback control anywhere on the page', async () => {
    mockFetch()
    render(<PlatformSettingsPage />)

    // "Composer v1" renders twice (the live pill + the list row) — wait on
    // the row's own pencil instead, which is unambiguous.
    await screen.findByRole('button', { name: 'Edit Composer v1 in Blocks' })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /revert to fallback/i })).not.toBeInTheDocument()
  })

  it('renders the empty state, with no picker, when there are no composer sets yet', async () => {
    mockFetch({ options: [], master: { promptSetId: null } })
    render(<PlatformSettingsPage />)

    expect(await screen.findByText('No composer prompt sets yet.')).toBeInTheDocument()
    expect(screen.queryByText('Composer v1')).not.toBeInTheDocument()
  })

  it('clicking a row\'s Edit pencil navigates to Blocks with that set selected', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<PlatformSettingsPage />)

    await user.click(await screen.findByRole('button', { name: 'Edit Composer v1 in Blocks' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/prompt-studio/blocks?set=ps-1')
  })

  it('Add New opens a modal, and creating one PATCHes is_composer_prompt: true with a forced draft status', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    render(<PlatformSettingsPage />)

    // "Composer v1" renders twice (the live pill + the list row) — wait on
    // the row's own pencil instead, which is unambiguous.
    await screen.findByRole('button', { name: 'Edit Composer v1 in Blocks' })
    // "Add New" also exists on TenantPrompts' own card below — the Composer
    // section's is first in DOM order.
    await user.click(screen.getAllByRole('button', { name: /add new/i })[0])

    const dialog = await screen.findByRole('dialog', { name: 'New composer prompt set' })
    await user.type(screen.getByPlaceholderText('e.g. Composer v2'), 'Composer v2')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/platform/prompt-sets',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ label: 'Composer v2', description: '', status: 'draft', is_composer_prompt: true }),
        }),
      )
    })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    void dialog
  })

  it('a failed create leaves the modal open with the entered label intact', async () => {
    const user = userEvent.setup()
    mockFetch({ createResponse: { ok: false, body: { error: 'Boom' } } })
    render(<PlatformSettingsPage />)

    // "Composer v1" renders twice (the live pill + the list row) — wait on
    // the row's own pencil instead, which is unambiguous.
    await screen.findByRole('button', { name: 'Edit Composer v1 in Blocks' })
    // "Add New" also exists on TenantPrompts' own card below — the Composer
    // section's is first in DOM order.
    await user.click(screen.getAllByRole('button', { name: /add new/i })[0])
    await screen.findByRole('dialog', { name: 'New composer prompt set' })
    await user.type(screen.getByPlaceholderText('e.g. Composer v2'), 'Composer v2')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'New composer prompt set' })).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Composer v2')).toBeInTheDocument()
  })
})
