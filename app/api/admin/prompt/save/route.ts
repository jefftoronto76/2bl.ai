import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt/save] auth failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { prompt, checkResult } = await req.json()

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt cannot be empty' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const now = new Date().toISOString()

  console.log('[prompt/save] fetching existing master_prompt for tenant_id:', authCtx.tenant_id)
  const { data: existing } = await supabase
    .from('master_prompt')
    .select('id, version, content, safety_check_result')
    .eq('tenant_id', authCtx.tenant_id)
    .limit(1)
    .maybeSingle()

  if (existing) {
    console.log('[prompt/save] found existing version:', existing.version, 'id:', existing.id)

    // Archive current version to history before overwriting
    const { error: historyError } = await supabase
      .from('master_prompt_history')
      .insert({
        prompt_id: existing.id,
        tenant_id: authCtx.tenant_id,
        content: existing.content,
        version: existing.version,
      })

    if (historyError) {
      console.error('[prompt/save] history insert FAILED — code:', historyError.code, '| message:', historyError.message, '| details:', historyError.details, '| hint:', historyError.hint)
    } else {
      console.log('[prompt/save] history insert succeeded for version:', existing.version)
    }

    const newVersion = existing.version + 1
    const { error } = await supabase
      .from('master_prompt')
      .update({
        content: prompt,
        version: newVersion,
        updated_at: now,
        last_safety_check: now,
        safety_check_result: checkResult ?? null,
      })
      .eq('id', existing.id)
      .eq('tenant_id', authCtx.tenant_id)

    if (error) {
      console.error('[prompt/save] update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    console.log('[prompt/save] updated master_prompt to version:', newVersion)
    return NextResponse.json({ version: newVersion })
  } else {
    console.log('[prompt/save] no existing row for tenant — inserting version 1')
    const { error } = await supabase
      .from('master_prompt')
      .insert({
        tenant_id: authCtx.tenant_id,
        content: prompt,
        version: 1,
        updated_at: now,
        last_safety_check: now,
        safety_check_result: checkResult ?? null,
      })

    if (error) {
      console.error('[prompt/save] insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ version: 1 })
  }
}
