import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/render'
import type { PromptSet } from '@/components/admin/prompt-studio/promptSet'
import BlocksPage from './page'

const AUTH_CTX = { owner_id: 'owner-1', tenant_id: 'tenant-1' }

const { getAuthContextMock, getCurrentUserMock, resolveTenantForPromptSetMock, getPromptSetsMock } = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  resolveTenantForPromptSetMock: vi.fn(),
  getPromptSetsMock: vi.fn(),
}))

vi.mock('@/services/auth', () => ({
  getAuthContext: getAuthContextMock,
  getCurrentUser: getCurrentUserMock,
}))
vi.mock('@/services/prompt', () => ({
  resolveTenantForPromptSet: resolveTenantForPromptSetMock,
}))
vi.mock('./getPromptSets', () => ({
  getPromptSets: getPromptSetsMock,
}))

// page.tsx also queries `blocks` / `topics` / `compiled_prompts` directly via
// getAdminClient(). The not-found guard this test exercises returns before
// any of those run, so a builder that errors on use is enough to prove it.
vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({
    from() {
      throw new Error('blocks/topics/compiled_prompts should not be queried once the requested set is not found')
    },
  }),
}))

function makeSet(overrides: Partial<PromptSet> & Pick<PromptSet, 'id' | 'label'>): PromptSet {
  return {
    promptTypeId: null,
    version: 1,
    status: 'draft',
    lastCompiledAt: null,
    compiledVersion: null,
    isComposerPrompt: false,
    ...overrides,
  }
}

const LIVE_SET = makeSet({ id: 'set-live', label: 'Sage Base', status: 'live' })

describe('BlocksPage — requested-but-not-found prompt set', () => {
  beforeEach(() => {
    getAuthContextMock.mockReset().mockResolvedValue(AUTH_CTX)
    getCurrentUserMock.mockReset().mockResolvedValue({ isPlatformAdmin: false })
    resolveTenantForPromptSetMock.mockReset()
    getPromptSetsMock.mockReset()
  })

  it('shows an explicit not-found message, never a substituted set\'s blocks, when ?set= doesn\'t resolve', async () => {
    // The requested id is real (resolveTenantForPromptSet found it and let
    // the request through), but it isn't in THIS tenant's getPromptSets()
    // list — e.g. it belongs to a different tenant. Before the fix,
    // resolveActiveSet would have silently handed back the tenant's Live
    // set here instead.
    resolveTenantForPromptSetMock.mockResolvedValue({ ok: true, tenantId: 'tenant-1' })
    getPromptSetsMock.mockResolvedValue([LIVE_SET])

    const jsx = await BlocksPage({ searchParams: Promise.resolve({ set: 'set-does-not-exist' }) })
    render(jsx)

    expect(await screen.findByText('This prompt set could not be found.')).toBeInTheDocument()
    expect(screen.queryByText('Sage Base')).not.toBeInTheDocument()
  })

  it('shows the tenant-resolution error (e.g. cross-tenant 403) instead of falling through to a default set', async () => {
    resolveTenantForPromptSetMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'You do not have access to this prompt set.',
    })

    const jsx = await BlocksPage({ searchParams: Promise.resolve({ set: 'set-other-tenant' }) })
    render(jsx)

    expect(await screen.findByText('You do not have access to this prompt set.')).toBeInTheDocument()
    expect(getPromptSetsMock).not.toHaveBeenCalled()
  })
})
