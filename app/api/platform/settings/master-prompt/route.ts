import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

// Platform composer-prompt pointer: which prompt set is currently live as the
// Composer Prompt (is_composer_prompt=true AND status='live'). Read-only.
//
// PUT was retired (July 2026) — it used to be the only way to make a
// composer prompt set live, by flipping is_composer_prompt on/off with no
// compile step, no release note, and no real audit trail beyond a bare flag
// flip. Compile & Publish on the Blocks screen (services/prompt/compile.ts)
// is now the one path that activates a composer set, same as it already is
// for every ordinary tenant prompt set — see CLAUDE.md Known Gaps for the
// orphaned AuditAction.PROMPT_SET_MASTER_SET this leaves behind.

async function requirePlatformAdmin() {
  const user = await getCurrentUser()
  if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!user.isPlatformAdmin) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

export async function GET() {
  const gate = await requirePlatformAdmin()
  if (gate.error) return gate.error

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_sets')
    .select('id')
    .eq('is_composer_prompt', true)
    .eq('status', 'live')
    .maybeSingle()

  if (error) {
    console.error('[platform/master-prompt] fetch failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ promptSetId: data?.id ?? null })
}
