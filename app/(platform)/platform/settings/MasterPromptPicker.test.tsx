import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/render'
import { CurrentSystemPromptPill } from './MasterPromptPicker'

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
        set={{ id: 'ps-1', label: 'Sage Base', tenantId: 't-1', tenantName: 'Jeff Lougheed', status: 'live', version: 3 }}
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
        set={{ id: 'ps-1', label: 'Sage Base', tenantId: 't-1', tenantName: 'Jeff Lougheed', status: 'live' }}
      />,
    )
    expect(screen.queryByText(/^Set by/)).not.toBeInTheDocument()

    rerender(
      <CurrentSystemPromptPill
        set={{ id: 'ps-1', label: 'Sage Base', tenantId: 't-1', tenantName: 'Jeff Lougheed', status: 'live' }}
        setByName="Jeff"
        setAt={new Date('2026-06-14').getTime()}
      />,
    )
    expect(screen.getByText(/^Set by Jeff/)).toBeInTheDocument()
  })

  it('marks a draft set with the Draft badge instead of Live', () => {
    render(
      <CurrentSystemPromptPill
        set={{ id: 'ps-2', label: 'Sales Draft', tenantId: 't-2', tenantName: 'Heirloom', status: 'draft' }}
      />,
    )

    expect(screen.getByText('Draft')).toBeInTheDocument()
  })
})
