// app/(platform)/platform/members/page.tsx
//
// Platform-admin cross-tenant members view. Mirrors the data-fetching pattern in
// app/admin/members/page.tsx but renders inside PlatformShell instead of AdminShell.
// Reuses the shared MembersList client component and its associated types.

import { getCurrentUser } from '@/services/auth';
import { redirect } from 'next/navigation';
import { Stack, Title } from '@mantine/core';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { Text } from '@/components/admin/primitives/Text';
import { MembersList } from '@/app/admin/members/MembersList';
import type { Membership, TenantOption, UserRow } from '@/app/admin/members/types';

export const dynamic = 'force-dynamic';

export default async function PlatformMembersPage() {
  // Defense in depth — the (platform) layout already gates platform_admin, but
  // this page runs a privileged service-role read across ALL tenants.
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
        tenantDomain: m.tenant?.domain ?? null,
        role: m.role,
        status: m.status,
        plan: 'free',
        joined: m.created_at ?? null,
        lastActive: null,
        invitedName: m.invited_name ?? null,
        token: m.token ?? null,
      })
    ),
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
