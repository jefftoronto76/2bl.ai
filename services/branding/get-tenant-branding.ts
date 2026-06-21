import { getAdminClient } from '@/services/auth/supabase-admin';

export interface TenantBranding {
  color_background:   string | null;
  color_accent:       string | null;
  color_accent_rgb:   string | null;
  color_text_primary: string | null;
  color_text_muted:   string | null;
  font_display:       string | null;
  font_body:          string | null;
  font_mono:          string | null;
}

/** Fetches the tenant_branding row for `tenantId`. Returns null on miss or error. */
export async function getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('tenant_branding')
      .select(
        'color_background, color_accent, color_accent_rgb, color_text_primary, color_text_muted, font_display, font_body, font_mono'
      )
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('[branding] fetch failed:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[branding] fetch threw:', err instanceof Error ? err.message : err);
    return null;
  }
}
