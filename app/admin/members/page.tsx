// app/admin/members/page.tsx
//
// Server component. Gates platform admins, loads the user → membership → tenant graph,
// shapes it into UserRow[], and renders the client list.

import { getCurrentUser } from '@/services/auth';
import { redirect } from 'next/navigation';
import { Stack, Title } from '@mantine/core';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { Text } from '@/components/admin/primitives/Text';
import { MembersList } from './MembersList';
import type { Membership, TenantOption, UserRow } from './types';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  // Defense in depth — re-verify here even though the admin layout already gates,
  // because this runs a privileged service-role read across ALL tenants.
  const user = await getCurrentUser();
  if (!user) redirect('/secondbrainlabs/sign-in');
  if (!user.isPlatformAdmin) redirect('/admin');

  const supabase = getAdminClient();

  // One row per user, with their memberships and resolved tenant names.
  // Adjust the embedded select to your actual FK names, or move to an RPC if the
  // join + cost rollups (future) get heavy. See handover §Data requirements.
  const { data, error } = await supabase
    .from('users')
    .select(
      `
      id, name, email, created_at,
      members:members (
        tenant_id, role, status, created_at,
        tenant:tenants ( id, name )
      )
    `
    )
    .order('name', { ascending: true });

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, name')
    .order('name', { ascending: true });

  const users: UserRow[] = (data ?? []).map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    memberships: (u.members ?? []).map(
      (m: any): Membership => ({
        tenantId: m.tenant_id,
        tenantName: m.tenant?.name ?? 'Unknown tenant',
        role: m.role,
        status: m.status,
        // TODO(plan): source from billing/subscription — see handover §Open decisions.
        plan: m.plan ?? 'free',
        joined: m.created_at ?? null,
        // TODO(lastActive): source from sessions/last_seen — see handover §Open decisions.
        lastActive: m.last_active ?? null,
      })
    ),
  }));

  const tenants: TenantOption[] = (tenantData ?? []).map((t) => ({ id: t.id, name: t.name }));

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={1} fz="lg" fw={600}>
          Members
        </Title>
        <Text variant="muted">Everyone with access across all tenants.</Text>
      </Stack>

      {error ? <Text variant="muted">Unable to load members.</Text> : <MembersList users={users} tenants={tenants} />}
    </Stack>
  );
}
