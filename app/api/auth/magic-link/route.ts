import { NextResponse } from 'next/server'
import { validateMagicLinkInput } from '@/services/auth/magic-link'

/**
 * POST /api/auth/magic-link
 *
 * Validation + rate-limit gate for magic-link (email) and OTP (phone) requests.
 * The actual sending is Clerk's responsibility — the client calls this route
 * first, receives { ok: true }, then proceeds with Clerk's useSignIn SDK call.
 *
 * TODO: Add Vercel KV + @upstash/ratelimit rate limiting before the validation
 * step. Rules: email → 5 requests/IP/hour, phone → 3 requests/IP/hour.
 * Reference: https://docs.upstash.com/redis/sdks/ratelimit-ts/overview
 *
 * Example implementation (uncomment when Vercel KV is provisioned):
 *
 *   import { Ratelimit } from '@upstash/ratelimit'
 *   import { Redis } from '@upstash/redis'
 *
 *   const emailLimiter = new Ratelimit({
 *     redis: Redis.fromEnv(),
 *     limiter: Ratelimit.slidingWindow(5, '1 h'),
 *     prefix: 'rl:magic-link:email',
 *   })
 *   const phoneLimiter = new Ratelimit({
 *     redis: Redis.fromEnv(),
 *     limiter: Ratelimit.slidingWindow(3, '1 h'),
 *     prefix: 'rl:magic-link:phone',
 *   })
 *
 *   const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'
 *   const limiter = body.type === 'email' ? emailLimiter : phoneLimiter
 *   const { success } = await limiter.limit(ip)
 *   if (!success) {
 *     return NextResponse.json(
 *       { error: 'Too many requests. Please wait before trying again.' },
 *       { status: 429 },
 *     )
 *   }
 */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('type' in body) ||
    !('value' in body) ||
    (body.type !== 'email' && body.type !== 'phone') ||
    typeof body.value !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Request must include type ("email" | "phone") and value (string).' },
      { status: 400 },
    )
  }

  const input = {
    type: body.type as 'email' | 'phone',
    value: body.value,
  }

  const result = validateMagicLinkInput(input)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
