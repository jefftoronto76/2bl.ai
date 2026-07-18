import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, userEvent, waitFor } from '@/test/render'
import PlatformSettingsPage from './page'
import type { MasterPromptOption, MasterPromptSetting } from './types'

// page.tsx mounts <TenantPrompts>, which calls next/navigation's useRouter()
// for "Open in Composer" — no App Router is mounted in a unit test, so it
// must be mocked here too (see the test-pattern research: no existing
// precedent in this suite for a component using useRouter).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const OPTIONS: MasterPromptOption[] = [
  { id: 'ps-1', label: 'Sage Base', tenantId: 't-1', tenantName: 'Jeff Lougheed', status: 'live', version: 3 },
]

function mockFetch({
  options = OPTIONS,
  master = { promptSetId: 'ps-1' },
  revertResponse = { ok: true, body: { promptSetId: null } },
}: {
  options?: MasterPromptOption[]
  master?: MasterPromptSetting
  revertResponse?: { ok: boolean; body: unknown }
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/platform/prompt-sets') {
      return Promise.resolve({ ok: true, json: async () => options } as Response)
    }
    if (url === '/api/platform/tenants') {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }
    if (url === '/api/platform/settings/master-prompt' && init?.method === 'PUT') {
      return Promise.resolve({ ok: revertResponse.ok, json: async () => revertResponse.body } as Response)
    }
    if (url === '/api/platform/settings/master-prompt') {
      return Promise.resolve({ ok: true, json: async () => master } as Response)
    }
    throw new Error(`Unhandled fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('PlatformSettingsPage — Composer Prompt fallback + revert', () => {
  afterEach(() => {
    // Only unstub — vi.restoreAllMocks() also clears the plain-vi.fn()
    // ResizeObserver global mock set up in vitest.setup.ts (it wasn't
    // created via vi.spyOn, so "restoring" it empties its implementation),
    // which breaks Mantine's Modal/ScrollArea on every test after the first.
    vi.unstubAllGlobals()
  })

  it('Revert button is disabled while already on fallback', async () => {
    mockFetch({ master: { promptSetId: null } })
    render(<PlatformSettingsPage />)

    expect(await screen.findByText('Using system fallback')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /revert to fallback/i })).toBeDisabled()
  })

  it('Revert button is enabled when a set is live, and confirming PUTs promptSetId: null', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    render(<PlatformSettingsPage />)

    const revertButton = await screen.findByRole('button', { name: /revert to fallback/i })
    expect(revertButton).toBeEnabled()
    expect(screen.getAllByText('Sage Base').length).toBeGreaterThan(0)

    await user.click(revertButton)
    expect(await screen.findByText(/this turns off the current composer prompt/i)).toBeInTheDocument()

    const confirmButtons = screen.getAllByRole('button', { name: /^revert to fallback$/i })
    await user.click(confirmButtons[confirmButtons.length - 1])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/platform/settings/master-prompt',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ promptSetId: null }),
        }),
      )
    })

    expect(await screen.findByText('Using system fallback')).toBeInTheDocument()
    // The modal's own confirm button unmounts asynchronously on close — wait
    // for it to clear so only the page-level trigger button remains.
    expect(await screen.findByRole('button', { name: /^revert to fallback$/i })).toBeDisabled()
  })

  it('leaves the live pill and the confirm modal open when the revert request fails', async () => {
    const user = userEvent.setup()
    mockFetch({ revertResponse: { ok: false, body: { error: 'Boom' } } })
    render(<PlatformSettingsPage />)

    await user.click(await screen.findByRole('button', { name: /revert to fallback/i }))
    const confirmButtons = screen.getAllByRole('button', { name: /^revert to fallback$/i })
    await user.click(confirmButtons[confirmButtons.length - 1])

    // Failure returns early without clearing confirmRevert — modal copy still present.
    await waitFor(() => {
      expect(screen.getByText(/this turns off the current composer prompt/i)).toBeInTheDocument()
    })
    expect(screen.getAllByText('Sage Base').length).toBeGreaterThan(0)
    expect(screen.queryByText('Using system fallback')).not.toBeInTheDocument()
  })
})
