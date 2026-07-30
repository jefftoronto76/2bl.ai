import { vi, describe, it, expect, beforeEach } from 'vitest'

// Hoist the holder so the mock factory captures it before any import runs.
const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => adminHolder.client,
}))

import { compilePrompt } from './compile'
import type { ReleaseNote } from './release-note'

// ── helpers ──────────────────────────────────────────────────────────────────
//
// Atomic publish (July 2026): the clear/archive/write/activate sequence moved
// into a single Postgres function (publish_compiled_prompt), called once via
// supabase.rpc(). compile.ts's own responsibility shrank to: an early
// existence check on prompt_sets (cheap 404 before compiling blocks), building
// the content, and calling the RPC with the right arguments — then mapping its
// result/error back to a CompileResult. These tests assert that contract, not
// the RPC's internal clearing/archiving logic (that belongs to a SQL-level
// test against a real Postgres — see the RPC function itself, run by Jeff in
// Studio, for the behavior these tests used to assert via mocked .update()/
// .insert() calls).

function makeQuery(result: unknown) {
  const obj: Record<string, unknown> = {}
  for (const fn of ['eq', 'is', 'in', 'or', 'neq', 'limit', 'order', 'select']) {
    obj[fn] = () => obj
  }
  obj.maybeSingle = async () => result
  obj.single = async () => result
  obj.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return obj
}

const ACTIVE_BLOCK = {
  id: 'block-1',
  title: 'Be helpful',
  type: 'identity',
  body: 'Be helpful and concise.',
  order: null,
  prompt_set_id: null,
}

interface RpcCall {
  fn: string
  args: Record<string, unknown>
}

function makeClient({
  blocks = [ACTIVE_BLOCK],
  blocksError = null as unknown,
  targetSetExists = true,
  targetSetError = null as unknown,
  rpcData = { out_version: 1, out_updated_at: '2026-07-30T00:00:00.000Z', out_prompt_type_id: null } as Record<string, unknown> | null,
  rpcError = null as { code?: string; message: string } | null,
}: {
  blocks?: unknown[]
  blocksError?: unknown
  targetSetExists?: boolean
  targetSetError?: unknown
  rpcData?: Record<string, unknown> | null
  rpcError?: { code?: string; message: string } | null
} = {}) {
  const rpcCalls: RpcCall[] = []

  const client = {
    from(table: string) {
      if (table === 'blocks') {
        return makeQuery({ data: blocks, error: blocksError })
      }
      if (table === 'prompt_sets') {
        return {
          select: () => makeQuery({ data: targetSetExists ? { id: 'set-1' } : null, error: targetSetError }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args })
      return {
        single: async () => ({ data: rpcError ? null : rpcData, error: rpcError }),
      }
    },
  }

  return { client, rpcCalls }
}

const NOTE: ReleaseNote = { summary: 'Tighten escalation', why: 'Billing disputes', changed_block_ids: ['block-1'] }

describe('compilePrompt — calls publish_compiled_prompt with the right arguments', () => {
  beforeEach(() => {
    adminHolder.client = null
  })

  it('legacy no-set compile: never touches prompt_sets, calls the RPC with p_prompt_set_id: null', async () => {
    const { client, rpcCalls } = makeClient()
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', null, NOTE)

    expect(result.ok).toBe(true)
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe('publish_compiled_prompt')
    expect(rpcCalls[0].args.p_tenant_id).toBe('tenant-1')
    expect(rpcCalls[0].args.p_prompt_set_id).toBeNull()
  })

  it('typed-set compile: runs the early existence check, then calls the RPC with that set id', async () => {
    const { client, rpcCalls } = makeClient({ targetSetExists: true })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(result.ok).toBe(true)
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].args.p_prompt_set_id).toBe('set-1')
  })

  it('passes the release note fields through verbatim', async () => {
    const { client, rpcCalls } = makeClient()
    adminHolder.client = client

    await compilePrompt('tenant-1', null, NOTE)

    expect(rpcCalls[0].args.p_release_summary).toBe('Tighten escalation')
    expect(rpcCalls[0].args.p_release_why).toBe('Billing disputes')
    expect(rpcCalls[0].args.p_release_changed_block_ids).toEqual(['block-1'])
  })

  it('stores an empty why as null, not an empty string', async () => {
    const { client, rpcCalls } = makeClient()
    adminHolder.client = client

    await compilePrompt('tenant-1', null, { summary: 'Update guardrails', why: '', changed_block_ids: [] })

    expect(rpcCalls[0].args.p_release_why).toBeNull()
  })

  it('passes the compiled content built from active blocks', async () => {
    const { client, rpcCalls } = makeClient()
    adminHolder.client = client

    await compilePrompt('tenant-1', null, NOTE)

    expect(rpcCalls[0].args.p_content).toContain('Be helpful and concise.')
  })

  it('still returns ok:false on a blocks-fetch error without ever calling the RPC', async () => {
    const { client, rpcCalls } = makeClient({ blocks: [], blocksError: { message: 'db down' } })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', null, NOTE)

    expect(result.ok).toBe(false)
    expect(rpcCalls).toHaveLength(0)
  })

  it('404s fast when the target prompt_set does not exist, without calling the RPC', async () => {
    const { client, rpcCalls } = makeClient({ targetSetExists: false })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'missing-set', NOTE)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(404)
    expect(rpcCalls).toHaveLength(0)
  })
})

