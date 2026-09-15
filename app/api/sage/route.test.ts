// The account-status gate at the chat front door: a suspended or deleted
// member gets the blocked reply and streamChat is never called; an active
// member, an invite holder, and an anonymous visitor reach streamChat exactly
// as before, now with memberStatus threaded through. The first test file for
// this route — scoped to the gate, not a full route audit.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCurrentUser = vi.fn<(...a: unknown[]) => Promise<unknown>>()
const mockGetTenantFromRequest = vi.fn<(...a: unknown[]) => Promise<string | null>>()
vi.mock('@/services/auth', () => ({
  getCurrentUser: (...a: unknown[]) => mockGetCurrentUser(...a),
  getTenantFromRequest: (...a: unknown[]) => mockGetTenantFromRequest(...a),
}))

let memberRow: { id: string; status: string | null } | null = null
const mockMembersSelect = vi.fn()
vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'members') throw new Error(`unexpected table ${table}`)
      return {
        select: (cols: string) => {
          mockMembersSelect(cols)
          return { eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: memberRow, error: null }) }) }) }
        },
      }
    },
  }),
}))

const mockValidateMemberToken = vi.fn<(...a: unknown[]) => Promise<unknown>>()
vi.mock('@/services/members', () => ({
  validateMemberToken: (...a: unknown[]) => mockValidateMemberToken(...a),
}))

const mockStreamChat = vi.fn<(...a: unknown[]) => Promise<Response>>(async () => new Response('streamed', { status: 200 }))
vi.mock('@/services/chat/server', () => ({
  streamChat: (...a: unknown[]) => mockStreamChat(...a),
}))

const mockSelectCompiledPrompt = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => null)
vi.mock('@/services/prompt/select', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/prompt/select')>()
  return { ...actual, selectCompiledPrompt: (...a: unknown[]) => mockSelectCompiledPrompt(...a) }
})

const mockLogEvent = vi.fn<(...a: unknown[]) => void>()
vi.mock('@/services/audit', () => ({ logEvent: (...a: unknown[]) => mockLogEvent(...a) }))

import { POST } from './route'
import { BLOCKED_TURN_FALLBACK_TEXT } from '@/services/chat/server/turn-context/blocked-turn'
import { readDataStream } from '@/services/chat/server/stream-utils'

function post(body: Record<string, unknown>) {
  return new Request('https://heirloom.2bl.ai/api/sage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const turn = { messages: [{ role: 'user', content: 'Hi' }], session_id: 'session-1' }

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockGetCurrentUser.mockReset().mockResolvedValue(null)
  mockValidateMemberToken.mockReset().mockResolvedValue(null)
  mockStreamChat.mockClear()
  mockMembersSelect.mockClear()
  mockSelectCompiledPrompt.mockClear()
  mockLogEvent.mockClear()
  memberRow = null
})

describe('POST /api/sage — account-status gate', () => {
  it('active signed-in member: reaches streamChat with memberId and memberStatus', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'user_1' })
    memberRow = { id: 'member-1', status: 'active' }

    const response = await POST(post(turn))
    expect(await response.text()).toBe('streamed')
    expect(mockStreamChat).toHaveBeenCalledTimes(1)
    expect(mockStreamChat.mock.calls[0][0]).toMatchObject({ memberId: 'member-1', memberStatus: 'active', sessionId: 'session-1' })
    expect(mockMembersSelect).toHaveBeenCalledWith('id, status')
    expect(mockLogEvent).not.toHaveBeenCalled()
  })

  it.each(['suspended', 'deleted'])('%s signed-in member: blocked before any model call — streamChat never runs', async status => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'user_1' })
    memberRow = { id: 'member-1', status }

    const response = await POST(post(turn))

    expect(mockStreamChat).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Vercel-AI-Data-Stream')).toBe('v1')
    expect(await readDataStream(response, () => {})).toBe(BLOCKED_TURN_FALLBACK_TEXT)
    expect(mockSelectCompiledPrompt).toHaveBeenCalledWith('tenant-1', 'blocked')
    expect(mockLogEvent).toHaveBeenCalledTimes(1)
    expect((mockLogEvent.mock.calls[0][0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({ blocked: true, modelCalled: false, selection: { ruleId: 'account-status' } })
  })

  it('anonymous visitor (no Clerk user, no token): reaches streamChat with no member — baseline unchanged', async () => {
    const response = await POST(post(turn))
    expect(await response.text()).toBe('streamed')
    expect(mockStreamChat).toHaveBeenCalledTimes(1)
    expect(mockStreamChat.mock.calls[0][0]).toMatchObject({ memberId: null, memberStatus: null })
    expect(mockMembersSelect).not.toHaveBeenCalled()
    expect(mockLogEvent).not.toHaveBeenCalled()
  })

  it('invite holder (status invited, not signed in): reaches streamChat via the token path', async () => {
    mockValidateMemberToken.mockResolvedValue({ id: 'member-9', tenant_id: 'tenant-1', status: 'invited' })
    const response = await POST(post({ ...turn, invite_token: 'tok' }))
    expect(await response.text()).toBe('streamed')
    expect(mockStreamChat.mock.calls[0][0]).toMatchObject({ memberId: 'member-9', memberStatus: 'invited' })
  })

  it('a suspended member reaching the API via a still-valid invite token is blocked too', async () => {
    mockValidateMemberToken.mockResolvedValue({ id: 'member-9', tenant_id: 'tenant-1', status: 'suspended' })
    const response = await POST(post({ ...turn, invite_token: 'tok' }))
    expect(mockStreamChat).not.toHaveBeenCalled()
    expect(await readDataStream(response, () => {})).toBe(BLOCKED_TURN_FALLBACK_TEXT)
  })

  it('blocked reply uses the editable slot copy when the tenant has published one', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'user_1' })
    memberRow = { id: 'member-1', status: 'deleted' }
    mockSelectCompiledPrompt.mockResolvedValue({
      content: '<identity>\nEditable copy from the admin UI.\n</identity>',
      compiledPromptId: 'cp-b', version: 1, promptTypeId: 'pt-b', slotKey: 'blocked',
    })
    const response = await POST(post(turn))
    expect(await readDataStream(response, () => {})).toBe('Editable copy from the admin UI.')
  })

  it('still returns 500 when ANTHROPIC_API_KEY is missing, before any resolution', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const response = await POST(post(turn))
    expect(response.status).toBe(500)
    expect(mockGetTenantFromRequest).not.toHaveBeenCalled()
  })
})
