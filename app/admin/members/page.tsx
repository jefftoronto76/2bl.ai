// app/admin/members/page.tsx
//
// Server component. Gates platform admins, loads the user → membership → tenant graph
// (signed-up users) plus invited-only rows (members with no users row yet), shapes both
// into UserRow[], and renders the client list.

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

  // Signed-up users with their memberships and tenant names.
  const { data, error } = await supabase
    .from('users')
    .select(
      `
      id, name, email,
      members:members (
        id, tenant_id, role, status, created_at, invited_name, token,
        tenant:tenants ( id, name )
      )
    `
    )
    .order('name', { ascending: true });

  // Invited-only: members rows with no linked users row (not yet signed up).
  const { data: inviteOnlyData } = await supabase
    .from('members')
    .select('id, tenant_id, role, status, created_at, invited_name, token, tenant:tenants ( id, name )')
    .is('user_id', null)
    .in('status', ['invited', 'waitlist'])
    .order('created_at', { ascending: false });

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
        memberId: m.id,
        tenantId: m.tenant_id,
        tenantName: m.tenant?.name ?? 'Unknown tenant',
        role: m.role,
        status: m.status,
        // TODO(plan): source from billing/subscription — see handover §Open decisions.
        plan: 'free',
        joined: m.created_at ?? null,
        // TODO(lastActive): source from sessions/last_seen — see handover §Open decisions.
        lastActive: null,
        invitedName: m.invited_name ?? null,
        token: m.token ?? null,
      })
    ),
  }));

  // Invited-only rows: synthetic id prefixed with 'invite:' so they never collide
  // with real users.id UUIDs. isInviteOnly=true gates UI differences in MembersList.
  const invitedRows: UserRow[] = (inviteOnlyData ?? []).map((m: any) => ({
    id: `invite:${m.id}`,
    name: m.invited_name ?? 'Unnamed invitee',
    email: '',
    isInviteOnly: true,
    memberships: [
      {
        memberId: m.id,
        tenantId: m.tenant_id,
        tenantName: m.tenant?.name ?? 'Unknown tenant',
        role: m.role,
        status: m.status,
        plan: 'free',
        joined: m.created_at ?? null,
        lastActive: null,
        invitedName: m.invited_name ?? null,
        token: m.token ?? null,
      },
    ],
  }));

  const tenants: TenantOption[] = (tenantData ?? []).map((t) => ({ id: t.id, name: t.name }));
  const allUsers = [...users, ...invitedRows];

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={1} fz="lg" fw={600}>
          Members
        </Title>
        <Text variant="muted">Everyone with access across all tenants.</Text>
      </Stack>

      {error ? (
        <Text variant="muted">Unable to load members.</Text>
      ) : (
        <MembersList users={allUsers} tenants={tenants} />
      )}
    </Stack>
  );
}
