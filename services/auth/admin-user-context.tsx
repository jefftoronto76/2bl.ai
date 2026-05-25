'use client'

import { createContext, useContext } from 'react'

const AdminUserContext = createContext<string | null>(null)

export function AdminUserProvider({
  supabaseUserId,
  children,
}: {
  supabaseUserId: string | null
  children: React.ReactNode
}) {
  return (
    <AdminUserContext.Provider value={supabaseUserId}>
      {children}
    </AdminUserContext.Provider>
  )
}

/** Returns the Supabase UUID for the current admin user. */
export function useAdminUserId(): string | null {
  return useContext(AdminUserContext)
}
