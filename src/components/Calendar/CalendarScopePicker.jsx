import WorkspaceSelect from './WorkspaceSelect'
import PrivateSpaceSelect from './PrivateSpaceSelect'
import { useCalendarStore } from '@/store/useCalendarStore'

export default function CalendarScopePicker() {
  const {
    filters,
    setIncludeWorkspace,
    setIncludePrivate,
  } = useCalendarStore();

  const selectedPrivateSpaceIds = useCalendarStore(s => s.selectedPrivateSpaceIds);
  const setShowAllPrivateSpaces = useCalendarStore(s => s.setShowAllPrivateSpaces);
  const setShowAllWorkspaces = useCalendarStore(s => s.setShowAllWorkspaces);
  const selectedWorkspaceIds = useCalendarStore(s => s.selectedWorkspaceIds);

  return (
    <div className="space-y-3 text-gray-700">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!filters.includeWorkspace}
          onChange={(e) => {
            setIncludeWorkspace(e.target.checked);
            if (e.target.checked && !(selectedWorkspaceIds?.length)) {
              setShowAllWorkspaces(true); // start with "All My Workspaces"
            }
          }}
        />
        Workspaces
      </label>
      {filters.includeWorkspace && <WorkspaceSelect className="mt-1" />}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!filters.includePrivate}
          onChange={(e) => {
            setIncludePrivate(e.target.checked);
            if (e.target.checked && !(selectedPrivateSpaceIds?.length)) {
              setShowAllPrivateSpaces(true); // start with "All My Private Spaces"
            }
          }}
        />
        My Private Spaces
      </label>
      {filters.includePrivate && <PrivateSpaceSelect className="mt-1" />}
    </div>
  );
}