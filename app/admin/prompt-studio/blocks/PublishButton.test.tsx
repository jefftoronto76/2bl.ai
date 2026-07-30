import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, userEvent, waitFor } from '@/test/render'
import { PublishButton } from './PublishButton'

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))

// Optimistic concurrency (July 2026): PublishButton freezes activeSetVersion
// the moment Compile & Publish opens, and sends it back as expected_version
// on the actual publish POST — the RPC's guard against a slot that moved
// under the reviewer while the modal was open (see services/prompt/compile.ts
// and its RPC, publish_compiled_prompt). These tests exercise that contract
// end-to-end through the real component, not just the fetch payload shape.

let lastCompileBody: Record<string, unknown> | null

function mockFetch() {
  lastCompileBody = null
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/admin/prompt/preview') {
      return { ok: true, json: async () => ({ content: 'Compiled content.', tokenCount: 12 }) }
    }
    if (url === '/api/admin/prompt/compile') {
      lastCompileBody = JSON.parse((init?.body as string) ?? '{}')
      return {
        ok: true,
        json: async () => ({ success: true, version: 4, tokenCount: 12, content: 'x', updatedAt: '2026-07-30T00:00:00.000Z' }),
      }
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

async function openModal() {
  await userEvent.click(screen.getByRole('button', { name: /compile & publish/i }))
  await waitFor(() => expect(screen.getByText(/will publish as/i)).toBeInTheDocument())
}

async function advanceToPublish(nextVersion: number) {
  await userEvent.click(screen.getByRole('button', { name: 'Publish' }))
  await userEvent.type(screen.getByLabelText(/summary/i), 'Tighten escalation')
  await userEvent.click(screen.getByRole('button', { name: `Publish v${nextVersion}` }))
}

describe('PublishButton — expected_version wiring', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the current compiled version as expected_version', async () => {
    mockFetch()
    render(<PublishButton activeSetId="set-1" activeSetLabel="Sage Base" activeSetVersion={3} />)

    await openModal()
    expect(screen.getByText('v4')).toBeInTheDocument()
    await advanceToPublish(4)

    await waitFor(() => expect(lastCompileBody).not.toBeNull())
    expect(lastCompileBody?.expected_version).toBe(3)
    expect(lastCompileBody?.prompt_set_id).toBe('set-1')
  })

  it('sends null, not 0, for a slot that has never been compiled', async () => {
    mockFetch()
    render(<PublishButton activeSetId="set-1" activeSetLabel="Sage Base" activeSetVersion={0} />)

    await openModal()
    expect(screen.getByText('v1')).toBeInTheDocument()
    await advanceToPublish(1)

    await waitFor(() => expect(lastCompileBody).not.toBeNull())
    expect(lastCompileBody?.expected_version).toBeNull()
  })

  it('freezes the version at modal-open time — a live prop change while open does not leak into the request', async () => {
    mockFetch()
    const { rerender } = render(
      <PublishButton activeSetId="set-1" activeSetLabel="Sage Base" activeSetVersion={3} />,
    )

    await openModal()
    expect(screen.getByText('v4')).toBeInTheDocument()

    // Simulate the parent refetching and passing a newer version while the
    // modal is still open (another publish landed elsewhere, a realtime sync).
    rerender(<PublishButton activeSetId="set-1" activeSetLabel="Sage Base" activeSetVersion={5} />)

    // The modal keeps showing the frozen number, not the live prop.
    expect(screen.getByText('v4')).toBeInTheDocument()

    await advanceToPublish(4)

    await waitFor(() => expect(lastCompileBody).not.toBeNull())
    expect(lastCompileBody?.expected_version).toBe(3)
  })

  it('re-captures a fresh version on the next open after a publish', async () => {
    mockFetch()
    const { rerender } = render(
      <PublishButton activeSetId="set-1" activeSetLabel="Sage Base" activeSetVersion={3} />,
    )

    await openModal()
    await advanceToPublish(4)
    await waitFor(() => expect(screen.queryByText(/will publish as/i)).not.toBeInTheDocument())

    // Parent re-fetches after the successful publish and passes the new version.
    rerender(<PublishButton activeSetId="set-1" activeSetLabel="Sage Base" activeSetVersion={4} />)

    await openModal()
    expect(screen.getByText('v5')).toBeInTheDocument()
    await advanceToPublish(5)

    await waitFor(() => expect(lastCompileBody).not.toBeNull())
    expect(lastCompileBody?.expected_version).toBe(4)
  })
})
