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

  // Effect to reset success message after a delay
  useEffect(() => {
    if (!workspaceActionSuccessMsg) return;
    const t = setTimeout(() => {
      setWorkspaceActionSuccessMsg("");
      // refresh after success
      window.location.reload();
    }, 3000);
    return () => clearTimeout(t);
  }, [workspaceActionSuccessMsg, shouldRefresh]);

  // Function to rename the workspace
  const handleRename = async () => {
    if (!activeWorkspaceId) {
      setWorkspaceActionErrorMsg("No active workspace.");
      return;
    }
    const next = (workspaceName || "").trim();
    if (!next) {
      setWorkspaceActionErrorMsg("Name cannot be empty.");
      return;
    }

    setWorkspaceActionLoading(true);
    setWorkspaceActionErrorMsg("");
    setWorkspaceActionSuccessMsg("");

    const { error } = await supabase
      .from("workspaces")
      .update({ name: next })
      .eq("id", activeWorkspaceId);

    if (error) {
      console.error("Rename failed:", error);
      setWorkspaceActionErrorMsg(error.message || "❌ Failed to rename workspace");
    } else {
      setWorkspaceActionSuccessMsg(" Workspace renamed successfully");
      // optional: window.location.reload();
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
  const handleDeleteWorkspace = async () => {
    if (!activeWorkspaceId) return;
    setWorkspaceActionLoading(true);
    setWorkspaceActionErrorMsg("");
    setWorkspaceActionSuccessMsg("");

    try {
      // If you have FK CASCADE on child tables, just:
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
