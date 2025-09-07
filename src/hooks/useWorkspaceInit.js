import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

// This hook initializes the workspace by fetching the active workspace ID
// when the user logs in or signs up, and sets it in the workspace store.
export const useWorkspaceInit = (userId) => {
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId);

  useEffect(() => {
    if (!userId) return;

    const init = async () => {
      const { data: memberRow, error } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .limit(1)
        .single();

      if (error) console.error("Error fetching workspace:", error);

      if (memberRow?.workspace_id) {
        setActiveWorkspaceId(memberRow.workspace_id);
        console.log("✅ Workspace ID set:", memberRow.workspace_id);
      }
    };

    init();
  }, [userId, setActiveWorkspaceId]);
};