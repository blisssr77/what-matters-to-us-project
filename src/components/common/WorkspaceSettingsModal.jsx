import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

export default function WorkspaceSettingsModal({ open, onClose }) {
  const { activeWorkspaceId, activeWorkspaceName, setActiveWorkspaceName } = useWorkspaceStore();
  const [workspaceName, setWorkspaceName] = useState(activeWorkspaceName);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (open && activeWorkspaceId) {
      fetchMembers();
    }
  }, [open, activeWorkspaceId]);

  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("id, role, invited_by_name, profiles!fk_workspace_members_user(username)")
      .eq("workspace_id", activeWorkspaceId);

    if (error) {
      console.error("❌ Failed to fetch members:", error);
    } else {
      setMembers(data);
    }
  };

  const handleRename = async () => {
    setLoading(true);
    const { error } = await supabase
      .from("workspaces")
      .update({ name: workspaceName })
      .eq("id", activeWorkspaceId);

    if (error) {
      setErrorMsg("❌ Failed to rename workspace");
    } else {
      setActiveWorkspaceName(workspaceName);
    }
    setLoading(false);
  };

  const handleRoleChange = async (memberId, newRole) => {
    const { error } = await supabase
      .from("workspace_members")
      .update({ role: newRole })
      .eq("id", memberId);

    if (error) {
      console.error("❌ Failed to update role:", error);
    } else {
      fetchMembers();
    }
  };

  const handleRemoveMember = async (memberId) => {
    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      console.error("❌ Failed to remove member:", error);
    } else {
      fetchMembers();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Workspace Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Workspace Name */}
          <div>
            <label className="block mb-1 text-sm font-medium">Workspace Name</label>
            <Input
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              disabled={loading}
            />
            <Button className="mt-2" onClick={handleRename} disabled={loading}>
              Rename Workspace
            </Button>
          </div>

          {/* Members Table */}
          <div>
            <label className="block mb-2 text-sm font-medium">Members</label>
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.id} className="flex justify-between items-center">
                  <span>{member.profiles?.username || "(unknown)"}</span>
                  <div className="flex gap-2">
                    <select
                      value={member.role || "member"}
                      onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}

          {/* Coming Soon */}
          <div className="text-sm text-gray-500 pt-4 border-t">
            🔐 Vault Code management, 📨 Notification toggles, and 🧨 Delete workspace coming soon.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
