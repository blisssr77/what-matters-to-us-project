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
import { usePrivateSpaceStore } from "@/hooks/usePrivateSpaceStore";

export default function PrivateSpaceSettingsModal({
  open,
  onClose,
  // Optional overrides so parent can control these if prefer:
  spaceName: spaceNameProp,
  setSpaceName: setSpaceNameProp,
  onVerifyVaultCode, // optional override; if absent we call RPC verify_user_private_code
  onDeleted,         // callback after successful delete
  onRenamed,         // callback after successful rename
}) {
  const activeSpaceId = usePrivateSpaceStore((s) => s.activeSpaceId);

  const [tab, setTab] = useState("general");
  const [spaceName, setSpaceName] = useState(spaceNameProp || "");
  const [loading, setLoading] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [renameSuccess, setRenameSuccess] = useState("");

  // Delete flow
  const [vaultCode, setVaultCode] = useState("");
  const [verifyErr, setVerifyErr] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Keep local state in sync with external prop if provided
  useEffect(() => {
    if (typeof spaceNameProp === "string") setSpaceName(spaceNameProp);
  }, [spaceNameProp]);

  // Load current space name when modal opens / space changes
  useEffect(() => {
    if (!open || !activeSpaceId) return;
    (async () => {
      const { data, error } = await supabase
        .from("private_spaces")
        .select("name")
        .eq("id", activeSpaceId)
        .single();
      if (!error && data?.name && !spaceNameProp) {
        setSpaceName(data.name);
      }
    })();
  }, [open, activeSpaceId, spaceNameProp]);

  // Handle renaming the private space
  const handleRename = async () => {
    if (!activeSpaceId) return;
    const next = spaceName.trim();
    if (!next) {
        setRenameError("Name cannot be empty.");
        return;
    }
    setLoading(true);
    setRenameError("");
    setRenameSuccess("");

    const { error } = await supabase
        .from("private_spaces")
        .update({ name: next })
        .eq("id", activeSpaceId);

    setLoading(false);

    if (error) {
        setRenameError(error.message || "Failed to rename space.");
    } else {
        setRenameSuccess("Space name updated!");
        // close + refresh after a short delay to let the user see the success
        setTimeout(() => {
            onRenamed?.(activeSpaceId, spaceName);
            onClose?.();
        }, 700);
    }
  };

  // Verify the vault code
  const verifyCode = async (code) => {
    if (onVerifyVaultCode) {
      return await onVerifyVaultCode(code);
    }
    // default: verify the user's Private vault code via RPC
    const { data: ok, error } = await supabase.rpc("verify_user_private_code", {
      p_code: code,
    });
    if (error) return false;
    return !!ok;
  };

  const handleConfirmDelete = async () => {
    setVerifyErr("");
    const code = vaultCode.trim();
    if (!code) {
      setVerifyErr("Vault Code required.");
      return;
    }
    setVerifying(true);
    const ok = await verifyCode(code);
    setVerifying(false);
    if (!ok) {
      setVerifyErr("Incorrect Vault Code.");
      return;
    }
    // Delete the private space; FK on private_vault_items should cascade if set it earlier
    const { error } = await supabase
      .from("private_spaces")
      .delete()
      .eq("id", activeSpaceId);
    if (error) {
      setVerifyErr(error.message || "Failed to delete space.");
      return;
    }
    onDeleted?.(activeSpaceId);          
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl text-gray-800">
        <DialogHeader>
          <DialogTitle>Private Space Settings</DialogTitle>
          <DialogDescription>Rename this space or delete it.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="mt-4">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="danger">Danger Zone</TabsTrigger>
          </TabsList>

          {/* General */}
          <TabsContent value="general" className="space-y-4 mt-4">
            <label className="block text-sm font-medium">Space Name</label>
            <Input
              value={spaceName}
              onChange={(e) => {
                setRenameError("");
                setRenameSuccess("");
                setSpaceName(e.target.value);
              }}
              disabled={loading}
            />
            <div className="w-full flex justify-end">
                <Button className="btn-secondary" onClick={handleRename} disabled={loading}>
                    {loading ? "Renaming..." : "Rename Space"}
                </Button>
            </div>
            <div className="w-full text-right mt-2">
                {renameSuccess && <p className="text-sm text-green-600">{renameSuccess}</p>}
                {renameError && <p className="text-sm text-red-500">{renameError}</p>}
            </div>
          </TabsContent>

          {/* Danger Zone */}
          <TabsContent value="danger" className="space-y-4 mt-10">
            <div className="flex">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="ml-auto">
                    Delete This Private Space
                  </Button>
                </AlertDialogTrigger>

                <AlertDialogContent
                  overlayClassName="bg-transparent data-[state=open]:animate-none data-[state=closed]:animate-none"
                >
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-red-600">
                      Delete private space “{spaceName || "Untitled"}”?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This cannot be undone. All documents and notes in this space will be permanently removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-800 mb-1">
                      Enter your Private Vault Code to confirm
                    </label>
                    <input
                      type="password"
                      value={vaultCode}
                      onChange={(e) => setVaultCode(e.target.value)}
                      placeholder="Vault Code"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:ring-gray-500 text-gray-800"
                    />
                    {verifyErr && <p className="mt-2 text-xs text-red-600">{verifyErr}</p>}
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={verifying}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-60"
                      onClick={handleConfirmDelete}
                      disabled={!vaultCode || verifying}
                    >
                      {verifying ? "Verifying..." : "Confirm Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <p className="text-sm text-gray-500">
              Deleting a private space will also delete its items. This action is irreversible.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
