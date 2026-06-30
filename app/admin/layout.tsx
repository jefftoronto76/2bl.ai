import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
// Inkwell tokens are shared with jefflougheed.ca but admin lives outside the
// (jefflougheed) route group, so import them explicitly here.
import '../(jefflougheed)/globals.css';

import { AdminThemeProvider } from '@/components/admin/theme/AdminThemeProvider';
import type { BrandingForTheme } from '@/components/admin/theme/mantine-theme';
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

  // Resolve branding server-side; pass raw values to AdminThemeProvider (client).
  // generateColors() is client-only so theme construction happens in the provider.
  let resolvedBranding: BrandingForTheme | null = null;
  let resolvedTenantId: string | undefined;
  let brandingFontEntries: FontEntry[] = [];
  let faviconBase: string | null = null;
  try {
    const authCtx = await getAuthContext();
    resolvedTenantId = authCtx.tenant_id;
    const branding = await getTenantBranding(authCtx.tenant_id, 'admin');
    faviconBase = branding?.favicon_base_path ?? null;
    const useDbBranding = branding?.use_db_branding === true;
    console.log('[branding:admin]', JSON.stringify({ branding }));
    resolvedBranding = useDbBranding ? branding : null;
    console.log('[admin layout] branding resolved:', {
      tenant_id: authCtx.tenant_id,
      use_db_branding: useDbBranding,
      font_primary: branding?.font_primary,
      font_secondary: branding?.font_secondary,
      accent: branding?.accent,
    });
    if (useDbBranding) {
      const allowedFontValues = new Set(ALL_FONTS.map(f => f.value));
      brandingFontEntries = [
        branding?.font_primary,
        branding?.font_secondary,
        branding?.font_mono,
      ]
        .filter((v): v is string => !!v && allowedFontValues.has(v))
        .map(v => ALL_FONTS.find(f => f.value === v)!)
        .filter(e => !!e?.googleFamily);
    }
  } catch (err) {
    console.error('[admin layout] branding fetch failed:', err instanceof Error ? err.message : err);
  }
  const isPlatformAdmin = user?.isPlatformAdmin === true && tenantType === 'platform'
  console.log('[admin layout]', { isPlatformAdmin: user?.isPlatformAdmin, tenantType, computed: user?.isPlatformAdmin === true && tenantType === 'platform' })

  return (
    <>
      {faviconBase && (
        <>
          <link rel="icon" href={`${faviconBase}/favicon.ico`} sizes="any" />
          <link rel="icon" href={`${faviconBase}/favicon.svg`} type="image/svg+xml" />
          <link rel="icon" href={`${faviconBase}/favicon-96x96.png`} sizes="96x96" type="image/png" />
          <link rel="apple-touch-icon" href={`${faviconBase}/apple-touch-icon.png`} />
          <link rel="manifest" href={`${faviconBase}/site.webmanifest`} />
        </>
      )}
      {brandingFontEntries.map(entry => (
        <link
          key={entry.googleFamily}
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${entry.googleFamily}&display=swap`}
        />
      ))}
      <AdminUserProvider supabaseUserId={supabaseUserId}>
        <AdminThemeProvider branding={resolvedBranding} tenantId={resolvedTenantId}>
          <UnifiedAdminShell tenantName={tenantName ?? 'Natural Resource'} isPlatformAdmin={isPlatformAdmin}>
            {children}
          </UnifiedAdminShell>
        </AdminThemeProvider>
      </AdminUserProvider>
    </>
  );
}
