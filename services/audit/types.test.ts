// services/audit/types.test.ts
//
// Gate 3: the three identity-write AuditAction values must exist with the
// exact string the Studio-deployed trigger (identity_audit_log_field)
// writes, since nothing type-checks that agreement — a typo on either side
// would silently desync TS-side consumers from what the trigger actually
// inserts.

import { describe, it, expect } from 'vitest'
import { AuditAction } from './types'

describe('AuditAction — identity writes (Gate 3)', () => {
  it('IDENTITY_WRITE matches the trigger-written string', () => {
    expect(AuditAction.IDENTITY_WRITE).toBe('identity.write')
  })

  it('IDENTITY_OVERWRITE matches the trigger-written string', () => {
    expect(AuditAction.IDENTITY_OVERWRITE).toBe('identity.overwrite')
  })

  it('IDENTITY_CLEARED matches the trigger-written string', () => {
    expect(AuditAction.IDENTITY_CLEARED).toBe('identity.cleared')
  })
})
