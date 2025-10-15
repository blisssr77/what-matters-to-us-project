import dayjs from 'dayjs'
import { Plus } from 'lucide-react'
import MiniMonth from './MiniMonth'
import WorkspaceSelect from './WorkspaceSelect'
import { useCalendarStore } from '@/store/useCalendarStore'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import QuickAddModal from '@/components/calendar/QuickAddModal.jsx'

import PrivateSpaceSelect from './PrivateSpaceSelect'

import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc); dayjs.extend(timezone);

// Load the single private space for the signed-in user (owner_id or user_id)
async function loadMyPrivateSpace() {
  const { data: { user } = {} } = await supabase.auth.getUser()
  if (!user?.id) return null

  const { data, error } = await supabase
    .from('private_spaces')
    .select('id, name')
    .eq('created_by', user.id)
    .order('sort_order', { ascending: true, nullsLast: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('loadMyPrivateSpace error:', error)
    return null
  }
  return data || null
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

  const [ openQuick, setOpenQuick] = useState(false)

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
//===================================================== UI =====================================================//
  return (
    <div className="h-full flex flex-col text-[13px]">
      {/* CREATE MODAL */}
      <>
        <div className="p-2 border-b">
          <button
            type="button"
            onClick={() => setOpenQuick(true)}
            className="btn-main w-full inline-flex items-center justify-center gap-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white py-1.5 text-xs"
          >
            <Plus size={14}/> Create
          </button>
        </div>

        <QuickAddModal
          open={openQuick}
          onClose={() => setOpenQuick(false)}
          onCreated={(row) => {
            // optional: toast, refresh lists, navigate, etc.
            setOpenQuick(false);
          }}
          defaultScope="workspace" // or "private"
        />
      </>

      <div className="p-2 border-b">
        <MiniMonth
          month={month}
          onDayClick={handleDayClick}
          onMonthChange={setMonth}
        />
      </div>

      <div className="p-2 space-y-2 overflow-y-auto text-xs">
        <h4 className="text-[11px] font-bold text-gray-800 uppercase tracking-widest">My calendars</h4>


        {/* Workspace toggle */}
        <div className="space-y-1 text-xs [&_*]:!text-xs">
          <label className="flex items-center gap-1.5 text-blue-800 py-0.5">
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
            <div className="mt-1 text-xs text-gray-700">
              <WorkspaceSelect />
            </div>
          )}
        </div>

        {/* Private toggle */}
        <div className="space-y-1 text-xs [&_*]:!text-xs">
          <label className="flex items-center gap-1.5 text-red-600 py-0.5">
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
            <div className="mt-1 text-gray-700">
              <PrivateSpaceSelect />
            </div>
          )}
        </div>

        {/* Visibility filter (mutually exclusive) */}
        <div className="mt-2 text-gray-800 border-t pt-2">
          <h5 className="text-[11px] font-bold uppercase mb-2 tracking-widest">Visibility</h5>
          <label className="mt-0.5 flex items-center gap-1.5 text-xs mb-2">
            <input
              type="checkbox"
              checked={showPublicOnly}
              onChange={(e)=> onTogglePublic(e.target.checked)}
            />
            Public only
          </label>
          <label className="flex items-center gap-1.5 text-xs mt-0.5 mb-2">
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