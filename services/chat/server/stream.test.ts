// Verifies runChatStream forwards abortSignal to streamText (and, via
// streamText, into the provider's doStream call) so the client disconnecting
// (Stop) actually cancels the upstream Anthropic call instead of letting it
// run to completion. See System Docs/Utilities/Chat UI.md's "Stop / interrupted-turn protocol".

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelConfig } from './types'

const mockToDataStreamResponse = vi.fn(() => new Response('mock stream'))
const mockStreamText = vi.fn((_opts: unknown) =>
  Promise.resolve({ toDataStreamResponse: mockToDataStreamResponse }),
)

vi.mock('ai', () => ({
  streamText: (opts: unknown) => mockStreamText(opts),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (modelId: string) => ({ modelId, provider: 'anthropic' }),
}))

import { describeStreamError, runChatStream } from './stream'

const config: ModelConfig = {
  provider: 'anthropic',
  chatModel: 'claude-sonnet-4-6',
  fallbackModel: 'gpt-4o',
  maxTokens: 1000,
  rateLimitRequestsPerHour: 100,
}

beforeEach(() => {
  mockStreamText.mockClear()
  mockToDataStreamResponse.mockClear()
})

describe('runChatStream', () => {
  it('passes the caller abortSignal through to streamText', async () => {
    const controller = new AbortController()
    await runChatStream({ config, system: 'sys', messages: [], abortSignal: controller.signal })
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    )
  })

  it('passes abortSignal as undefined when the caller provides none', async () => {
    await runChatStream({ config, system: 'sys', messages: [] })
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: undefined }),
    )
  })

  it('still returns the data-stream Response when abortSignal is supplied', async () => {
    const controller = new AbortController()
    const response = await runChatStream({ config, system: 'sys', messages: [], abortSignal: controller.signal })
    expect(mockToDataStreamResponse).toHaveBeenCalled()
    expect(response).toBeInstanceOf(Response)
  })
})

describe('describeStreamError', () => {
  it('classifies a mid-stream rate limit', () => {
    expect(describeStreamError({ name: 'AI_APICallError', statusCode: 429 })).toBe('rate_limited')
  })

  it('classifies auth failures', () => {
    expect(describeStreamError({ name: 'AI_APICallError', statusCode: 401 })).toBe('auth_error')
    expect(describeStreamError({ name: 'AI_APICallError', statusCode: 403 })).toBe('auth_error')
  })

  it('classifies the two tool-layer errors the SDK raises before our code runs', () => {
    expect(describeStreamError({ name: 'AI_NoSuchToolError' })).toBe('unknown_tool')
    expect(describeStreamError({ name: 'AI_InvalidToolArgumentsError' })).toBe(
      'invalid_tool_arguments',
    )
  })

  it('classifies an abort', () => {
    expect(describeStreamError({ name: 'AbortError' })).toBe('aborted')
  })

  it('falls back to upstream_error rather than guessing', () => {
    expect(describeStreamError(new Error('connection reset by peer'))).toBe('upstream_error')
    expect(describeStreamError({ name: 'AI_APICallError', statusCode: 500 })).toBe('upstream_error')
    expect(describeStreamError({ name: 'AI_APICallError' })).toBe('upstream_error')
  })

  it('never returns anything derived from the error text', () => {
    // The whole point of a bounded vocabulary: a provider error naming a
    // vendor, a URL, an internal path, or a tool argument must not reach the
    // browser through this channel.
    const leaky = new Error('POST https://api.internal.example/v1 failed for user ada@example.com')
    expect(describeStreamError(leaky)).toBe('upstream_error')
  })

  it('handles non-object errors without throwing', () => {
    expect(describeStreamError(null)).toBe('upstream_error')
    expect(describeStreamError(undefined)).toBe('upstream_error')
    expect(describeStreamError('a bare string')).toBe('upstream_error')
  })
})

describe('runChatStream error masking', () => {
  it('passes describeStreamError to toDataStreamResponse so errors are not masked to 3:""', async () => {
    await runChatStream({ config, system: 'sys', messages: [] })
    expect(mockToDataStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({ getErrorMessage: describeStreamError }),
    )
  })
})
