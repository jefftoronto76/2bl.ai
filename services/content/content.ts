// services/content/content.ts
//
// `content`-row data-access (structured create + single-row read). The
// app/api/admin/content[/id] routes are thin consumers (auth + parsing +
// response mapping). Tenant-scoped via authCtx. Behavior identical to the prior
// inline route logic — same queries, status codes, and log strings.

import { getAdminClient } from '@/services/auth/supabase-admin'
import type { AuthScope, ContentResult } from './types'

export interface CreateContentInput {
  name: string
  type: string
  raw: string
}

/** POST /api/admin/content — create a content row from structured input. */
export async function createContent(
  authCtx: AuthScope,
  input: CreateContentInput,
): Promise<ContentResult<unknown>> {
  const { name, type, raw } = input
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('content')
    .insert({ tenant_id: authCtx.tenant_id, owner_id: authCtx.owner_id, name, type, raw })
    .select()
    .single()

  if (error) {
    console.error('[content/create] insert failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data }
}

/** GET /api/admin/content/[id] — single content row, tenant-scoped. */
export async function getContent(
  authCtx: AuthScope,
  id: string,
): Promise<ContentResult<unknown>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('content')
    .select('id, name, raw')
    .eq('id', id)
    .eq('tenant_id', authCtx.tenant_id)
    .single()

  if (error || !data) {
    return { ok: false, status: 404, error: 'Content not found' }
  }

  return { ok: true, data }
}
