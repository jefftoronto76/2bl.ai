import { describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent } from '@/test/render'
import { CurrentSystemPromptPill, MasterPromptPicker } from './MasterPromptPicker'
import type { MasterPromptOption } from './types'

describe('CurrentSystemPromptPill', () => {
  it('renders the fallback state when no set is live', () => {
    render(<CurrentSystemPromptPill set={null} />)

    expect(screen.getByText('Using system fallback')).toBeInTheDocument()
    expect(screen.getByText('Fallback')).toBeInTheDocument()
    expect(screen.queryByText(/^Set by/)).not.toBeInTheDocument()
  })

  it('renders the live set — name, tenant, and status badge', () => {
    render(
      <CurrentSystemPromptPill
        set={{ id: 'ps-1', label: 'Sage Base', tenantId: 't-1', tenantName: 'Jeff Lougheed', status: 'live', version: 3, is_composer_prompt: true }}
      />,
    )

    expect(screen.getByText('Sage Base')).toBeInTheDocument()
    expect(screen.getByText('Jeff Lougheed')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.queryByText('Using system fallback')).not.toBeInTheDocument()
    expect(screen.queryByText('Fallback')).not.toBeInTheDocument()
  })

  it('renders "Set by … · date" only when setByName is supplied', () => {
    const { rerender } = render(
      <CurrentSystemPromptPill
        set={{ id: 'ps-1', label: 'Sage Base', tenantId: 't-1', tenantName: 'Jeff Lougheed', status: 'live', is_composer_prompt: true }}
      />,
    )
    expect(screen.queryByText(/^Set by/)).not.toBeInTheDocument()

    rerender(
      <CurrentSystemPromptPill
        set={{ id: 'ps-1', label: 'Sage Base', tenantId: 't-1', tenantName: 'Jeff Lougheed', status: 'live', is_composer_prompt: true }}
        setByName="Jeff"
        setAt={new Date('2026-06-14').getTime()}
      />,
    )
    expect(screen.getByText(/^Set by Jeff/)).toBeInTheDocument()
  })

  it('marks a draft set with the Draft badge instead of Live', () => {
    render(
      <CurrentSystemPromptPill
        set={{ id: 'ps-2', label: 'Sales Draft', tenantId: 't-2', tenantName: 'Heirloom', status: 'draft', is_composer_prompt: true }}
      />,
    )

    expect(screen.getByText('Draft')).toBeInTheDocument()
  })
})

const COMPOSER_OPTIONS: MasterPromptOption[] = [
  { id: 'ps-1', label: 'Composer v1', tenantId: 't-sbl', tenantName: 'Second Brain Labs', status: 'live', version: 3, is_composer_prompt: true },
  { id: 'ps-2', label: 'Composer v2 draft', tenantId: 't-sbl', tenantName: 'Second Brain Labs', status: 'draft', version: 1, is_composer_prompt: true },
]

describe('MasterPromptPicker — read-only list', () => {
  it('renders nothing when there are no composer-family options', () => {
    render(<MasterPromptPicker options={[]} onEdit={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders a row per set with label, status badge, and version — no Select, no per-row "Composer Prompt" badge', () => {
    render(<MasterPromptPicker options={COMPOSER_OPTIONS} onEdit={vi.fn()} />)

    expect(screen.getByText('Composer v1')).toBeInTheDocument()
    expect(screen.getByText('Composer v2 draft')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('v3')).toBeInTheDocument()
    expect(screen.queryByText('Composer Prompt')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('clicking a row\'s Edit pencil calls onEdit with that option, not the others', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<MasterPromptPicker options={COMPOSER_OPTIONS} onEdit={onEdit} />)

    await user.click(screen.getByRole('button', { name: 'Edit Composer v2 draft in Blocks' }))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(COMPOSER_OPTIONS[1])
  })
})
