// app/admin/prompt-studio/blocks/getPromptSets.ts
//
// Server-only reader for the tenant's prompt sets (the "Current Prompt Set"
// picker). Shapes rows into PromptSet[], newest-meaningful order. Adjust the
// table/column names + status derivation to your schema — see the handover §3
// and the db/ migration sketch.

import 'server-only';
import { getAdminClient } from '@/services/auth/supabase-admin';
import type { PromptSet } from './promptSets';

export async function getPromptSets(tenantId: string): Promise<PromptSet[]> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('prompt_sets')
    .select('id, label, version, status')
    .eq('tenant_id', tenantId)
    .neq('status', 'archived')
    .order('created_at', { ascending: true });

  if (error || !data) {
    if (error) console.error('[promptSets] fetch error:', error.message);
    return [];
  }

  return data.map((r: Record<string, unknown>): PromptSet => ({
    id: String(r.id),
    label: String(r.label ?? 'Untitled set'),
    version: typeof r.version === 'number' ? r.version : Number(r.version ?? 0),
    status: (r.status as string) ?? 'Draft',
  }));
}
