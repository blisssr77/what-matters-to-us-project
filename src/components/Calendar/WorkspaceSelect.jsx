import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { ChevronDown, Check, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useCalendarStore } from "@/store/useCalendarStore";

export default function WorkspaceSelect({ className = "" }) {
  const {
    selectedWorkspaceIds,
    showAllWorkspaces,
    toggleWorkspaceId,
    setShowAllWorkspaces,
    setSelectedWorkspaceIds,
  } = useCalendarStore();

  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef(null);
  const [rect, setRect] = useState(null);
  const [focusIdx, setFocusIdx] = useState(-1);

  // ✅ Load only the current user's workspaces
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user?.id) { if (mounted) { setItems([]); setLoading(false); } return; }

      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name')
        .eq('created_by', user.id) // correct owner field
        .order('sort_order', { ascending: true, nullsLast: true })
        .order('created_at', { ascending: true });

      if (!mounted) return;
      const list = (!error && Array.isArray(data))
        ? data.map(r => ({ id: String(r.id), name: r.name || 'Untitled' }))
        : [];
      list.sort((a, b) => a.name.localeCompare(b.name));
      setItems(list);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // Workspace label
  const label = useMemo(() => {
    if (showAllWorkspaces) return "All Workspaces";
    if (!selectedWorkspaceIds?.length) return "Choose workspaces";
    if (selectedWorkspaceIds.length === 1) {
      const ws = items.find((i) => i.id === selectedWorkspaceIds[0]);
      return ws?.name || "1 workspace";
    }
    return `${selectedWorkspaceIds.length} workspaces`;
  }, [showAllWorkspaces, selectedWorkspaceIds, items]);

  // Open/close menu
  const openMenu = () => {
    const el = btnRef.current;
    if (el) setRect(el.getBoundingClientRect());
    setFocusIdx(-1);
    setOpen(true);
  };
  const closeMenu = () => setOpen(false);

  // Filtered items
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) => i.name.toLowerCase().includes(s));
  }, [q, items]);

  // Reset focus index when filtering changes
  useEffect(() => {
    setFocusIdx(filtered.length ? 0 : -1);
  }, [q]); // eslint-disable-line

  // Mouse/keyboard: ensure any selection disables "All"
  const toggleId = (id) => {
    if (showAllWorkspaces) setShowAllWorkspaces(false);
    toggleWorkspaceId(String(id));
  };

  // Keyboard handling (kept)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      const total = filtered.length;
      if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, total - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, -1)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (focusIdx === -1) setShowAllWorkspaces(!showAllWorkspaces);
        else if (filtered[focusIdx]) toggleId(filtered[focusIdx].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, focusIdx, filtered, showAllWorkspaces, setShowAllWorkspaces]);

  // Dropdown position
  const popStyle = useMemo(() => {
    if (!rect) return {};
    return { position: "fixed", top: rect.bottom + 6, left: rect.left, width: rect.width };
  }, [rect]);

  const isSelected = (id) => selectedWorkspaceIds.includes(String(id));

  const showSearch = items.length >= 20;

  // Clear selections → back to “All Workspaces”
  const handleClear = () => {
    setSelectedWorkspaceIds([]);
    setShowAllWorkspaces(true);
    setQ("");
    setFocusIdx(-1);
  };

  return (
    <div className={clsx("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        className={clsx(
          "w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm",
          "bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{loading ? "Loading…" : label}</span>
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
                "z-[1000] rounded-md border bg-white shadow-xl text-gray-600",
                "animate-in fade-in zoom-in-95",
                "max-h-[70vh] overflow-auto"
              )}
              style={popStyle}
              role="listbox"
            >
              {/* Header: “All Workspaces” */}
              <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b text-gray-600">
                <button
                  type="button"
                  className={clsx(
                    "w-full flex items-center justify-between px-3 py-2 text-sm",
                    focusIdx === -1 ? "bg-gray-100" : "hover:bg-gray-50"
                  )}
                  onMouseEnter={() => setFocusIdx(-1)}
                  onClick={() => setShowAllWorkspaces(!showAllWorkspaces)}
                >
                  <div className="flex items-center gap-2">
                    <input type="checkbox" readOnly checked={!!showAllWorkspaces} />
                    <span className="font-medium text-xs">All Workspaces</span>
                  </div>
                  {showAllWorkspaces && <Check size={14} className="text-blue-600" />}
                </button>

                {/* Search (only when many workspaces; set showSearch=true to force) */}
                {showSearch && (
                  <div className="px-3 pb-2 text-gray-700">
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search workspaces…"
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
                filtered.map((ws, idx) => {
                  const focused = idx === focusIdx;
                  const selected = isSelected(String(ws.id));
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      role="option"
                      aria-selected={selected && !showAllWorkspaces}
                      className={clsx(
                        "w-full flex items-center justify-between px-3 py-2 text-xs",
                        showAllWorkspaces ? "opacity-50" : "",
                        focused ? "bg-gray-100" : "hover:bg-gray-50"
                      )}
                      onMouseEnter={() => setFocusIdx(idx)}
                      onClick={() => {
                        if (showAllWorkspaces) setShowAllWorkspaces(false);
                        toggleWorkspaceId(String(ws.id)); // ← coerce to string
                      }}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          readOnly
                          checked={selected && !showAllWorkspaces}
                        />
                        <span className="truncate">{ws.name}</span>
                      </div>
                      {selected && !showAllWorkspaces && (
                        <Check size={16} className="text-blue-600" />
                      )}
                    </button>
                  );
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
                  {showAllWorkspaces
                    ? "Showing all"
                    : `${selectedWorkspaceIds.length || 0} selected`}
                </span>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}