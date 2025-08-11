import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

export default function WorkspaceTabs({
  workspaces,
  activeId,
  onSelect,
  onSettingsClick,
  onCreateClick,
  onReorder, // (newOrderArray) => void
}) {
  const scrollerRef = useRef(null);
  const tabRefs = useRef({});
  const [canScrollL, setCanScrollL] = useState(false);
  const [canScrollR, setCanScrollR] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  // keep a fast lookup for indices
  const indexById = useMemo(() => {
    const m = new Map();
    workspaces.forEach((w, i) => m.set(w.id, i));
    return m;
  }, [workspaces]);

  // ensure active tab is visible
  useEffect(() => {
    const el = tabRefs.current[activeId];
    if (el?.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeId]);

  // show/hide arrows
  const updateScrollState = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollL(el.scrollLeft > 0);
    setCanScrollR(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    // horizontal scroll on wheel
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
    };
  }, [workspaces.length]);

  // scroll by fixed amount
  const scrollBy = (dx) => {
    scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  };

  // ---- drag to reorder (HTML5 DnD, no libs)
  const handleDragStart = (i) => (e) => {
    setDragIdx(i);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i)); // required for Firefox
  };
  // handle drag over to show drop indicator
  const handleDragOver = (i) => (e) => {
    e.preventDefault(); // allow drop
    setOverIdx(i);
  };
  // handle drop to reorder
  const handleDrop = (i) => (e) => {
    e.preventDefault();
    setOverIdx(null);
    const from = dragIdx ?? Number(e.dataTransfer.getData("text/plain"));
    if (Number.isNaN(from) || from === i) return;
    const copy = [...workspaces];
    const [moved] = copy.splice(from, 1);
    copy.splice(i, 0, moved);
    setDragIdx(null);
    onReorder?.(copy);
  };
  // reset drag/over state when drag ends
  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div className="flex items-center gap-2 border-b border-gray-800 bg-[#0f1115] px-2 py-1">
      {/* Left scroll button */}
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollBy(-200)}
        disabled={!canScrollL}
        className={clsx(
          "p-1 rounded-md text-gray-400 hover:text-gray-200 transition",
          !canScrollL && "opacity-30 cursor-default"
        )}
      >
        <ChevronLeft size={18} />
      </button>

      {/* Tabs scroller */}
      <div
        ref={scrollerRef}
        className="relative flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
        onScroll={updateScrollState}
      >
        <div className="flex items-end gap-1 min-h-[36px]">
          {workspaces.map((ws, i) => {
            const active = activeId === ws.id;
            const showDropLeft = overIdx === i && dragIdx !== null && dragIdx !== i;

            return (
              <div key={ws.id} className="relative" onDragOver={handleDragOver(i)} onDrop={handleDrop(i)}>
                {/* drop indicator */}
                {showDropLeft && (
                  <span className="absolute -left-0.5 top-1 bottom-1 w-px bg-purple-500 rounded" />
                )}

                <button
                  ref={(el) => (tabRefs.current[ws.id] = el)}
                  role="tab"
                  aria-selected={active}
                  draggable
                  onDragStart={handleDragStart(i)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onSelect(ws.id)}
                  className={clsx(
                    "px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-t-md border",
                    "transition-colors select-none",
                    active
                      ? "bg-[#1b1e24] text-white border-gray-700 border-b-transparent"
                      : "bg-[#15181d] text-gray-300 border-transparent hover:bg-[#1a1d22] hover:text-gray-100"
                  )}
                >
                  {ws.name}
                </button>
              </div>
            );
          })}

          {/* + button sits inside scroller like Supabase */}
          <button
            onClick={onCreateClick}
            className="ml-1 h-6 w-6 rounded-md bg-[#15181d] text-gray-300 hover:bg-[#1a1d22] hover:text-white flex items-center justify-center border border-transparent"
            title="Create new workspace"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Right scroll button */}
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollBy(200)}
        disabled={!canScrollR}
        className={clsx(
          "p-1 rounded-md text-gray-400 hover:text-gray-200 transition",
          !canScrollR && "opacity-30 cursor-default"
        )}
      >
        <ChevronRight size={18} />
      </button>

      {/* Settings pinned at far right */}
      <button
        onClick={onSettingsClick}
        className="ml-1 p-1 text-gray-400 hover:text-gray-200 rounded-md"
        title="Workspace Settings"
      >
        <Settings size={18} />
      </button>
    </div>
  );
}
