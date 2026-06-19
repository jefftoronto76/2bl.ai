'use client';

// components/admin/shell/UnifiedSidebarNav.tsx
//
// The merged sidebar. Renders NAV_SECTIONS as labelled groups, derives the
// active link from the current pathname, and renders the user button in the
// footer. Used by UnifiedAdminShell — not mounted directly by a route.
//
// Replaces: PlatformSidebarNav.tsx + AdminSidebarNav.tsx (both deleted).

import { usePathname, useRouter } from 'next/navigation';
import { Box, Stack, Text, UnstyledButton } from '@mantine/core';
import { NAV_SECTIONS, isActive } from './nav-config';
import { UserButton } from './UserButton';
import classes from './UnifiedSidebarNav.module.css';

type Props = {
  /** Active tenant name, substituted into the tenant section heading. */
  tenantName: string;
  user: { name: string; email: string };
  /** Called after navigation so the mobile drawer can close. */
  onNavigate?: () => void;
};

export function UnifiedSidebarNav({ tenantName, user, onNavigate }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function go(href: string) {
    router.push(href);
    onNavigate?.();
  }

  return (
    <>
      {/* Wordmark */}
      <Box className={classes.wordmark}>
        <Text className={classes.wordmarkName}>Second Brain Labs</Text>
        <Text className={classes.wordmarkKicker}>Admin</Text>
      </Box>

      {/* Scrolling nav body */}
      <Box className={classes.navScroll}>
        {NAV_SECTIONS.map((section, i) => (
          <Box key={section.label}>
            <Text className={classes.sectionLabel} mt={i === 0 ? 6 : 14}>
              {section.isTenant ? tenantName : section.label}
            </Text>
            <Stack gap={4} pt={0}>
              {section.items.map((it) => {
                const active = isActive(it.href, pathname);
                return (
                  <UnstyledButton
                    key={it.href}
                    className={classes.navlink}
                    mod={{ active }}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => go(it.href)}
                  >
                    {it.label}
                  </UnstyledButton>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Box>

      {/* Footer user button */}
      <Box p={8}>
        <UserButton name={user.name} email={user.email} />
      </Box>
    </>
  );
}
