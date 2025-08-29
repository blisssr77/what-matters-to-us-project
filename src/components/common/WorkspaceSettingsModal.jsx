import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useWorkspaceStore } from "@/hooks/useWorkspaceStore";

export default function WorkspaceSettingsModal({
  open,
  onClose,
  userRole,
  workspaceName,
  setWorkspaceName,
  handleRename,
  errorMsg,
  successMsg,
  loading,
  members,
  setMembers,
  handleRoleChange,
  onDelete,
  onVerifyVaultCode,
}) {
  const { activeWorkspaceId } = useWorkspaceStore();
  const [activeTab, setActiveTab] = useState(userRole === "admin" || userRole === "owner" ? "general" : "members");
  const [vaultCode, setVaultCode] = React.useState("");
  const [verifyErr, setVerifyErr] = React.useState("");
  const [verifying, setVerifying] = React.useState(false);

  // Fetch members if modal is opened
  useEffect(() => {
    if (open && activeWorkspaceId) {
      fetchMembers();
    }
  }, [open, activeWorkspaceId]);

  // Fetch members from the database
  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from("workspace_members")
      .select(`
        id,
        role,
        invited_by_name,
        profiles!workspace_members_user_id_fkey(username),
        workspaces!inner(name)
      `)
      .eq("workspace_id", activeWorkspaceId);

    if (error) {
      console.error("❌ Failed to fetch members:", error);
    } else {
      if (data.length > 0) {
        setWorkspaceName(data[0].workspaces.name); // ✅ Set workspace name for modal
      }
      setMembers(data);
    }
  };

  // Handle workspace deletion confirmation
  const handleConfirmDelete = async () => {
    setVerifyErr("");
    if (!onVerifyVaultCode) {
      // Fail-safe: if no verifier provided, block
      setVerifyErr("Vault Code verification is unavailable.");
      return;
    }
    setVerifying(true);
    const ok = await onVerifyVaultCode(vaultCode);
    setVerifying(false);
    if (!ok) {
      setVerifyErr("Incorrect Vault Code.");
      return;
    }
    await onDelete?.();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl text-gray-800">
        <DialogHeader>
          <DialogTitle>Workspace Settings</DialogTitle>
          <DialogDescription>
            Manage members, rename workspace, and adjust settings.
          </DialogDescription>
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
              <div className="w-full flex justify-end">
                <Button className="btn-secondary" onClick={handleRename} disabled={loading}>
                  {loading ? "Renaming..." : "Rename Workspace"}
                </Button>
              </div>
              <div className="w-full text-right mt-2">
                {successMsg && (
                  <p className="text-sm text-green-600">{successMsg}</p>
                )}
                {errorMsg && (
                  <p className="text-sm text-red-500">{errorMsg}</p>
                )}
              </div>
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
                  <span className="text-sm font-semibold text-gray-800 px-3 py-1 border border-gray-300 rounded">
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
                    <span className="text-sm text-gray-800 px-3 py-1 border border-gray-300 rounded">
                      {m.role}
                    </span>
                  )
                )}
              </div>
            ))}
          </TabsContent>

          {/* Danger Zone tab */}
          {(userRole === "admin" || userRole === "owner") && (
            <TabsContent value="danger" className="space-y-4 mt-10">
              {/* Right-align the trigger */}
              <div className="flex">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="ml-auto">
                      Delete This Workspace
                    </Button>
                  </AlertDialogTrigger>

                  {/* Final alert Dialog for deletion confirmation */}
                  <AlertDialogContent
                    overlayClassName="bg-transparent data-[state=open]:animate-none data-[state=closed]:animate-none"
                  >
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-red-600">
                        Delete workspace “{workspaceName || "Untitled"}”?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This action is irreversible and will permanently remove all data associated with this workspace.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    {/* Vault Code field */}
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-800 mb-1">
                        Enter Workspace Vault Code to confirm
                      </label>
                      <input
                        type="password"
                        value={vaultCode}
                        onChange={(e) => setVaultCode(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && vaultCode && !verifying) handleConfirmDelete();
                        }}
                        placeholder="Vault Code"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:ring-gray-500 text-gray-800"
                      />
                      {verifyErr && <p className="mt-2 text-xs text-red-600">{verifyErr}</p>}
                    </div>

                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={loading || verifying}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-60"
                        onClick={handleConfirmDelete}
                        disabled={!vaultCode || loading || verifying}
                      >
                        {verifying ? "Verifying..." : "Confirm Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

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