describe('compilePrompt — optimistic concurrency (p_expected_version, July 2026)', () => {
  beforeEach(() => {
    adminHolder.client = null
  })

  it('passes expectedVersion through as p_expected_version', async () => {
    const { client, rpcCalls } = makeClient()
    adminHolder.client = client

    await compilePrompt('tenant-1', 'set-1', NOTE, 7)

    expect(rpcCalls[0].args.p_expected_version).toBe(7)
  })

  it('defaults p_expected_version to null when the caller omits it', async () => {
    const { client, rpcCalls } = makeClient()
    adminHolder.client = client

    await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(rpcCalls[0].args.p_expected_version).toBeNull()
  })

  it('passes an explicit null through as null (never-compiled slot)', async () => {
    const { client, rpcCalls } = makeClient()
    adminHolder.client = client

    await compilePrompt('tenant-1', 'set-1', NOTE, null)

    expect(rpcCalls[0].args.p_expected_version).toBeNull()
  })

  it('maps the RPC\'s version-conflict error (P1002) to a 409 with a retry message', async () => {
    const { client } = makeClient({ rpcError: { code: 'P1002', message: 'This prompt set was published by someone else' } })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'set-1', NOTE, 7)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(result.error).toMatch(/just landed/i)
  })
})

describe('compilePrompt — RPC error mapping', () => {
  beforeEach(() => {
    adminHolder.client = null
  })

  it('maps prompt_set_not_found (P1001) to a 404', async () => {
    const { client } = makeClient({ rpcError: { code: 'P1001', message: 'Prompt set not found' } })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(404)
  })

  it('surfaces a unique-constraint race (23505) as a friendly 409, not a raw 500 — the backstop, kept for anything that bypasses the RPC', async () => {
    const { client } = makeClient({
      rpcError: { code: '23505', message: 'duplicate key value violates unique constraint "compiled_prompts_single_live_typed_idx"' },
    })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(result.error).toMatch(/just landed/i)
  })

  it('maps any other error code to a 500 with the raw message', async () => {
    const { client } = makeClient({ rpcError: { code: '55000', message: 'lock timeout' } })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(500)
    expect(result.error).toBe('lock timeout')
  })

  it('on success, maps the RPC row to the CompileSuccess payload', async () => {
    const { client } = makeClient({
      rpcData: { out_version: 9, out_updated_at: '2026-07-30T12:00:00.000Z', out_prompt_type_id: 'type-base' },
    })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.version).toBe(9)
    expect(result.data.updatedAt).toBe('2026-07-30T12:00:00.000Z')
  })
})
