'use client'

// Drop this around the admin route group (or reuse your existing MantineProvider).
// It applies buildAdminTheme + mounts the Notifications portal that notify() targets.
//
// Mantine CSS + fonts must load too — see README "2 · Provider & global setup".

import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { theme } from './theme/mantine-theme'

export function AdminProviders({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" zIndex={2000} />
      {children}
    </MantineProvider>
  )
}
