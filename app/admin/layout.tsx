import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
// Inkwell tokens are shared with jefflougheed.ca but admin lives outside the
// (jefflougheed) route group, so import them explicitly here.
import '../(jefflougheed)/globals.css';

import { buildAdminTheme, buildCssVariablesResolver } from '@/components/admin/theme/mantine-theme';
import { UnifiedAdminShell } from '@/components/admin/shell/UnifiedAdminShell';
import { AdminUserProvider } from '@/services/auth/admin-user-context';
import { syncUser, getTenantName, getCurrentUser, getTenantType, getAuthContext } from '@/services/auth';
import { getTenantBranding } from '@/services/branding/get-tenant-branding';
import { ALL_FONTS, type FontEntry } from '@/services/branding/font-registry';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [supabaseUserId, user, tenantName, tenantType] = await Promise.all([
    syncUser(),
    getCurrentUser(),
    getTenantName(),
    getTenantType(),
  ])

  // Build a dynamic Mantine theme from the tenant's saved branding.
  // Falls back to the inkwell default theme if auth or DB fails.
  let adminTheme = buildAdminTheme();
  let cssResolver = buildCssVariablesResolver();
  let brandingFontEntries: FontEntry[] = [];
  try {
    const authCtx = await getAuthContext();
    const branding = await getTenantBranding(authCtx.tenant_id);
    adminTheme = buildAdminTheme(branding);
    cssResolver = buildCssVariablesResolver(branding);
    console.log('[admin layout] branding resolved:', {
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
    console.error('[admin layout] branding fetch failed:', err instanceof Error ? err.message : err);
  }
  const isPlatformAdmin = user?.isPlatformAdmin === true && tenantType === 'platform'
  console.log('[admin layout]', { isPlatformAdmin: user?.isPlatformAdmin, tenantType, computed: user?.isPlatformAdmin === true && tenantType === 'platform' })

  return (
    <>
      {brandingFontEntries.map(entry => (
        <link
          key={entry.googleFamily}
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${entry.googleFamily}&display=swap`}
        />
      ))}
      <AdminUserProvider supabaseUserId={supabaseUserId}>
        <MantineProvider theme={adminTheme} cssVariablesResolver={cssResolver}>
          <ColorSchemeScript defaultColorScheme="light" />
          <Notifications position="top-right" />
          <UnifiedAdminShell tenantName={tenantName ?? 'Natural Resource'} isPlatformAdmin={isPlatformAdmin}>
            {children}
          </UnifiedAdminShell>
        </MantineProvider>
      </AdminUserProvider>
    </>
  );
}
