import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { getCurrentUser, getTenantName } from '@/services/auth';
import { redirect } from 'next/navigation';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
// Inkwell tokens are shared with jefflougheed.ca but platform lives outside the
// (jefflougheed) route group, so import them explicitly here.
import '../(jefflougheed)/globals.css';

import { adminTheme } from '@/components/admin/theme/mantine-theme';
import { UnifiedAdminShell } from '@/components/admin/shell/UnifiedAdminShell';

// Platform admin is gated here in the layout (server component) rather than via
// middleware auth.protect(): no NEXT_PUBLIC_CLERK_SIGN_IN_URL is configured, so
// middleware would redirect to Clerk's hosted Account Portal, bypassing the
// branded /secondbrainlabs/sign-in page. Redirecting from here lets us route
// unauthenticated users to that branded page (which also resolves on Vercel
// preview hosts, where the bare /sign-in alias does not). Role is read from
// the boundary's AuthUser.isPlatformAdmin (resolved inside services/auth).
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/secondbrainlabs/sign-in');
  }

  if (!user.isPlatformAdmin) {
    redirect('/admin');
  }

  const tenantName = (await getTenantName()) ?? 'Natural Resource';

  return (
    <MantineProvider theme={adminTheme}>
      <ColorSchemeScript defaultColorScheme="light" />
      <Notifications position="top-right" />
      <UnifiedAdminShell tenantName={tenantName}>{children}</UnifiedAdminShell>
    </MantineProvider>
  );
}
