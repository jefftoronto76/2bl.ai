import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

// GET /api/platform/prompt-sets/[id]/compiled  — NEW
// Cross-tenant compiled-prompt fetch for the Platform Settings → Tenant Prompts
// viewer. Platform-admin only; NOT tenant-scoped (the platform admin can view any
// tenant's compiled prompt). Same response shape as the tenant route.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('master_prompt') // a.k.a. compiled_prompts
    .select('content, version, updated_at')
    .eq('prompt_set_id', id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[platform/prompt-sets/compiled] fetch failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    content: data?.content ?? '',
    version: data?.version ?? null,
    updated_at: data?.updated_at ?? null,
  })
}
