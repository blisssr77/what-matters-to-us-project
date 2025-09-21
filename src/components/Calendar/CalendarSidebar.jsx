import dayjs from 'dayjs'
import { Plus } from 'lucide-react'
import MiniMonth from './MiniMonth'
import WorkspaceSelect from './WorkspaceSelect'
import { useCalendarStore } from '@/store/useCalendarStore'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import PrivateSpaceSelect from './PrivateSpaceSelect'

import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc); dayjs.extend(timezone);

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Load the single private space for the signed-in user (owner_id or user_id)
async function loadMyPrivateSpace() {
  const { data: { user } = {} } = await supabase.auth.getUser()
  if (!user?.id) return null

  let res = await supabase
    .from('private_spaces')
    .select('id, name')
    .eq('created_by', user.id)
    .order('sort_order', { ascending: true, nullsLast: true })
    .order('created_at', { ascending: true });

  if (res.error || !res.data) {
    res = await supabase
      .from('private_spaces')
      .select('id, name')
      .eq('created_by', user.id)
      .order('sort_order', { ascending: true, nullsLast: true })
      .order('created_at', { ascending: true });
  }

  return res.data || null
}

export default function CalendarSidebar() {
  // store
  const filters    = useCalendarStore(s => s.filters)
  const setFilters = useCalendarStore(s => s.setFilters)
  const setRange   = useCalendarStore(s => s.setRange)
  const setView    = useCalendarStore(s => s.setView)

  const includeWorkspace = !!filters.includeWorkspace
  const includePrivate   = !!filters.includePrivate
  const showPublicOnly   = !!filters.showPublicOnly
  const showVaultedOnly  = !!filters.showVaultedOnly

  // pulling from the store so the sidebar can initialize scope state
  const selectedWorkspaceIds     = useCalendarStore(s => s.selectedWorkspaceIds);
  const setShowAllWorkspaces     = useCalendarStore(s => s.setShowAllWorkspaces);
  const setSelectedWorkspaceIds  = useCalendarStore(s => s.setSelectedWorkspaceIds);

  const selectedPrivateSpaceIds  = useCalendarStore(s => s.selectedPrivateSpaceIds);
  const setShowAllPrivateSpaces  = useCalendarStore(s => s.setShowAllPrivateSpaces);
  const setSelectedPrivateSpaceIds = useCalendarStore(s => s.setSelectedPrivateSpaceIds);

  // visible month control
  const r = useCalendarStore(s => s.range);
  
  const miniAnchor = useMemo(() => {
    if (!r?.from || !r?.to) return dayjs();
    const from = dayjs(r.from), to = dayjs(r.to);
    return from.add(Math.floor(to.diff(from, 'day') / 2), 'day'); // e.g., Wed of the current week
  }, [r]);

  const [month, setMonth] = useState(dayjs())
  useEffect(() => {
    const base = miniAnchor ? dayjs(miniAnchor) : dayjs()
    setMonth(base.startOf('month'))
  }, [miniAnchor])

  // private space name
  const [myPrivate, setMyPrivate] = useState(null)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const space = await loadMyPrivateSpace()
      if (mounted) setMyPrivate(space)
    })()
    return () => { mounted = false }
  }, [])

  // Click a day in the mini-month to navigate
  const handleDayClick = (d) => {
    const v = useCalendarStore.getState().view;
    const start = v === 'month'
      ? dayjs(d).startOf('month').startOf('week')
      : v === 'day'
        ? dayjs(d).startOf('day')
        : dayjs(d).startOf('week');
    const end = v === 'month'
      ? dayjs(d).endOf('month').endOf('week')
      : v === 'day'
        ? dayjs(d).endOf('day')
        : dayjs(d).endOf('week');
    useCalendarStore.getState().setRange({ from: start.toISOString(), to: end.toISOString() });
  };

  // Mutually-exclusive visibility toggles
  const onTogglePublic = (checked) => {
    setFilters({
      showPublicOnly: checked,
      showVaultedOnly: checked ? false : showVaultedOnly
    })
  }
  const onToggleVaulted = (checked) => {
    setFilters({
      showVaultedOnly: checked,
      showPublicOnly: checked ? false : showPublicOnly
    })
  }

  return (
    <div className="h-full flex flex-col">
      {/* <div className="p-3 border-b">
        <button
          type="button"
          className="btn-main w-full inline-flex items-center justify-center gap-2 rounded bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm"
        >
          <Plus size={16}/> Create
        </button>
      </div> */}

      <div className="p-3 border-b">
        <MiniMonth
          month={month}
          onDayClick={handleDayClick}
          onMonthChange={setMonth}
        />
      </div>

      <div className="p-3 space-y-3 overflow-y-auto">
        <h4 className="text-xs font-bold text-gray-700 uppercase">My calendars</h4>

        {/* Workspace toggle */}
        <label className="flex items-center gap-2 text-sm text-blue-800">
          <input
            type="checkbox"
            checked={includeWorkspace}
            onChange={(e) => {
              const checked = e.target.checked;
              setFilters({ includeWorkspace: checked });
              // initialize scope state when turning on
              if (checked) {
                if ((selectedWorkspaceIds || []).length === 0) {
                  setShowAllWorkspaces(true);       // start with “All Workspaces”
                }
              }
            }}
          />
          My Workspaces
        </label>

        {/* Dropdown only when Workspace is ON */}
        {includeWorkspace && (
          <div className="mt-2 text-gray-700">
            <WorkspaceSelect />
          </div>
        )}

        {/* Private toggle */}
        <label className="flex items-center gap-2 text-sm text-red-600">
          <input
            type="checkbox"
            checked={includePrivate}
            onChange={(e) => {
              const checked = e.target.checked;
              setFilters({ includePrivate: checked });
              // initialize scope state when turning on
              if (checked) {
                if ((selectedPrivateSpaceIds || []).length === 0) {
                  setShowAllPrivateSpaces(true);     // start with “All My Private Spaces”
                }
              }
            }}
          />
          {/* Keep the label simple; you support multiple private spaces */}
          My Private Spaces
        </label>

        {/* Dropdown only when Private is ON */}
        {includePrivate && (
          <div className="mt-2 text-gray-700">
            <PrivateSpaceSelect />
          </div>
        )}

        {/* Visibility filter (mutually exclusive) */}
        <div className="mt-3 text-gray-700 border-t pt-3">
          <h5 className="text-xs font-bold text-gray-700 uppercase mb-2">Visibility</h5>
          <label className="mt-1 flex items-center gap-2 text-sm pt-1">
            <input
              type="checkbox"
              checked={showPublicOnly}
              onChange={(e)=> onTogglePublic(e.target.checked)}
            />
            Public only
          </label>
          <label className="flex items-center gap-2 text-sm pt-1">
            <input
              type="checkbox"
              checked={showVaultedOnly}
              onChange={(e)=> onToggleVaulted(e.target.checked)}
            />
            Vaulted only
          </label>
        </div>
      </div>
    </div>
  )
}