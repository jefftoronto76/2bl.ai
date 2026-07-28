import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock the AI SDK boundary rather than hitting Anthropic — this test only
// verifies runChatStream's own wiring (does it forward abortSignal to
// streamText?), not the SDK's or the model's behavior once aborted.
const { streamTextMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
}))
vi.mock('ai', () => ({
  streamText: streamTextMock,
}))
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn((modelId: string) => ({ modelId })),
}))

import { runChatStream } from './stream'
import type { ModelConfig } from './types'

const baseConfig: ModelConfig = {
  provider: 'anthropic',
  chatModel: 'claude-sonnet-4-6',
  fallbackModel: 'gpt-4o',
  maxTokens: 1000,
  rateLimitRequestsPerHour: 100,
}

beforeEach(() => {
  streamTextMock.mockReset()
  streamTextMock.mockResolvedValue({ toDataStreamResponse: () => new Response('ok') })
})

describe('runChatStream', () => {
  it('forwards abortSignal through to streamText — an aborted client request must actually cancel the model call', async () => {
    const controller = new AbortController()

    await runChatStream({
      config: baseConfig,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      abortSignal: controller.signal,
    })

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock.mock.calls[0][0].abortSignal).toBe(controller.signal)
  })

  it('passes an undefined abortSignal through when the caller supplies none', async () => {
    await runChatStream({
      config: baseConfig,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(streamTextMock.mock.calls[0][0].abortSignal).toBeUndefined()
  })
})
