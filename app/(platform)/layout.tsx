import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { getCurrentUser, getTenantName, getTenantType, getAuthContext } from '@/services/auth';
import { redirect } from 'next/navigation';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
// Inkwell tokens are shared with jefflougheed.ca but platform lives outside the
// (jefflougheed) route group, so import them explicitly here.
import '../(jefflougheed)/globals.css';

import { buildAdminTheme } from '@/components/admin/theme/mantine-theme';
import { UnifiedAdminShell } from '@/components/admin/shell/UnifiedAdminShell';
import { getTenantBranding } from '@/services/branding/get-tenant-branding';
import { ALL_FONTS, type FontEntry } from '@/services/branding/font-registry';

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

  const [tenantName, tenantType] = await Promise.all([getTenantName(), getTenantType()])
  const isPlatformAdmin = user.isPlatformAdmin === true && tenantType === 'platform'
  console.log('[platform layout]', { isPlatformAdmin: user?.isPlatformAdmin, tenantType, computed: user?.isPlatformAdmin === true && tenantType === 'platform' })

  let platformResult = buildAdminTheme();
  let brandingFontEntries: FontEntry[] = [];
  try {
    const authCtx = await getAuthContext();
    const branding = await getTenantBranding(authCtx.tenant_id, 'admin');
    console.log('[branding:platform]', JSON.stringify({ branding }));
    platformResult = buildAdminTheme(branding, authCtx.tenant_id);
    console.log('[platform layout] branding resolved:', {
      tenant_id: authCtx.tenant_id,
      font_primary: branding?.font_primary,
      font_secondary: branding?.font_secondary,
      accent: branding?.accent,
    });
    const allowedFontValues = new Set(ALL_FONTS.map(f => f.value));
    brandingFontEntries = [
      branding?.font_primary,
      branding?.font_secondary,
      branding?.font_mono,
    ]
      .filter((v): v is string => !!v && allowedFontValues.has(v))
      .map(v => ALL_FONTS.find(f => f.value === v)!)
      .filter(e => !!e?.googleFamily);
  } catch (err) {
    console.error('[platform layout] branding fetch failed:', err instanceof Error ? err.message : err);
  }

  const { theme: platformTheme, resolver } = platformResult;

  return (
    <>
      {brandingFontEntries.map(entry => (
        <link
          key={entry.googleFamily}
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${entry.googleFamily}&display=swap`}
        />
      ))}
      <MantineProvider theme={platformTheme} cssVariablesResolver={resolver}>
        <ColorSchemeScript defaultColorScheme="light" />
        <Notifications position="top-right" />
        <UnifiedAdminShell tenantName={tenantName ?? 'Natural Resource'} isPlatformAdmin={isPlatformAdmin}>
          {children}
        </UnifiedAdminShell>
      </MantineProvider>
    </>
  );
}
