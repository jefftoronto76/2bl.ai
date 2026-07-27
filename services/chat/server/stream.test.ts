// Verifies runChatStream forwards abortSignal to streamText (and, via
// streamText, into the provider's doStream call) so the client disconnecting
// (Stop) actually cancels the upstream Anthropic call instead of letting it
// run to completion. See CLAUDE.md's "Stop / interrupted-turn protocol".

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

import { runChatStream } from './stream'

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
