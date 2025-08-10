import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Settings } from "lucide-react";
import clsx from "clsx";

const WorkspaceTabs = ({ workspaces, activeId, onSelect, onSettingsClick, onCreateClick }) => {
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, behavior: "smooth" });
    }
  }, [activeId]);

  return (
  <div
    className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 overflow-x-auto snap-x scrollbar-hide"
    ref={containerRef}
  >
    {/* Workspace Tabs */}
    <div className="flex items-center gap-2">
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          onClick={() => onSelect(ws.id)}
          className={clsx(
            "snap-start whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
            activeId === ws.id
              ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-sm"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          )}
        >
          {ws.name}
        </button>
      ))}

      {/* Add Workspace Button */}
      <button
        onClick={onCreateClick}
        className="w-6 h-6 rounded-full bg-gray-700 hover:bg-purple-600 text-white flex items-center justify-center"
        title="Create new workspace"
      >
        <Plus size={16} />
      </button>
    </div>

    {/* Settings Icon on Far Right */}
    <div className="ml-auto">
      <button
        onClick={onSettingsClick}
        className="text-gray-400 hover:text-gray-200"
        title="Workspace Settings"
      >
        <Settings size={18} />
      </button>
    </div>
  </div>
);
};

export default WorkspaceTabs;
