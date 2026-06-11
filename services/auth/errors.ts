// Provider-agnostic auth errors — the only error shapes UI components handle.
//
// Provider adapters (services/auth/providers/*) catch provider-specific errors
// (Clerk error codes today; Auth0 'invalid_grant' etc. if a provider swap ever
// happens) and translate them into these before they cross the boundary.
// Product code must never branch on a provider's error codes.

/** The one-time code has expired; the user should request a new one. */
export class OtpExpiredError extends Error {
  constructor(message = 'That code has expired. Request a new one.') {
    super(message)
    this.name = 'OtpExpiredError'
  }
}

/** The one-time code is wrong; the user may retry. */
export class InvalidCodeError extends Error {
  constructor(message = 'That code is incorrect. Try again.') {
    super(message)
    this.name = 'InvalidCodeError'
  }
}

/** The account is locked (too many attempts, admin action, …). */
export class AccountLockedError extends Error {
  constructor(message = 'This account is locked. Contact support.') {
    super(message)
    this.name = 'AccountLockedError'
  }
}

/** Any other provider failure, normalized — carries a user-safe message. */
export class AuthProviderError extends Error {
  constructor(message = 'Something went wrong signing you in. Try again.') {
    super(message)
    this.name = 'AuthProviderError'
  }
}
