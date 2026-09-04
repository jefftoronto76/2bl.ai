// First-ever test coverage for this route. Focused on the story-invite
// branch added alongside acceptStoryInvite's insert-race hardening
// (services/crm/story-invites.ts) — the user.created/user.updated cascade
// now checks Clerk unsafeMetadata for heirloom_story_invite_token BEFORE
// falling into the pre-existing linkInvitedMember/syncMember cascade, so
// whichever of {webhook, client} runs first performs the correctly-scoped
// story-invite insert. Signature verification (svix) and header reads
// (next/headers) are mocked out entirely — this file exercises the
// post-verification branching logic only, not svix's own crypto.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockVerify = vi.fn()
vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({ verify: mockVerify })),
}))

const mockHeadersGet = vi.fn()
vi.mock('next/headers', () => ({
  headers: async () => ({ get: mockHeadersGet }),
}))

const mockLogAuthEvent = vi.fn()
vi.mock('@/services/audit', () => ({
  logAuthEvent: (...args: unknown[]) => mockLogAuthEvent(...args),
}))

const mockGetAdminClient = vi.fn((..._args: unknown[]) => ({
  from: () => ({
    upsert: () => Promise.resolve({ error: null }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }),
}))
vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: (...args: unknown[]) => mockGetAdminClient(...args),
}))

const mockFindUserByClerkId = vi.fn()
const mockGetTenantFromRequest = vi.fn()
const mockSyncMember = vi.fn()
vi.mock('@/services/auth', () => ({
  findUserByClerkId: (...args: unknown[]) => mockFindUserByClerkId(...args),
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
  syncMember: (...args: unknown[]) => mockSyncMember(...args),
  HEIRLOOM_TENANT_ID: 'heirloom-tenant',
}))

const mockLinkInvitedMember = vi.fn()
vi.mock('@/services/members', () => ({
  linkInvitedMember: (...args: unknown[]) => mockLinkInvitedMember(...args),
}))

const mockAcceptStoryInvite = vi.fn()
vi.mock('@/services/crm/story-invites', () => ({
  acceptStoryInvite: (...args: unknown[]) => mockAcceptStoryInvite(...args),
}))

import { POST } from './route'

function makeRequest(payload: Record<string, unknown>): Request {
  const body = JSON.stringify(payload)
  return { text: async () => body } as unknown as Request
}

function userCreatedPayload(unsafeMetadata: Record<string, unknown> = {}) {
  return {
    type: 'user.created',
    data: {
      id: 'clerk-1',
      email_addresses: [{ email_address: 'a@example.com' }],
      unsafe_metadata: unsafeMetadata,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CLERK_WEBHOOK_SECRET = 'test-secret'

  mockHeadersGet.mockImplementation((key: string) => {
    if (key === 'svix-id') return 'id-1'
    if (key === 'svix-timestamp') return '123'
    if (key === 'svix-signature') return 'sig'
    return null
  })
  mockVerify.mockImplementation((rawBody: string) => JSON.parse(rawBody))
  mockGetTenantFromRequest.mockResolvedValue('heirloom-tenant')
  mockFindUserByClerkId.mockResolvedValue({ id: 'user-1' })
  mockSyncMember.mockResolvedValue({ ok: true })
  mockLinkInvitedMember.mockResolvedValue(false)
  mockAcceptStoryInvite.mockResolvedValue({
    ok: true,
    data: { memberId: 'member-1', storyId: 'story-1', storyTitle: 'A Life in Full', isNewMember: true },
  })
})

afterEach(() => {
  delete process.env.CLERK_WEBHOOK_SECRET
})

describe('POST /api/webhooks/clerk — story-invite branch', () => {
  it('a story-invite token that accepts successfully calls acceptStoryInvite and skips linkInvitedMember/syncMember entirely', async () => {
    const res = await POST(makeRequest(userCreatedPayload({ heirloom_story_invite_token: 'story-tok' })))

    expect(res.status).toBe(200)
    expect(mockFindUserByClerkId).toHaveBeenCalledWith('clerk-1')
    expect(mockAcceptStoryInvite).toHaveBeenCalledWith('story-tok', 'clerk-1', 'user-1', 'heirloom-tenant', null)
    expect(mockLinkInvitedMember).not.toHaveBeenCalled()
    expect(mockSyncMember).not.toHaveBeenCalled()
  })

  it('passes the joined first_name/last_name through to acceptStoryInvite as name', async () => {
    const res = await POST(makeRequest({
      type: 'user.created',
      data: {
        id: 'clerk-1',
        email_addresses: [{ email_address: 'a@example.com' }],
        first_name: 'Ada',
        last_name: 'Lovelace',
        unsafe_metadata: { heirloom_story_invite_token: 'story-tok' },
      },
    }))

    expect(res.status).toBe(200)
    expect(mockAcceptStoryInvite).toHaveBeenCalledWith('story-tok', 'clerk-1', 'user-1', 'heirloom-tenant', 'Ada Lovelace')
  })

  it('an invalid/expired story-invite token falls through to the existing linkInvitedMember/syncMember cascade', async () => {
    mockAcceptStoryInvite.mockResolvedValue({ ok: false, status: 410, error: 'This invite link has expired.' })

    const res = await POST(makeRequest(userCreatedPayload({ heirloom_story_invite_token: 'stale-tok' })))

    expect(res.status).toBe(200)
    expect(mockAcceptStoryInvite).toHaveBeenCalledWith('stale-tok', 'clerk-1', 'user-1', 'heirloom-tenant', null)
    expect(mockLinkInvitedMember).toHaveBeenCalledWith('clerk-1', 'a@example.com', null, null)
    expect(mockSyncMember).toHaveBeenCalledTimes(1)
  })

  it("passes source: 'clerk_webhook' and the svix-id as correlationId to both the direct users upsert and syncMember (Gate 3 attribution)", async () => {
    const res = await POST(makeRequest(userCreatedPayload()))

    expect(res.status).toBe(200)
    // The direct `users` upsert getAdminClient() call, made before the
    // linkInvitedMember/syncMember cascade.
    expect(mockGetAdminClient).toHaveBeenCalledWith('clerk_webhook', { correlationId: 'id-1' })
    const [syncCall] = mockSyncMember.mock.calls[0] as [Record<string, unknown>]
    expect(syncCall.source).toBe('clerk_webhook')
    expect(syncCall.correlationId).toBe('id-1')
  })

  it('a payload with no story-invite metadata at all is completely unaffected — existing cascade runs unchanged', async () => {
    const res = await POST(makeRequest(userCreatedPayload()))

    expect(res.status).toBe(200)
    expect(mockAcceptStoryInvite).not.toHaveBeenCalled()
    expect(mockLinkInvitedMember).toHaveBeenCalledWith('clerk-1', 'a@example.com', null, null)
    expect(mockSyncMember).toHaveBeenCalledTimes(1)
  })

  it('passes the joined first_name/last_name through to linkInvitedMember as name', async () => {
    const res = await POST(makeRequest({
      type: 'user.created',
      data: {
        id: 'clerk-1',
        email_addresses: [{ email_address: 'a@example.com' }],
        first_name: 'Ada',
        last_name: 'Lovelace',
        unsafe_metadata: {},
      },
    }))

    expect(res.status).toBe(200)
    expect(mockLinkInvitedMember).toHaveBeenCalledWith('clerk-1', 'a@example.com', null, 'Ada Lovelace')
  })

  it('linkInvitedMember stamping an invited row still skips syncMember, unaffected by the new story-invite branch', async () => {
    mockLinkInvitedMember.mockResolvedValue(true)

    const res = await POST(makeRequest(userCreatedPayload()))

    expect(res.status).toBe(200)
    expect(mockAcceptStoryInvite).not.toHaveBeenCalled()
    expect(mockLinkInvitedMember).toHaveBeenCalledWith('clerk-1', 'a@example.com', null, null)
    expect(mockSyncMember).not.toHaveBeenCalled()
  })
})

// D9 fix: the "heirloom_invite_token absent from unsafeMetadata" log line
// (the non-invite / GateView-modal-sign-up path — no story-invite token, no
// heirloom_invite_token, so linkInvitedMember runs its email fallback) used
// to log the raw email value.
describe('POST /api/webhooks/clerk — D9, no raw email in console output', () => {
  it('never logs the raw email when no invite token is present in unsafeMetadata', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockLinkInvitedMember.mockResolvedValue(false)

    const res = await POST(makeRequest(userCreatedPayload()))

    const output = logSpy.mock.calls.map((args) => JSON.stringify(args)).join('\n')
    logSpy.mockRestore()

    expect(res.status).toBe(200)
    expect(output).not.toContain('a@example.com')
    expect(output).toContain('heirloom_invite_token absent from unsafeMetadata')
  })
})

