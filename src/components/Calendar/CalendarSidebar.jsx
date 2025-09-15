import dayjs from 'dayjs'
import { Plus } from 'lucide-react'
import MiniMonth from './MiniMonth'
import WorkspaceSelect from './WorkspaceSelect'
import { useCalendarStore } from '@/store/useCalendarStore'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import PrivateSpaceSelect from './PrivateSpaceSelect'

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
    .eq('owner_id', user.id)
    .maybeSingle()

  if (res.error || !res.data) {
    res = await supabase
      .from('private_spaces')
      .select('id, name')
      .eq('user_id', user.id)
      .maybeSingle()
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

  // visible month control
  const visibleStart = useCalendarStore(s => s.range.from)
  const [month, setMonth] = useState(dayjs())
  useEffect(() => {
    const base = visibleStart ? dayjs(visibleStart) : dayjs()
    setMonth(base.startOf('month'))
  }, [visibleStart])

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

  const handleDayClick = (d) => {
    const start = d.startOf('week')
    const end   = d.endOf('week')
    setView('timeGridWeek')
    setRange({ from: start.toISOString(), to: end.toISOString() })
  }

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
      <div className="p-3 border-b">
        <button
          type="button"
          className="btn-main w-full inline-flex items-center justify-center gap-2 rounded bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm"
        >
          <Plus size={16}/> Create
        </button>
      </div>

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
            onChange={(e)=> setFilters({ includeWorkspace: e.target.checked })}
          />
          Workspace
        </label>

        {/* Agile dropdown only when Workspace is on */}
        {includeWorkspace && (
          <div className="mt-2">
            <WorkspaceSelect />
          </div>
        )}

        {/* Private toggle */}
        <label className="flex items-center gap-2 text-sm text-red-600">
          <input
            type="checkbox"
            checked={includePrivate}
            onChange={(e)=> setFilters({ includePrivate: e.target.checked })}
          />
          {myPrivate?.name || 'My Private'}
        </label>
        {/* Private dropdown only when Private is on */}
        {includePrivate && (
          <div className="mt-2">
            <PrivateSpaceSelect/>
          </div>
        )}

        {/* Visibility filter (mutually exclusive) */}
        <div className="mt-3">
          <h5 className="text-xs font-semibold text-gray-600 uppercase">Visibility</h5>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showPublicOnly}
              onChange={(e)=> onTogglePublic(e.target.checked)}
            />
            Public only
          </label>
          <label className="flex items-center gap-2 text-sm">
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