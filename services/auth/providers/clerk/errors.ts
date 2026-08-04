// Clerk error normalization — moved out of useAuthFlow.ts so the stage
// machine stays provider-agnostic. Handles BOTH Core 3 error channels: the
// documented `{ error: ClerkError | null }` return AND the undocumented
// throw on HTTP 4xx (ClerkAPIResponseError — observed in production, PR #86;
// see System Docs/Utilities/Auth.md "Dual error channel"). Do not remove the thrown-path handling
// to match Clerk's docs.

export function extractErrorMessage(err: unknown): string {
  if (!err) return 'Something went wrong. Please try again.'
  if (typeof err === 'object' && err !== null) {
    if ('longMessage' in err && typeof (err as { longMessage?: string }).longMessage === 'string')
      return (err as { longMessage: string }).longMessage
    if ('message' in err && typeof (err as { message?: string }).message === 'string')
      return (err as { message: string }).message
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

/**
 * Extract a Clerk error code from a thrown value.
 * ClerkAPIResponseError shape: { errors: [{ code, message, longMessage }] }
 */
export function extractClerkErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return 'unknown_error'
  const e = err as Record<string, unknown>
  if (Array.isArray(e.errors) && e.errors.length > 0) {
    const first = e.errors[0] as Record<string, unknown>
    if (typeof first.code === 'string') return first.code
  }
  if (typeof e.code === 'string') return e.code
  return 'unknown_error'
}
