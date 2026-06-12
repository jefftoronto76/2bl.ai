import { InvitesManager } from './InvitesManager'

export const dynamic = 'force-dynamic'

export default function InvitesPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <p className="text-base font-semibold text-gray-900">Invites</p>
      </div>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <InvitesManager />
      </div>
    </div>
  )
}
