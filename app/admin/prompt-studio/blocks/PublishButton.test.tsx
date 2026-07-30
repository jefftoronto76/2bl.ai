import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, userEvent, waitFor } from '@/test/render'
import { PublishButton } from './PublishButton'
import { notifications } from '@mantine/notifications'

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

// Optimistic concurrency (July 2026): PublishButton freezes activeSetVersion
// the moment Compile & Publish opens, and sends it back as expected_version
// on the actual publish POST — the RPC's guard against a slot that moved
// under the reviewer while the modal was open (see services/prompt/compile.ts
// and its RPC, publish_compiled_prompt). These tests exercise that contract
// end-to-end through the real component, not just the fetch payload shape.
//
// Publish animation fix (July 2026): the modal's stage-4 checklist now tracks
// the REAL request (see CompilePublishModal.tsx) instead of an independent
// decorative timer — clicking "Publish vN" no longer closes the modal by
// itself. It fires the request immediately (same as before, verified by the
// tests below that never click past "Publish vN"), then shows a success
// screen once the request actually resolves; only that screen's "Okay"
// button closes the modal and refreshes the Blocks screen's status data. A
// failed request drops the modal back to the note stage instead.

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

function mockFetchWithCompileFailure() {
  lastCompileBody = null
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/admin/prompt/preview') {
      return { ok: true, json: async () => ({ content: 'Compiled content.', tokenCount: 12 }) }
    }
    if (url === '/api/admin/prompt/compile') {
      lastCompileBody = JSON.parse((init?.body as string) ?? '{}')
      return { ok: false, json: async () => ({ error: 'Another publish for this prompt type just landed.' }) }
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

async function completePublish() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Okay' })).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: 'Okay' }))
}

describe('PublishButton — expected_version wiring', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    refreshMock.mockClear()
    vi.mocked(notifications.show).mockClear()
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
    await completePublish()
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

describe('PublishButton — publish animation tracks the real request', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    refreshMock.mockClear()
    vi.mocked(notifications.show).mockClear()
  })

  it('does not show the success screen until the real request resolves, then Okay closes and refreshes', async () => {
    mockFetch()
    render(<PublishButton activeSetId="set-1" activeSetLabel="Sage Base" activeSetVersion={3} />)

    await openModal()
    await advanceToPublish(4)

    // The checklist stage is showing — the success screen has not appeared yet.
    expect(screen.getByText(/validating blocks/i)).toBeInTheDocument()
    expect(screen.queryByText('v4 is live')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('v4 is live')).toBeInTheDocument())
    expect(refreshMock).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Okay' }))

    expect(refreshMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText('v4 is live')).not.toBeInTheDocument())
  })

  it('a failed publish drops back to the note stage instead of the success screen, and never refreshes', async () => {
    mockFetchWithCompileFailure()
    render(<PublishButton activeSetId="set-1" activeSetLabel="Sage Base" activeSetVersion={3} />)

    await openModal()
    await advanceToPublish(4)

    // Back on the note stage, retryable — not stuck on the checklist and not
    // sailed through to a false success screen.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish v4' })).toBeInTheDocument())
    expect(screen.queryByText('v4 is live')).not.toBeInTheDocument()

    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red', title: 'Publish failed' }),
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
