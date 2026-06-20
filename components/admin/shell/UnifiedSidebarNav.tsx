'use client';

// components/admin/shell/UnifiedSidebarNav.tsx
//
// Merged sidebar: three labelled sections (Platform, Tenant, Prompt Studio)
// rendered from NAV_SECTIONS. Platform section is hidden for non-platform
// admins. The tenant section heading is substituted with the active tenant
// name at render time.

import { usePathname, useRouter } from 'next/navigation';
import { Box, Stack, Text, UnstyledButton } from '@mantine/core';
import { NAV_SECTIONS, isActive } from './nav-config';
import { UserButton } from './UserButton';
import classes from './UnifiedSidebarNav.module.css';

type Props = {
  tenantName: string;
  isPlatformAdmin: boolean;
  user: { name: string; email: string };
  onNavigate?: () => void;
};

export function UnifiedSidebarNav({ tenantName, isPlatformAdmin, user, onNavigate }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function go(href: string) {
    router.push(href);
    onNavigate?.();
  }

  const visibleSections = NAV_SECTIONS.filter(
    (s) => !s.platformOnly || isPlatformAdmin,
  );

  return (
    <>
      {/* Wordmark */}
      <Box className={classes.wordmark}>
        <Text className={classes.wordmarkName}>Second Brain Labs</Text>
        <Text className={classes.wordmarkKicker}>Admin</Text>
      </Box>

      {/* Scrolling nav body */}
      <Box className={classes.navScroll} component="nav" aria-label="Admin navigation">
        {visibleSections.map((section, i) => (
          <Box key={section.label} component="section" aria-label={section.label}>
            <Text
              className={classes.sectionLabel}
              c="dimmed"
              mt={i === 0 ? 6 : 14}
              component="span"
            >
              {section.isTenant ? tenantName : section.label}
            </Text>
            <Stack gap={4}>
              {section.items.map((item) => {
                const active = isActive(item.href, pathname);
                return (
                  <UnstyledButton
                    key={item.href}
                    className={classes.navlink}
                    mod={{ active }}
                    style={{
                      borderRadius: 'var(--mantine-radius-sm)',
                      ...(active ? {
                        background: 'var(--mantine-color-green-filled)',
                        color: 'var(--mantine-color-white)',
                        fontWeight: 500,
                      } : {}),
                    }}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => go(item.href)}
                  >
                    {item.label}
                  </UnstyledButton>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Box>

      {/* Footer user button */}
      <Box p={8} style={{ flexShrink: 0 }}>
        <UserButton name={user.name} email={user.email} />
      </Box>
    </>
  );
}
