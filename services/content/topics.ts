// services/content/topics.ts
//
// `topics`-row data-access (list + create). The app/api/admin/topics route is a
// thin consumer (auth + parsing + response mapping). Tenant-scoped via authCtx.
// Behavior identical to the prior inline route logic — same queries, status
// codes, and log strings.

import { getAdminClient } from '@/services/auth/supabase-admin'
import type { AuthScope, ContentResult } from './types'

/** GET /api/admin/topics — tenant topics, ordered by name. */
export async function listTopics(authCtx: AuthScope): Promise<ContentResult<unknown>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('topics')
    .select('id, name, type')
    .eq('tenant_id', authCtx.tenant_id)
    .order('name')

  if (error) {
    console.error('[topics] fetch failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data }
}

export interface CreateTopicInput {
  name: string
  type: string
}

/** POST /api/admin/topics — create a topic for the tenant. */
export async function createTopic(
  authCtx: AuthScope,
  input: CreateTopicInput,
): Promise<ContentResult<unknown>> {
  const { name, type } = input
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('topics')
    .insert({ name, type, tenant_id: authCtx.tenant_id })
    .select('id, name, type')
    .single()

  if (error) {
    console.error('[topics] insert failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data }
}
