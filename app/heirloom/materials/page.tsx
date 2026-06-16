import { getSession, getTenantFromRequest } from '@/services/auth';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { validateMemberToken } from '@/services/members';
import { listByMember } from '@/services/media';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { MaterialsGrid } from '@/components/shells/membership/MaterialsGrid';

export const dynamic = 'force-dynamic';

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;
  const inviteToken = params.invite;

  const hdrs = await headers();
  const tenantId = await getTenantFromRequest({ headers: hdrs } as unknown as Request);

  if (!tenantId) {
    redirect('/heirloom');
  }

  const supabase = getAdminClient();
  let memberId: string | null = null;
  let isAuthorized = false;

  if (session) {
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('clerk_id', session.providerUserId)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle();

    if (member) {
      isAuthorized = true;
      memberId = member.id;
    }
  }

  if (!isAuthorized && inviteToken) {
    const row = await validateMemberToken(inviteToken);
    if (row) {
      isAuthorized = true;
      memberId = row.id;
    }
  }

  if (!isAuthorized) {
    redirect('/heirloom');
  }

  const items = memberId ? await listByMember(memberId, tenantId) : [];

  return <MaterialsGrid items={items} />;
}
