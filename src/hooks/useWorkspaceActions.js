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

  // Function to delete the workspace
  // This function should handle deleting the workspace and its related data
  const handleDeleteWorkspace = async () => {
    if (!activeWorkspaceId) return;
    setWorkspaceActionLoading(true);
    setWorkspaceActionErrorMsg("");
    setWorkspaceActionSuccessMsg("");

    try {
      // If you have FK CASCADE on child tables, you can just:
      // const { error: wsErr } = await supabase.from("workspaces").delete().eq("id", activeWorkspaceId);
      // if (wsErr) throw wsErr;

      // Otherwise, delete child rows first:
      const { error: itemsErr } = await supabase
        .from("workspace_vault_items")
        .delete()
        .eq("workspace_id", activeWorkspaceId);
      if (itemsErr) throw itemsErr;

      const { error: membersErr } = await supabase
        .from("workspace_members")
        .delete()
        .eq("workspace_id", activeWorkspaceId);
      if (membersErr) throw membersErr;

      const { error: wsErr } = await supabase
        .from("workspaces")
        .delete()
        .eq("id", activeWorkspaceId);
      if (wsErr) throw wsErr;

      setWorkspaceActionSuccessMsg("Workspace deleted.");
      return true;
    } catch (err) {
      setWorkspaceActionErrorMsg(err.message || "Failed to delete workspace.");
      return false;
    } finally {
      setWorkspaceActionLoading(false);
    }
  };

  return {
    workspaceActionLoading,
    workspaceActionErrorMsg,
    workspaceActionSuccessMsg,
    handleRename,
    handleRoleChange,
    handleDeleteWorkspace,
  };
};
