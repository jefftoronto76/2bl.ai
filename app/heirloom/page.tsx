import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { HEIRLOOM_TENANT_ID } from '@/services/auth/sync-member';
import { validateInvite } from '@/services/invites';
import HeirloomApp from './HeirloomApp';

interface PageProps {
  searchParams: Promise<{ invite?: string }>;
}

export default async function HeirloomPage({ searchParams }: PageProps) {
  const { userId: clerkId } = await auth();
  const { invite: token } = await searchParams;

  // Signed-in user — pass through without a token if they are already a member.
  if (clerkId) {
    const supabase = getAdminClient();
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('clerk_user_id', clerkId)
      .eq('tenant_id', HEIRLOOM_TENANT_ID)
      .maybeSingle();

    if (member) {
      return <HeirloomApp inviteToken={null} />;
    }
    // Signed in but not yet a member — fall through to invite check.
  }

  // Validate the invite token when present.
  if (token) {
    const invite = await validateInvite(token);
    if (invite) {
      return <HeirloomApp inviteToken={token} />;
    }
  }

  // No valid token and not an existing member.
  redirect('/heirloom/coming-soon');
}
