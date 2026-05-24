import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { adminTheme } from '@/components/admin/theme/mantine-theme';
import { PlatformShell } from '@/components/admin/layout/PlatformShell';

// Platform admin is gated here in the layout (server component) rather than via
// middleware auth.protect(): no NEXT_PUBLIC_CLERK_SIGN_IN_URL is configured, so
// middleware would redirect to Clerk's hosted Account Portal, bypassing the
// branded /secondbrainlabs/sign-in page. Redirecting from here lets us route
// unauthenticated users to that branded page (which also resolves on Vercel
// preview hosts, where the bare /sign-in alias does not). Role is read from
// Clerk publicMetadata.role — the same signal the admin Composer already uses.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) {
    redirect('/secondbrainlabs/sign-in');
  }

  const role = (user.publicMetadata as Record<string, unknown>)?.role;
  if (role !== 'platform_admin') {
    redirect('/admin');
  }

  return (
    <MantineProvider theme={adminTheme}>
      <ColorSchemeScript defaultColorScheme="light" />
      <Notifications position="top-right" />
      <PlatformShell>{children}</PlatformShell>
    </MantineProvider>
  );
}
