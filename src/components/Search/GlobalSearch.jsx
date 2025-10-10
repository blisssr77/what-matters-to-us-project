import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, Lock, CalendarDays, Tag, Loader2, Hash, Shield } from 'lucide-react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { globalSearch, fmtWhen } from '@/lib/searchApi'
import { useCalendarStore } from '@/store/useCalendarStore'

const SECTIONS = [
  { key: 'wsDocs', label: 'Workspace Docs/Notes', icon: <FileText size={14}/> },
  { key: 'pvDocs', label: 'Private Docs/Notes',   icon: <Shield size={14}/> },
  { key: 'wsCal',  label: 'Workspace Calendar',   icon: <CalendarDays size={14}/> },
  { key: 'pvCal',  label: 'Private Calendar',     icon: <CalendarDays size={14}/> },
  { key: 'tags',   label: 'Tags',                 icon: <Tag size={14}/> },
]

export default function GlobalSearch({ className = '' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState({ wsDocs: [], pvDocs: [], wsCal: [], pvCal: [], tags: [] })
  const [activeIdx, setActiveIdx] = useState(0)

  const navigate = useNavigate()
  const inputRef = useRef(null)
  const wrapRef = useRef(null)

  // Shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Debounced search
  useEffect(() => {
    if (!open) return
    const handle = setTimeout(async () => {
      const term = q.trim()
      if (!term) { setRes({ wsDocs: [], pvDocs: [], wsCal: [], pvCal: [], tags: [] }); return }
      setLoading(true)
      try {
        const data = await globalSearch(term)
        setRes(data)
        setActiveIdx(0)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [q, open])

  // Flatten results for arrow navigation
  const flat = useMemo(() => {
    const rows = []
    for (const sec of SECTIONS) {
      const arr = res[sec.key] || []
      if (arr.length) {
        rows.push({ type: 'header', label: sec.label })
        arr.forEach(item => rows.push({ type: 'item', section: sec.key, item }))
      }
    }
    return rows
  }, [res])

  const move = (dir) => {
    if (!flat.length) return
    setActiveIdx(i => {
      let n = i + dir
      if (n < 0) n = flat.length - 1
      if (n >= flat.length) n = 0
      // skip headers
      while (flat[n]?.type === 'header') {
        n = n + dir
        if (n < 0) n = flat.length - 1
        if (n >= flat.length) n = 0
      }
      return n
    })
  }

  // Navigate handlers
  const goDoc = (row) => {
    const { item } = row
    const hasFiles = Array.isArray(item.file_metas) && item.file_metas.length > 0
    if (row.section === 'wsDocs') {
      navigate(hasFiles ? `/workspace/vaults/doc-view/${item.id}` : `/workspace/vaults/note-view/${item.id}`)
    } else {
      navigate(hasFiles ? `/privatespace/vaults/doc-view/${item.id}` : `/privatespace/vaults/note-view/${item.id}`)
    }
    setOpen(false)
  }

  const goCal = (row) => {
    const { item, section } = row
    // Set calendar anchor in store, then navigate
    const anchor = item.start_at ? dayjs(item.start_at) : dayjs()
    const { setRange } = useCalendarStore.getState()
    const start = anchor.startOf('week'), end = anchor.endOf('week')
    setRange({ from: start.toISOString(), to: end.toISOString() })
    navigate('/calendar')
    setOpen(false)
  }

  const goTag = (row) => {
    const { item } = row
    if (item.section === 'Workspace') {
      navigate(`/workspace/vaults?tag=${encodeURIComponent(item.name)}`)
    } else {
      navigate(`/privatespace/vaults?tag=${encodeURIComponent(item.name)}`)
    }
    setOpen(false)
  }

  const onPick = () => {
    const row = flat[activeIdx]
    if (!row || row.type !== 'item') return
    if (row.section === 'wsDocs' || row.section === 'pvDocs') goDoc(row)
    else if (row.section === 'wsCal' || row.section === 'pvCal') goCal(row)
    else if (row.section === 'tags') goTag(row)
  }

  // close helpers
const closeDropdown = useCallback(() => {
  setOpen(false);
  setActiveIdx(-1);
}, [setOpen, setActiveIdx]);

// outside click to close
useEffect(() => {
  if (!open) return;
  const onDoc = (e) => {
    if (!wrapRef.current) return;
    if (!wrapRef.current.contains(e.target)) closeDropdown();
  };
  document.addEventListener('mousedown', onDoc);
  document.addEventListener('touchstart', onDoc, { passive: true });
  return () => {
    document.removeEventListener('mousedown', onDoc);
    document.removeEventListener('touchstart', onDoc);
  };
}, [open, closeDropdown]);

// ESC to close
useEffect(() => {
  if (!open) return;
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
      inputRef.current?.blur();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [open, closeDropdown]);

// ensure Enter closes when you pick
const handlePick = useCallback((e) => {
  onPick(e);
  closeDropdown();
}, [onPick, closeDropdown]);

  // Close on escape
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown();
        return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return }
    if (e.key === 'Enter') { e.preventDefault(); onPick(); return }
  }

  return (
    <div ref={wrapRef} className={clsx('relative', className)}>
        {/* trigger/input */}
        <div
        className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-slate-200 hover:bg-white/10 focus-within:bg-white/10"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        >
        <Search size={16} className="text-slate-400" />
        <input
            ref={inputRef}
            value={q}
            placeholder="Search docs, notes, calendar, tags… (⌘/Ctrl K)"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-slate-400"
        />
        {loading ? <Loader2 size={16} className="animate-spin text-slate-400" /> : null}
        </div>

        {/* dropdown */}
        {open && (
        <div className="absolute left-0 mt-2 w-[560px] max-w-[min(90vw,560px)] z-40 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur shadow-xl">
            {!flat.length && !loading ? (
            <div className="p-4 text-sm text-slate-400">Type to search…</div>
            ) : (
            <ul className="max-h-[60vh] overflow-auto py-1">
                {flat.map((row, idx) => row.type === 'header' ? (
                <li key={`h-${row.label}`} className="px-3 pt-3 pb-1 text-[11px] font-semibold text-slate-400">
                    {row.label}
                </li>
                ) : (
                <li
                    key={`${row.section}:${row.item.id}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handlePick}
                    className={clsx(
                    'px-3 py-2 cursor-pointer text-sm flex items-start gap-2 hover:bg-white/5',
                    idx === activeIdx && 'bg-white/10'
                    )}
                >
                    <RowIcon row={row} />
                    <div className="min-w-0">
                    <div className="truncate text-slate-100">
                        {row.item.title || row.item.name || row.item.slug || 'Untitled'}
                    </div>
                    <RowSub row={row} />
                    </div>
                </li>
                ))}
            </ul>
            )}
        </div>
        )}
    </div>
    );
}

function RowIcon({ row }) {
  const isDoc   = row.section === 'wsDocs' || row.section === 'pvDocs'
  const isCal   = row.section === 'wsCal'  || row.section === 'pvCal'
  const isTag   = row.section === 'tags'
  const vaulted = isDoc && row.item.is_vaulted
  if (isTag) return <Hash size={16} className="mt-[2px] text-violet-300" />
  if (isCal) return <CalendarDays size={16} className="mt-[2px] text-blue-300" />
  return vaulted
    ? <Lock size={16} className="mt-[2px] text-purple-300" />
    : <FileText size={16} className="mt-[2px] text-slate-300" />
}

function RowSub({ row }) {
  const isDoc = row.section === 'wsDocs' || row.section === 'pvDocs'
  const isCal = row.section === 'wsCal'  || row.section === 'pvCal'
  const isTag   = row.section === 'tags'
  if (isTag) return null

  if (isDoc) {
    const scope = row.section === 'wsDocs' ? 'Workspace' : 'Private'
    const tags  = Array.isArray(row.item.tags) ? row.item.tags.slice(0, 3) : []
    return (
      <div className="text-[11px] text-slate-400 truncate">
        {scope} • {tags.map(t => `#${t}`).join(' ')}
      </div>
    )
  }
  if (isCal) {
    const scope = row.section === 'wsCal' ? 'Workspace' : 'Private'
    return (
      <div className="text-[11px] text-slate-400 truncate">
        {scope} • {fmtWhen(row.item.start_at, row.item.end_at, row.item.all_day)}
      </div>
    )
  }
  // tags
  return (
    <div className="text-[11px] text-slate-400 truncate">
      {row.item.section === 'Workspace' ? 'Workspace' : 'Private'}
    </div>
  )
}
