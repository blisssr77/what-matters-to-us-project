import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent } from "@/components/ui/alert-dialog";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

export default function WorkspaceSettingsModal({
  open,
  onClose,
  userRole,
  workspaceName,
  setWorkspaceName,
  handleRename,
  errorMsg,
  loading,
  members,
  handleRoleChange,
}) {
  const { activeWorkspaceId, activeWorkspaceName, setActiveWorkspaceName } = useWorkspaceStore();
  const [activeTab, setActiveTab] = useState(userRole === "admin" || userRole === "owner" ? "general" : "members");

  // Fetch members if modal is opened
  useEffect(() => {
    if (open && activeWorkspaceId) {
      fetchMembers();
    }
  }, [open, activeWorkspaceId]);

  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("id, role, invited_by_name, profiles!workspace_members_user_id_fkey(username)")
      .eq("workspace_id", activeWorkspaceId);

    if (error) {
      console.error("❌ Failed to fetch members:", error);
    } else {
      // if members are only stored in parent component, remove this line
      // otherwise, you'd need to lift state up and sync
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Workspace Settings</DialogTitle>
        </DialogHeader>

        {/* Tabs for different settings */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-3">
            {(userRole === "admin" || userRole === "owner") && (
              <TabsTrigger value="general">General</TabsTrigger>
            )}
            <TabsTrigger value="members">Members</TabsTrigger>
            {(userRole === "admin" || userRole === "owner") && (
              <TabsTrigger value="danger">Danger Zone</TabsTrigger>
            )}
          </TabsList>

          {/* General Tab */}
          {(userRole === "admin" || userRole === "owner") && (
            <TabsContent value="general" className="space-y-4 mt-4">
              <label className="block text-sm font-medium">Workspace Name</label>
              <Input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                disabled={loading}
              />
              <Button onClick={handleRename} disabled={loading}>
                Rename Workspace
              </Button>
              {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
            </TabsContent>
          )}

          {/* Members Tab */}
          <TabsContent value="members" className="space-y-3 mt-4">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between border px-3 py-2 rounded-md"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    {m.profiles?.username || "Unknown User"}
                  </p>
                  <p className="text-xs text-gray-500">Invited by {m.invited_by_name}</p>
                </div>

                {/* Role management */}
                {m.role === "owner" ? (
                  <span className="text-sm font-semibold text-gray-700 px-3 py-1 border border-gray-300 rounded">
                    Owner
                  </span>
                ) : (
                  (userRole === "admin" || userRole === "owner") ? (
                    <select
                      value={m.role || "member"}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      className="text-sm rounded border border-gray-300 px-2 py-1"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span className="text-sm text-gray-700 px-3 py-1 border border-gray-300 rounded">
                      {m.role}
                    </span>
                  )
                )}
              </div>
            ))}
          </TabsContent>

          {/* Danger Zone tab */}
          {(userRole === "admin" || userRole === "owner") && (
            <TabsContent value="danger" className="space-y-4 mt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Delete This Workspace</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <p className="text-red-600 font-semibold">
                    ⚠️ Are you sure you want to delete this workspace?
                  </p>
                  <Button variant="destructive" className="mt-4">
                    Confirm Delete
                  </Button>
                </AlertDialogContent>
              </AlertDialog>
              <p className="text-sm text-gray-500">
                This action is irreversible and will permanently remove all data associated with this workspace.
              </p>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}