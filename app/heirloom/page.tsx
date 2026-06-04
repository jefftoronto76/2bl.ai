import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { findUserByClerkId } from '@/services/auth/findUserByClerkId';
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
    const found = await findUserByClerkId(clerkId);
    if (found?.member?.tenant_id === HEIRLOOM_TENANT_ID) {
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