// auth_events.email is permanent, queryable storage (not a console log) —
// the sign_up logAuthEvent call used to write the raw email into it.
describe('POST /api/webhooks/clerk — auth_events.email is hashed, not raw', () => {
  it('passes an 8-hex-char hash, never the raw email, to logAuthEvent', async () => {
    mockLinkInvitedMember.mockResolvedValue(false)

    await POST(makeRequest(userCreatedPayload()))

    expect(mockLogAuthEvent).toHaveBeenCalledOnce()
    const [arg] = mockLogAuthEvent.mock.calls[0] as [Record<string, unknown>]
    expect(arg.event_type).toBe('sign_up')
    expect(arg.email).toMatch(/^[0-9a-f]{8}$/)
    expect(arg.email).not.toBe('a@example.com')
  })

  it('passes null, not empty string, when the Clerk payload has no email', async () => {
    mockLinkInvitedMember.mockResolvedValue(false)

    await POST(makeRequest({
      type: 'user.created',
      data: { id: 'clerk-1', phone_numbers: [{ phone_number: '+15551234567' }], unsafe_metadata: {} },
    }))

    expect(mockLogAuthEvent).toHaveBeenCalledOnce()
    const [arg] = mockLogAuthEvent.mock.calls[0] as [Record<string, unknown>]
    expect(arg.email).toBeNull()
  })
})

// members.source (services/shared/identity.ts's MemberSource) — distinct
// from the Gate 3 `source: 'clerk_webhook'` attribution already asserted
// above. Resolves which self-serve bucket the webhook's own syncMember
// fallback should use, based on the heirloom_signup_surface marker the
// custom OTP client flow writes to unsafeMetadata.
describe('POST /api/webhooks/clerk — memberSource resolution for the syncMember fallback', () => {
  it("passes memberSource: 'self_serve_chat' when heirloom_signup_surface: 'custom_otp' is present", async () => {
    const res = await POST(makeRequest(userCreatedPayload({ heirloom_signup_surface: 'custom_otp' })))

    expect(res.status).toBe(200)
    const [syncCall] = mockSyncMember.mock.calls[0] as [Record<string, unknown>]
    expect(syncCall.memberSource).toBe('self_serve_chat')
  })

  it("passes memberSource: 'self_serve_clerk' when heirloom_signup_surface is absent (a Clerk-prebuilt-modal signup)", async () => {
    const res = await POST(makeRequest(userCreatedPayload()))

    expect(res.status).toBe(200)
    const [syncCall] = mockSyncMember.mock.calls[0] as [Record<string, unknown>]
    expect(syncCall.memberSource).toBe('self_serve_clerk')
  })
})
