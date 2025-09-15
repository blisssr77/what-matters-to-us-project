import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { ChevronDown, Check, Loader2, X } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { useCalendarStore } from '@/store/useCalendarStore'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export default function PrivateSpaceSelect({ className = '' }) {
  const {
    selectedPrivateSpaceIds,
    showAllPrivateSpaces,
    togglePrivateSpaceId,
    setShowAllPrivateSpaces,
    setSelectedPrivateSpaceIds,
  } = useCalendarStore()

  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')

  const btnRef = useRef(null)
  const [rect, setRect] = useState(null)
  const [focusIdx, setFocusIdx] = useState(-1) // -1 = header (“All Private Spaces”)

  // Load all private spaces owned by the user (supports owner_id or user_id)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      const { data: { user } = {} } = await supabase.auth.getUser()
      if (!user?.id) { setItems([]); setLoading(false); return }

      // Try owner_id first; fallback to user_id
      let res = await supabase
        .from('private_spaces')
        .select('id,name,created_at')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })

      if (res.error) {
        // fallback to user_id
        res = await supabase
          .from('private_spaces')
          .select('id,name,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
      }

      if (!mounted) return
      const list = (res.error ? [] : (res.data || [])).map(r => ({
        id: String(r.id),
        name: r.name || 'Untitled',
      }))
      list.sort((a,b)=>a.name.localeCompare(b.name))
      setItems(list)
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [])

  const label = useMemo(() => {
    if (showAllPrivateSpaces) return 'All Private Spaces'
    if (!selectedPrivateSpaceIds?.length) return 'Choose private spaces'
    if (selectedPrivateSpaceIds.length === 1) {
      const sp = items.find(i => i.id === selectedPrivateSpaceIds[0])
      return sp?.name || '1 space'
    }
    return `${selectedPrivateSpaceIds.length} spaces`
  }, [showAllPrivateSpaces, selectedPrivateSpaceIds, items])

  const openMenu = () => {
    const el = btnRef.current
    if (el) setRect(el.getBoundingClientRect())
    setFocusIdx(-1)
    setOpen(true)
  }
  const closeMenu = () => setOpen(false)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter(i => i.name.toLowerCase().includes(s))
  }, [q, items])

  useEffect(() => {
    setFocusIdx(filtered.length ? 0 : -1)
  }, [q]) // eslint-disable-line

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      const total = filtered.length
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIdx(i => Math.min(i + 1, total - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx(i => Math.max(i - 1, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (focusIdx === -1) {
          setShowAllPrivateSpaces(!showAllPrivateSpaces)
        } else if (filtered[focusIdx]) {
          if (showAllPrivateSpaces) setShowAllPrivateSpaces(false)
          togglePrivateSpaceId(filtered[focusIdx].id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, focusIdx, filtered, showAllPrivateSpaces, setShowAllPrivateSpaces, togglePrivateSpaceId])

  const popStyle = useMemo(() => {
    if (!rect) return {}
    return { position: 'fixed', top: rect.bottom + 6, left: rect.left, width: rect.width }
  }, [rect])

  const isSelected = (id) => selectedPrivateSpaceIds.includes(String(id))
  const showSearch = items.length >= 12

  const handleClear = () => {
    setSelectedPrivateSpaceIds([])
    setShowAllPrivateSpaces(true)
    setQ('')
    setFocusIdx(-1)
  }

  return (
    <div className={clsx('relative', className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        className={clsx(
          'w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm',
          'bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{loading ? 'Loading…' : label}</span>
        <ChevronDown size={16} className="ml-2 text-gray-500" />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" onClick={closeMenu} />

          <div
            className={clsx(
              'z-[1000] rounded-md border bg-white shadow-xl text-gray-600',
              'animate-in fade-in zoom-in-95',
              'max-h-[70vh] overflow-auto'
            )}
            style={popStyle}
            role="listbox"
          >
            {/* Header: All Private Spaces */}
            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b text-gray-600">
              <button
                type="button"
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2 text-sm',
                  focusIdx === -1 ? 'bg-gray-100' : 'hover:bg-gray-50'
                )}
                onMouseEnter={() => setFocusIdx(-1)}
                onClick={() => setShowAllPrivateSpaces(!showAllPrivateSpaces)}
              >
                <div className="flex items-center gap-2">
                  <input type="checkbox" readOnly checked={!!showAllPrivateSpaces} />
                  <span className="font-medium">All Private Spaces</span>
                </div>
                {showAllPrivateSpaces && <Check size={16} className="text-blue-600" />}
              </button>

              {showSearch && (
                <div className="px-3 pb-2 text-gray-700">
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search private spaces…"
                    className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-600"
                  />
                </div>
              )}
            </div>

            {/* Items */}
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
                <Loader2 className="animate-spin" size={16} />
                Loading…
              </div>
            ) : filtered.length ? (
              filtered.map((sp, idx) => {
                const focused = idx === focusIdx
                const selected = isSelected(sp.id)
                return (
                  <button
                    key={sp.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={clsx(
                      'w-full flex items-center justify-between px-3 py-2 text-sm',
                      showAllPrivateSpaces ? 'opacity-50' : '',
                      focused ? 'bg-gray-100' : 'hover:bg-gray-50'
                    )}
                    onMouseEnter={() => setFocusIdx(idx)}
                    onClick={() => {
                      if (showAllPrivateSpaces) setShowAllPrivateSpaces(false)
                      togglePrivateSpaceId(sp.id)
                    }}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <input type="checkbox" readOnly checked={selected && !showAllPrivateSpaces} />
                      <span className="truncate">{sp.name}</span>
                    </div>
                    {selected && !showAllPrivateSpaces && (
                      <Check size={16} className="text-blue-600" />
                    )}
                  </button>
                )
              })
            ) : (
              <div className="px-3 py-3 text-sm text-gray-500">No matches.</div>
            )}

            {/* Footer with Clear */}
            <div className="sticky bottom-0 z-10 bg-white/90 backdrop-blur border-t px-3 py-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-gray-50"
                title="Clear selection"
              >
                <X size={14} />
                Clear
              </button>
              <span className="text-xs text-gray-500">
                {showAllPrivateSpaces
                  ? 'Showing all'
                  : `${selectedPrivateSpaceIds.length || 0} selected`}
              </span>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}