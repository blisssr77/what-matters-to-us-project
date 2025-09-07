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
  const [q, setQ] = useState(""); // search query

  const btnRef = useRef(null);
  const [rect, setRect] = useState(null);
  const [focusIdx, setFocusIdx] = useState(-1); // -1 = header row (“All Workspaces”)

  // Load workspaces available to the user
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, workspaces(name)")
        .order("created_at", { ascending: true });

      if (!mounted) return;
      const list = (error ? [] : data || []).map((r) => ({
        id: r.workspace_id,
        name: r.workspaces?.name || "Untitled",
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setItems(list);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const label = useMemo(() => {
    if (showAllWorkspaces) return "All Workspaces";
    if (!selectedWorkspaceIds?.length) return "Choose workspaces";
    if (selectedWorkspaceIds.length === 1) {
      const ws = items.find((i) => i.id === selectedWorkspaceIds[0]);
      return ws?.name || "1 workspace";
    }
    return `${selectedWorkspaceIds.length} workspaces`;
  }, [showAllWorkspaces, selectedWorkspaceIds, items]);

  const openMenu = () => {
    const el = btnRef.current;
    if (el) setRect(el.getBoundingClientRect());
    setFocusIdx(-1); // focus header first
    setOpen(true);
  };
  const closeMenu = () => setOpen(false);

  // Filtered list from query
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) => i.name.toLowerCase().includes(s));
  }, [q, items]);

  // Reset focus if filter changes
  useEffect(() => {
    setFocusIdx(filtered.length ? 0 : -1);
  }, [q]); // eslint-disable-line

  // Keyboard handling
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      const total = filtered.length;
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(i + 1, total - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusIdx === -1) {
          setShowAllWorkspaces(!showAllWorkspaces);
        } else if (filtered[focusIdx]) {
          if (showAllWorkspaces) setShowAllWorkspaces(false);
          toggleWorkspaceId(filtered[focusIdx].id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, focusIdx, filtered, showAllWorkspaces, setShowAllWorkspaces, toggleWorkspaceId]);

  const popStyle = useMemo(() => {
    if (!rect) return {};
    return {
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    };
  }, [rect]);

  const isSelected = (id) => selectedWorkspaceIds.includes(String(id));

  const showSearch = items.length >= 20; // set to true to always show search

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
                "z-[1000] rounded-md border bg-white shadow-xl",
                "animate-in fade-in zoom-in-95",
                "max-h-[70vh] overflow-auto"
              )}
              style={popStyle}
              role="listbox"
            >
              {/* Header: “All Workspaces” */}
              <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
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
                    <span className="font-medium">All Workspaces</span>
                  </div>
                  {showAllWorkspaces && <Check size={16} className="text-blue-600" />}
                </button>

                {/* Search (only when many workspaces; set showSearch=true to force) */}
                {showSearch && (
                  <div className="px-3 pb-2">
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search workspaces…"
                      className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
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
                filtered.map((ws, idx) => {
                  const focused = idx === focusIdx;
                  const selected = isSelected(ws.id);
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={clsx(
                        "w-full flex items-center justify-between px-3 py-2 text-sm",
                        showAllWorkspaces ? "opacity-50" : "",
                        focused ? "bg-gray-100" : "hover:bg-gray-50"
                      )}
                      onMouseEnter={() => setFocusIdx(idx)}
                      onClick={() => {
                        if (showAllWorkspaces) setShowAllWorkspaces(false);
                        toggleWorkspaceId(ws.id);
                      }}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input type="checkbox" readOnly checked={selected && !showAllWorkspaces} />
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