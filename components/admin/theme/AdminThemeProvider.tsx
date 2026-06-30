'use client';

import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { buildAdminTheme, type BrandingForTheme } from './mantine-theme';

interface AdminThemeProviderProps {
  branding: BrandingForTheme | null;
  tenantId?: string;
  children: React.ReactNode;
}

export function AdminThemeProvider({ branding, tenantId, children }: AdminThemeProviderProps) {
  const { theme, resolver } = buildAdminTheme(branding, tenantId);
  return (
    <MantineProvider theme={theme} cssVariablesResolver={resolver}>
      <ColorSchemeScript defaultColorScheme="light" />
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  );
}
