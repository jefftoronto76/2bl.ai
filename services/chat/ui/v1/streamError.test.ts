// Covers the client half of the error-masking fix: what an in-stream `3:`
// error part becomes once the server classifies it.
//
// The regression this guards is subtle. Before the fix every in-stream failure
// arrived as `3:""` and became `stream_interrupted`. After it, two codes get a
// better error state — and everything else must still become exactly what it
// became before, including against a server that has not been redeployed.

import { describe, it, expect } from 'vitest'
import { classifyStreamFailure } from './streamError'

describe('classifyStreamFailure — the masked case that motivated this', () => {
  it('treats the SDK default 3:"" as an interrupted stream, exactly as before', () => {
    expect(classifyStreamFailure('')).toEqual({ errorType: 'stream_interrupted' })
  })

  it('carries no detail when the server said nothing', () => {
    expect(classifyStreamFailure('').detail).toBeUndefined()
  })
})

describe('classifyStreamFailure — real messages', () => {
  it('maps a mid-stream rate limit to rate_limited instead of stream_interrupted', () => {
    expect(classifyStreamFailure('rate_limited')).toEqual({
      errorType: 'rate_limited',
      detail: 'rate_limited',
    })
  })

  it('maps a mid-stream auth failure to auth_error instead of stream_interrupted', () => {
    expect(classifyStreamFailure('auth_error')).toEqual({
      errorType: 'auth_error',
      detail: 'auth_error',
    })
  })

  it('keeps stream_interrupted for a generic upstream failure, but records the detail', () => {
    expect(classifyStreamFailure('upstream_error')).toEqual({
      errorType: 'stream_interrupted',
      detail: 'upstream_error',
    })
  })

  it('keeps stream_interrupted for an abort reported in-stream', () => {
    expect(classifyStreamFailure('aborted')).toEqual({
      errorType: 'stream_interrupted',
      detail: 'aborted',
    })
  })

  it('keeps stream_interrupted for the tool codes, which cannot occur yet', () => {
    expect(classifyStreamFailure('unknown_tool').errorType).toBe('stream_interrupted')
    expect(classifyStreamFailure('invalid_tool_arguments').errorType).toBe('stream_interrupted')
  })
})

describe('classifyStreamFailure — compatibility in both directions', () => {
  it('degrades to stream_interrupted for a code this client is too old to know', () => {
    expect(classifyStreamFailure('some_future_code')).toEqual({ errorType: 'stream_interrupted' })
  })

  it('never emits an errorType outside what updateSession accepts for last_error_type', () => {
    // services/crm/sessions.ts:102 filters last_error_type against a fixed set;
    // an errorType outside it would be silently dropped to null on persist.
    const persistable = ['network', 'rate_limited', 'stream_interrupted', 'auth_error', 'unknown', 'user_stopped']
    const inputs = [
      '',
      'rate_limited',
      'auth_error',
      'unknown_tool',
      'invalid_tool_arguments',
      'aborted',
      'upstream_error',
      'some_future_code',
      null,
    ]
    for (const input of inputs) {
      expect(persistable).toContain(classifyStreamFailure(input).errorType)
    }
  })
})
