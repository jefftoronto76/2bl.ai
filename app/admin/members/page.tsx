// app/admin/members/page.tsx
//
// Server component. Resolves the current admin's tenant via getAuthContext(),
// loads members for that tenant only (signed-up + invited-only), and renders
// the client list. Does NOT load members across all tenants — that view lives
// in app/(platform)/platform/members/.

import { getAuthContext } from '@/services/auth';
import { redirect } from 'next/navigation';
import { Stack, Title } from '@mantine/core';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { Text } from '@/components/admin/primitives/Text';
import { MembersList } from './MembersList';
import { MembersDashboard } from './MembersDashboard';
import type { Membership, TenantOption, UserRow } from './types';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  let authCtx: { owner_id: string; tenant_id: string };
  try {
    authCtx = await getAuthContext();
  } catch {
    redirect('/admin');
  }

  const supabase = getAdminClient();

  // Signed-up members of this tenant, with their user details.
  const { data, error } = await supabase
    .from('members')
    .select(
      `
      id, tenant_id, role, status, created_at, invited_name, token,
      user:users!user_id!inner ( id, name, email ),
      inviter:users!invited_by ( name, email ),
      tenant:tenants ( id, name, domain )
    `
    )
    .eq('tenant_id', authCtx.tenant_id)
    .not('user_id', 'is', null)
    .order('created_at', { ascending: false });

  // Invited-only: members rows with no linked users row (not yet signed up).
  const { data: inviteOnlyData } = await supabase
    .from('members')
    .select('id, tenant_id, role, status, created_at, invited_name, token, inviter:users!invited_by ( name, email ), tenant:tenants ( id, name, domain )')
    .eq('tenant_id', authCtx.tenant_id)
    .is('user_id', null)
    .in('status', ['invited', 'waitlist'])
    .order('created_at', { ascending: false });

  // All tenants list for the InviteMemberModal tenant selector.
  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, name, domain')
    .order('name', { ascending: true });

  const users: UserRow[] = (data ?? []).map((m: any) => ({
    id: m.user.id,
    name: m.user.name ?? '',
    email: m.user.email ?? '',
    memberships: [
      {
        memberId: m.id,
        tenantId: m.tenant_id,
        tenantName: m.tenant?.name ?? 'Unknown tenant',
        tenantDomain: m.tenant?.domain ?? null,
        role: m.role,
        status: m.status,
        plan: 'free',
        joined: m.created_at ?? null,
        lastActive: null,
        invitedName: m.invited_name ?? null,
        invitedByName: m.inviter?.name ?? m.inviter?.email ?? null,
        token: m.token ?? null,
      } satisfies Membership,
    ],
  }));

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
        tenantDomain: m.tenant?.domain ?? null,
        role: m.role,
        status: m.status,
        plan: 'free',
        joined: m.created_at ?? null,
        lastActive: null,
        invitedName: m.invited_name ?? null,
        invitedByName: m.inviter?.name ?? m.inviter?.email ?? null,
        token: m.token ?? null,
      } satisfies Membership,
    ],
  }));

  const tenants: TenantOption[] = (tenantData ?? []).map((t: any) => ({ id: t.id, name: t.name, domain: t.domain ?? null }));
  const allUsers = [...users, ...invitedRows];

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={1} fz="lg" fw={600}>
          Members
        </Title>
        <Text variant="muted">Everyone with access to this workspace.</Text>
      </Stack>

      {error ? (
        <Text variant="muted">Unable to load members.</Text>
      ) : (
        <>
          <MembersDashboard users={allUsers} />
          <MembersList users={allUsers} tenants={tenants} currentTenantId={authCtx.tenant_id} inviteApiBase="/api/admin/members" />
        </>
      )}
    </Stack>
  );
}
