import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronDown, Check, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient'
import { useCalendarStore } from '@/store/useCalendarStore';

export default function PrivateSpaceSelect({ className = "" }) {
  const {
    selectedPrivateSpaceIds,
    showAllPrivateSpaces,
    togglePrivateSpaceId,
    setShowAllPrivateSpaces,
    setSelectedPrivateSpaceIds,
  } = useCalendarStore();

  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef(null);
  const [rect, setRect] = useState(null);
  const [focusIdx, setFocusIdx] = useState(-1);

  // load my private spaces - correct owner field is created_by
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user?.id) { if (mounted) { setItems([]); setLoading(false); } return; }

      const { data, error } = await supabase
        .from('private_spaces')
        .select('id, name')
        .eq('created_by', user.id)
        .order('sort_order', { ascending: true, nullsLast: true })
        .order('created_at', { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error('PrivateSpaceSelect - fetch error:', error);
        setItems([]);
      } else {
        const list = (Array.isArray(data) ? data : []).map(r => ({
          id: String(r.id),
          name: r.name || 'Untitled',
        }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setItems(list);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // Private space label
  const label = useMemo(() => {
    if (showAllPrivateSpaces) return 'All Private Spaces';
    if (!selectedPrivateSpaceIds?.length) return 'Choose private spaces';
    if (selectedPrivateSpaceIds.length === 1) {
      const ps = items.find(i => i.id === selectedPrivateSpaceIds[0]);
      return ps?.name || '1 private space';
    }
    return `${selectedPrivateSpaceIds.length} private spaces`;
  }, [showAllPrivateSpaces, selectedPrivateSpaceIds, items]);

  // Open/close menu
  const openMenu = () => {
    const el = btnRef.current;
    if (el) setRect(el.getBoundingClientRect());
    setFocusIdx(-1);
    setOpen(true);
  };
  const closeMenu = () => setOpen(false);

  //  Filtered items
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(i => i.name.toLowerCase().includes(s));
  }, [q, items]);

  // Reset focus index when filtering changes
  const popStyle = useMemo(() => {
    if (!rect) return {};
    return { position: 'fixed', top: rect.bottom + 6, left: rect.left, width: rect.width };
  }, [rect]);

  // Keyboard navigation
  const showSearch = items.length >= 20;

  // Reset focus index when filtering changes
  const isSelected = useCallback(
    (id) => selectedPrivateSpaceIds.includes(String(id)),
    [selectedPrivateSpaceIds]
  );

  //  Keyboard navigation
  const toggleId = (id) => {
    // if currently "All", switch into specific mode on first selection
    if (showAllPrivateSpaces) setShowAllPrivateSpaces(false);
    togglePrivateSpaceId(String(id)); // store handles flipping to "All" when empty
  };

  //  Keyboard handling (kept)
  const handleClear = () => {
    setSelectedPrivateSpaceIds([]);
    setShowAllPrivateSpaces(true);
    setQ('');
    setFocusIdx(-1);
  };

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

      {open &&
        createPortal(
          <>
            {/* click-outside backdrop */}
            <div className="fixed inset-0 z-[999]" onClick={closeMenu} />

            {/* dropdown */}
            <div
              className={clsx(
                'z-[1000] rounded-md border bg-white shadow-xl text-gray-600',
                'animate-in fade-in zoom-in-95',
                'max-h-[70vh] overflow-auto'
              )}
              style={popStyle}
              role="listbox"
            >
              {/* Header: All My Private Spaces */}
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
                    <span className="font-medium text-xs">All My Private Spaces</span>
                  </div>
                  {showAllPrivateSpaces && <Check size={14} className="text-blue-600" />}
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
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-500">
                  <Loader2 className="animate-spin" size={14} />
                  Loading…
                </div>
              ) : filtered.length ? (
                filtered.map((ps, idx) => {
                  const focused = idx === focusIdx;
                  const selected = isSelected(ps.id);
                  return (
                    <button
                      key={ps.id}
                      type="button"
                      role="option"
                      aria-selected={selected && !showAllPrivateSpaces}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-2 text-xs',
                        showAllPrivateSpaces ? 'opacity-50' : '',
                        focused ? 'bg-gray-100' : 'hover:bg-gray-50'
                      )}
                      onMouseEnter={() => setFocusIdx(idx)}
                      onClick={() => toggleId(ps.id)}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          readOnly
                          checked={selected && !showAllPrivateSpaces}
                        />
                        <span className="truncate">{ps.name}</span>
                      </div>
                      {selected && !showAllPrivateSpaces && (
                        <Check size={16} className="text-blue-600" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-3 text-xs text-gray-500">No matches.</div>
              )}

              {/* Footer */}
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
  );
}