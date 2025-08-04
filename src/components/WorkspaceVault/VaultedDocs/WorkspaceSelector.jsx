import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";

export default function WorkspaceSelector() {
  const [availableWorkspaces, setAvailableWorkspaces] = useState([]);
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();

  useEffect(() => {
    const fetchWorkspaces = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, role, workspaces ( id, name )") // ✅ role moved to top-level
        .eq("user_id", user.id);

      if (!error && data?.length > 0) {
        const workspaces = data
          .filter((entry) => entry.workspaces?.name)
          .map((entry) => ({
            id: entry.workspace_id,
            name: entry.workspaces.name,
            role: entry.role || "member" // ✅ now from workspace_members
          }));
        setAvailableWorkspaces(workspaces);
        console.log("Fetched workspace memberships:", data);
      }
    };

    fetchWorkspaces();
  }, []);

  const handleSelect = (id) => {
    setActiveWorkspaceId(id);
  };

  return (
    <div className="space-y-2">
      {availableWorkspaces.map((ws) => (
        <button
          key={ws.id}
          className={`px-4 py-2 w-full text-left rounded ${
            ws.id === activeWorkspaceId ? 'bg-blue-600 text-white' : 'bg-gray-100'
          }`}
          onClick={() => handleSelect(ws.id)}
        >
          {ws.name} {ws.role === "admin" && "(Admin)"}
        </button>
      ))}
    </div>
  );
}
