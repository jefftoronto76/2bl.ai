// services/shared/rollout.test.ts

import { describe, it, expect } from 'vitest'
import { NAME_REQUIRED_SINCE } from './rollout'

describe('NAME_REQUIRED_SINCE', () => {
  it('is a valid ISO 8601 timestamp', () => {
    expect(Number.isNaN(new Date(NAME_REQUIRED_SINCE).getTime())).toBe(false)
  })
})
