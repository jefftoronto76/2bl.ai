import { getAdminClient } from './supabase-admin'

export interface FindUserResult {
  user?: { id: string }
  member?: { id: string; tenant_id: string }
  matchedTable: 'users' | 'members' | null
  matchedColumn: 'clerk_id' | 'clerk_id_dev' | 'clerk_user_id' | null
}

/**
 * Looks up a user by Clerk ID, checking both the primary column and the
 * clerk_id_dev fallback. Queries users first; falls through to members on
 * a miss. Writes one row to auth_logs non-blocking regardless of outcome.
 *
 * Returns FindUserResult on any match (user OR member found), null on a
 * total miss from both tables.
 */
export async function findUserByClerkId(clerkId: string): Promise<FindUserResult | null> {
  const supabase = getAdminClient()
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown'

  // 1 — users table: primary clerk_id or dev fallback
  const { data: user } = await supabase
    .from('users')
    .select('id, clerk_id')
    .or(`clerk_id.eq.${clerkId},clerk_id_dev.eq.${clerkId}`)
    .maybeSingle()

  if (user) {
    const matchedColumn: FindUserResult['matchedColumn'] =
      user.clerk_id === clerkId ? 'clerk_id' : 'clerk_id_dev'

    void supabase.from('auth_logs').insert({
      clerk_id_attempted: clerkId,
      matched_table: 'users',
      matched_column: matchedColumn,
      user_id: user.id,
      member_id: null,
      environment,
    })

    return { user: { id: user.id }, matchedTable: 'users', matchedColumn }
  }

  // 2 — members table: primary clerk_user_id or dev fallback
  const { data: member } = await supabase
    .from('members')
    .select('id, clerk_user_id, tenant_id')
    .or(`clerk_user_id.eq.${clerkId},clerk_id_dev.eq.${clerkId}`)
    .maybeSingle()

  if (member) {
    const matchedColumn: FindUserResult['matchedColumn'] =
      member.clerk_user_id === clerkId ? 'clerk_user_id' : 'clerk_id_dev'

    void supabase.from('auth_logs').insert({
      clerk_id_attempted: clerkId,
      matched_table: 'members',
      matched_column: matchedColumn,
      user_id: null,
      member_id: member.id,
      environment,
    })

    return {
      member: { id: member.id, tenant_id: member.tenant_id },
      matchedTable: 'members',
      matchedColumn,
    }
  }

  // 3 — total miss
  void supabase.from('auth_logs').insert({
    clerk_id_attempted: clerkId,
    matched_table: null,
    matched_column: null,
    user_id: null,
    member_id: null,
    environment,
  })

  return null
}
