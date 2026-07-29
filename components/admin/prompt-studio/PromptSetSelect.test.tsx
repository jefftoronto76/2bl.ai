import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, userEvent } from '@/test/render'
import { PromptSetSelect } from './PromptSetSelect'
import type { PromptSet } from './promptSet'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/admin/prompt-studio/blocks',
}))

afterEach(() => {
  pushMock.mockClear()
})

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

describe('PromptSetSelect — Blocks-style usage (no onSelect/onCreate)', () => {
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

  it('shows the Composer chip on the trigger only when the active set is composer-family', () => {
    render(<PromptSetSelect sets={[TENANT_SET, COMPOSER_SET]} activeId="set-composer" />)
    expect(screen.getByText('Composer')).toBeInTheDocument()
  })

  it('no chip on the trigger for an ordinary tenant-family active set', () => {
    render(<PromptSetSelect sets={[TENANT_SET, COMPOSER_SET]} activeId="set-tenant" />)
    expect(screen.queryByText('Composer')).not.toBeInTheDocument()
  })

  it('with no onSelect, picking a set in the browsed family navigates with ?set=<id>, stripping other params', async () => {
    const user = userEvent.setup()
    render(<PromptSetSelect sets={[TENANT_SET, COMPOSER_SET]} activeId="set-tenant" />)

    await user.click(screen.getByRole('button', { name: /sage base/i }))
    await user.click(screen.getByRole('button', { name: 'Composer' }))
    await user.click(screen.getByRole('menuitem', { name: /composer v1/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/prompt-studio/blocks?set=set-composer')
  })

  it('defaults the label to "Current Prompt Set"', () => {
    render(<PromptSetSelect sets={[TENANT_SET]} activeId="set-tenant" />)
    expect(screen.getByText('Current Prompt Set')).toBeInTheDocument()
  })

  it('has no "New prompt set…" affordance when onCreate is not supplied', async () => {
    const user = userEvent.setup()
    render(<PromptSetSelect sets={[TENANT_SET]} activeId="set-tenant" />)
    await user.click(screen.getByRole('button', { name: /sage base/i }))
    expect(screen.queryByText(/new prompt set/i)).not.toBeInTheDocument()
  })
})

describe('PromptSetSelect — Composer-style usage (onSelect + onCreate supplied)', () => {
  it('uses the supplied label', () => {
    render(<PromptSetSelect sets={[TENANT_SET]} activeId="set-tenant" label="Building in" onSelect={vi.fn()} />)
    expect(screen.getByText('Building in')).toBeInTheDocument()
  })

  it('calls onSelect instead of navigating when picking a set', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<PromptSetSelect sets={[TENANT_SET, COMPOSER_SET]} activeId="set-tenant" onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: /sage base/i }))
    await user.click(screen.getByRole('button', { name: 'Composer' }))
    await user.click(screen.getByRole('menuitem', { name: /composer v1/i }))

    expect(onSelect).toHaveBeenCalledWith('set-composer')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('renders the inline create form when onCreate is supplied, and submits label/type/description', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(
      <PromptSetSelect
        sets={[TENANT_SET]}
        activeId="set-tenant"
        onSelect={vi.fn()}
        onCreate={onCreate}
        promptTypes={[{ id: 'pt-1', name: 'Base' }]}
      />,
    )

    await user.click(screen.getByRole('button', { name: /sage base/i }))
    await user.click(screen.getByRole('menuitem', { name: /new prompt set/i }))

    await user.type(screen.getByLabelText('Name'), 'Composer v2')
    await user.type(screen.getByLabelText('Description'), 'A fresh draft')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    expect(onCreate).toHaveBeenCalledWith({ label: 'Composer v2', promptTypeId: null, description: 'A fresh draft' })
  })

  it('Create is disabled until a name is entered', async () => {
    const user = userEvent.setup()
    render(<PromptSetSelect sets={[TENANT_SET]} activeId="set-tenant" onSelect={vi.fn()} onCreate={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /sage base/i }))
    await user.click(screen.getByRole('menuitem', { name: /new prompt set/i }))

    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled()
  })

  it('Cancel returns to the plain set list without submitting', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<PromptSetSelect sets={[TENANT_SET]} activeId="set-tenant" onSelect={vi.fn()} onCreate={onCreate} />)

    await user.click(screen.getByRole('button', { name: /sage base/i }))
    await user.click(screen.getByRole('menuitem', { name: /new prompt set/i }))
    await user.type(screen.getByLabelText('Name'), 'Abandoned')
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('menuitem', { name: /sage base/i })).toBeInTheDocument()
  })
})
