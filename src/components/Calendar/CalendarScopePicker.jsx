import WorkspaceSelect from './WorkspaceSelect'
import PrivateSpaceSelect from './PrivateSpaceSelect'
import { useCalendarStore } from '@/store/useCalendarStore'

export default function CalendarScopePicker() {
  const filters    = useCalendarStore(s => s.filters)
  const setFilters = useCalendarStore(s => s.setFilters)

  const includeWorkspace = !!filters.includeWorkspace
  const includePrivate = !!filters.includePrivate

  return (
    <div className="space-y-3 text-gray-700">
      {/* Workspaces */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeWorkspace}
          onChange={(e)=> setFilters({ includeWorkspace: e.target.checked })}
        />
        Workspaces
      </label>
      {includeWorkspace && <WorkspaceSelect className="mt-1" />}

      {/* My Private */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includePrivate}
          onChange={(e)=> setFilters({ includePrivate: e.target.checked })}
        />
        My Private
      </label>
      {includePrivate && <PrivateSpaceSelect className="mt-1" />}
    </div>
  )
}