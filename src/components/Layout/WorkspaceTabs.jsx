import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { create } from "zustand";

export default function WorkspaceTabs({
  workspaces = [],
  activeId,
  onSelect,
  onSettingsClick,
  onCreateClick,
  onReorder, // optional: (newOrderArray) => void
  settingsTitle = "Workspace Settings",
  createTitle = "Create new workspace",
}) {
  const scrollerRef = useRef(null);
  const tabRefs = useRef({});
  const [canScrollL, setCanScrollL] = useState(false);
  const [canScrollR, setCanScrollR] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  // Memoize the workspaces to avoid unnecessary re-renders
  useEffect(() => {
    const el = tabRefs.current[activeId];
    if (el?.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeId]);

  // Create a new array for UI to avoid mutating the original workspaces
  const updateScrollState = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollL(el.scrollLeft > 0);
    setCanScrollR(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  // Create a new array for UI to avoid mutating the original workspaces
  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
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

  // Function to scroll left or right
  const scrollBy = (dx) => scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  // drag to reorder (optional)
  const handleDragStart = (i) => (e) => {
    setDragIdx(i);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
  };
  // Handle drag over and drop
  const handleDragOver = (i) => (e) => {
    e.preventDefault();
    setOverIdx(i);
  };
  // Handle drop event
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
  // Reset drag state
  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div className="flex items-center gap-2 border-b border-gray-800 bg-[#0f1115] px-2 py-1">
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollBy(-200)}
        disabled={!canScrollL}
        className={clsx("p-1 rounded-md text-gray-400 hover:text-gray-200 transition",
          !canScrollL && "opacity-30 cursor-default")}
      >
        <ChevronLeft size={18} />
      </button>

      <div
        ref={scrollerRef}
        className="relative flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent"
        onScroll={updateScrollState}
      >
        <div className="flex items-end gap-1 min-h-[36px]">
          {workspaces.map((ws, i) => {
            const active = activeId === ws.id;
            const showDropLeft = overIdx === i && dragIdx !== null && dragIdx !== i;
            return (
              <div key={ws.id} className="relative" onDragOver={handleDragOver(i)} onDrop={handleDrop(i)}>
                {showDropLeft && <span className="absolute -left-0.5 top-1 bottom-1 w-px bg-purple-500 rounded" />}
                <button
                  ref={(el) => (tabRefs.current[ws.id] = el)}
                  role="tab"
                  aria-selected={active}
                  draggable={!!onReorder}
                  onDragStart={onReorder ? handleDragStart(i) : undefined}
                  onDragEnd={onReorder ? handleDragEnd : undefined}
                  onClick={() => onSelect?.(ws.id)}
                  className={clsx(
                    "px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-t-md border transition-colors select-none",
                    active
                      ? "bg-[#1b1e24] text-white border-gray-800 border-b-transparent"
                      : "bg-[#15181d] text-gray-300 border-transparent hover:bg-[#1a1d22] hover:text-gray-100"
                  )}
                >
                  {ws.name}
                </button>
              </div>
            );
          })}

          <button
            onClick={onCreateClick}
            id="ws-create-btn"
            className="ml-1 h-6 w-6 rounded-md bg-[#15181d] text-gray-300 hover:bg-[#1a1d22] hover:text-white flex items-center justify-center border border-transparent"
            title={createTitle}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollBy(200)}
        disabled={!canScrollR}
        className={clsx("p-1 rounded-md text-gray-400 hover:text-gray-200 transition",
          !canScrollR && "opacity-30 cursor-default")}
      >
        <ChevronRight size={18} />
      </button>

      <button
        onClick={onSettingsClick}
        className="ml-1 p-1 text-gray-400 hover:text-gray-200 rounded-md"
        title={settingsTitle}
      >
        <Settings size={18} />
      </button>
    </div>
  );
}
