import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient" 

export const useWorkspaceActions = ({
  activeWorkspaceId,
  workspaceName,
  setWorkspaceName,
  setMembers,
}) => {
  const [workspaceActionLoading, setWorkspaceActionLoading] = useState(false);
  const [workspaceActionErrorMsg, setWorkspaceActionErrorMsg] = useState("");
  const [workspaceActionSuccessMsg, setWorkspaceActionSuccessMsg] = useState("");
  const [shouldRefresh, setShouldRefresh] = useState(false);

  // Effect to reset success message after a delay and refresh if needed
  useEffect(() => {
    if (!workspaceActionSuccessMsg) return;
    const t = setTimeout(() => {
      setWorkspaceActionSuccessMsg("");
      if (shouldRefresh) {
        window.location.reload();
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [workspaceActionSuccessMsg, shouldRefresh]);

  // Function to rename the workspace
  const handleRename = async () => {
    setWorkspaceActionLoading(true);
    setWorkspaceActionErrorMsg("");
    setShouldRefresh(false); // reset before action

    const { error } = await supabase
      .from("workspaces")
      .update({ name: workspaceName })
      .eq("id", activeWorkspaceId);

    if (error) {
      setWorkspaceActionErrorMsg("❌ Failed to rename workspace");
    } else {
      setWorkspaceActionSuccessMsg("✅ Workspace renamed successfully");
      setShouldRefresh(true); // trigger refresh after success
    }

    setWorkspaceActionLoading(false);
  };

  // Function to change member roles
  const handleRoleChange = async (memberId, newRole) => {
    const { error } = await supabase
      .from("workspace_members")
      .update({ role: newRole })
      .eq("id", memberId);

    if (!error && setMembers) {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
    }
  };

  return {
    workspaceActionLoading,
    workspaceActionErrorMsg,
    workspaceActionSuccessMsg,
    handleRename,
    handleRoleChange,
  };
};
