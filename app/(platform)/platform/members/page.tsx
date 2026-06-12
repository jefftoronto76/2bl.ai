import { getCurrentUser } from '@/services/auth'
import { redirect } from 'next/navigation'
import { getAdminClient } from '@/services/auth/supabase-admin'
import MembersManager, { type TenantOption } from './MembersManager'

export const dynamic = 'force-dynamic'

export default async function PlatformMembersPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/secondbrainlabs/sign-in')
  }
  if (!user.isPlatformAdmin) {
    redirect('/admin')
  }

  const supabase = getAdminClient()
  const { data } = await supabase
    .from('tenants')
    .select('id, name, slug, type')
    .order('name', { ascending: true })

  const tenants: TenantOption[] = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    type: t.type,
  }))

  return <MembersManager tenants={tenants} />
}
