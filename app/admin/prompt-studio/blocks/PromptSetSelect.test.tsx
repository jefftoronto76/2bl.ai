import { describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent } from '@/test/render'
import { PromptSetSelect } from './PromptSetSelect'
import type { PromptSet } from './promptSets'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/admin/prompt-studio/blocks',
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

const TENANT_SET = makeSet({ id: 'set-tenant', label: 'Sage Base', status: 'live', version: 3 })
const COMPOSER_SET = makeSet({ id: 'set-composer', label: 'Composer v1', status: 'draft', isComposerPrompt: true })

describe('PromptSetSelect', () => {
  it('does not show the family switch when every set is the same family', async () => {
    const user = userEvent.setup()
    render(<PromptSetSelect sets={[TENANT_SET]} activeId="set-tenant" />)

    await user.click(screen.getByRole('button', { name: /sage base/i }))

    expect(screen.queryByText('2bl.ai')).not.toBeInTheDocument()
    expect(screen.queryByText('Composer')).not.toBeInTheDocument()
  })

  it('shows the family switch when both families are present, defaulting to the active set\'s own family', async () => {
    const user = userEvent.setup()
    render(<PromptSetSelect sets={[TENANT_SET, COMPOSER_SET]} activeId="set-tenant" />)

    await user.click(screen.getByRole('button', { name: /sage base/i }))

    const tenantTab = screen.getByRole('button', { name: '2bl.ai' })
    expect(tenantTab).toHaveAttribute('aria-pressed', 'true')
    // Browsing opens on the active set's family — its row is visible, the
    // composer set's is not, until the tab is switched.
    expect(screen.getByRole('menuitem', { name: /sage base/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /composer v1/i })).not.toBeInTheDocument()
  })

  it('switching the family tab filters the list without navigating or closing the menu', async () => {
    const user = userEvent.setup()
    render(<PromptSetSelect sets={[TENANT_SET, COMPOSER_SET]} activeId="set-tenant" />)

    await user.click(screen.getByRole('button', { name: /sage base/i }))
    await user.click(screen.getByRole('button', { name: 'Composer' }))

    expect(screen.getByRole('menuitem', { name: /composer v1/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /sage base/i })).not.toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('shows the Composer chip on the trigger only when the active set is composer-family', async () => {
    render(<PromptSetSelect sets={[TENANT_SET, COMPOSER_SET]} activeId="set-composer" />)
    expect(screen.getByText('Composer')).toBeInTheDocument()
  })

  it('no chip on the trigger for an ordinary tenant-family active set', () => {
    render(<PromptSetSelect sets={[TENANT_SET, COMPOSER_SET]} activeId="set-tenant" />)
    expect(screen.queryByText('Composer')).not.toBeInTheDocument()
  })

  it('picking a set in the browsed family navigates with ?set=<id>, stripping other params', async () => {
    const user = userEvent.setup()
    render(<PromptSetSelect sets={[TENANT_SET, COMPOSER_SET]} activeId="set-tenant" />)

    await user.click(screen.getByRole('button', { name: /sage base/i }))
    await user.click(screen.getByRole('button', { name: 'Composer' }))
    await user.click(screen.getByRole('menuitem', { name: /composer v1/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/prompt-studio/blocks?set=set-composer')
  })
})
