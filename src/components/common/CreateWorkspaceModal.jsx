// src/components/common/CreateWorkspaceModal.jsx
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { X } from "lucide-react";

export default function CreateWorkspaceModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [vaultCode, setVaultCode] = useState("");

  // Auto-clear success message after 3 seconds
  useEffect(() => {
      if (successMsg) {
        const t = setTimeout(() => setSuccessMsg(""), 3000);
        return () => clearTimeout(t);
      }
    }, [successMsg]);

    if (!open) return null;

    // Function to handle workspace creation
    const handleCreate = async () => {
      const trimmedName = name.trim();
      const trimmedCode = vaultCode.trim();

      if (!trimmedName) {
        setErrorMsg("Workspace name is required.");
        return;
      }
      if (!trimmedCode) {
        setErrorMsg("Vault Code is required for creation.");
        return;
      }

      setLoading(true);
      setErrorMsg("");
      setSuccessMsg("");

      try {
        // 0) must be logged in
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        if (userErr || !user) {
          setErrorMsg("You must be logged in.");
          return;
        }

        // 1) verify the user's account vault code (server-side, 1-arg RPC)
        const { data: ok, error: vErr } = await supabase.rpc("verify_user_vault_code", {
          p_code: trimmedCode,
        });
        if (vErr) {
          console.error("verify_user_vault_code error:", vErr);
          setErrorMsg("Failed to verify Vault Code. Please try again.");
          return;
        }
        if (!ok) {
          setErrorMsg("Vault Code does not match your account.");
          return;
        }

        // 2) create workspace
        const { data: ws, error: wsErr } = await supabase
          .from("workspaces")
          .insert({
            name: trimmedName,
            created_by: user.id,
            created_at: new Date().toISOString(),
          })
          .select("id, name")
          .single();

        if (wsErr || !ws) {
          setErrorMsg(wsErr?.message || "Failed to create workspace.");
          return;
        }

        // 3) add creator as owner
        const { error: memErr } = await supabase.from("workspace_members").insert({
          workspace_id: ws.id,
          user_id: user.id,
          role: "owner",
          invited_by_name: null,
          is_admin: true,
          created_at: new Date().toISOString(),
        });
        if (memErr) {
          console.error("Failed to insert workspace_members:", memErr);
          // continue; read access still OK via created_by policy
        }

        // 4) set the workspace's own code (hashing done in RPC)
        const { error: codeErr } = await supabase.rpc("set_workspace_vault_code", {
          p_workspace_id: ws.id,
          p_code: trimmedCode,
        });
        if (codeErr) {
          console.error("set_workspace_vault_code error:", codeErr);
        }

        setSuccessMsg("✅ Workspace created successfully!");
        onCreated?.(ws);
        setName("");
        setVaultCode("");
        onClose();
      } catch (e) {
        console.error(e);
        setErrorMsg(e.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Create New Workspace</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Workspace name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Sales Team, Credential Docs for Client"
            className="w-full text-gray-800 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:ring-gray-500"
          />

          {errorMsg && <p className="mt-2 text-xs text-red-600">{errorMsg}</p>}
          {successMsg && <p className="mt-2 text-xs text-green-600">{successMsg}</p>}
        </div>

        {/* Vault Code field */}
        <div className="px-4 py-3">
          <label className="block text-sm font-medium text-gray-700 mt-3 mb-1">
            Enter your Workspace Vault Code to confirm
          </label>
          <input
            type="password"
            value={vaultCode}
            onChange={(e) => setVaultCode(e.target.value)}
            placeholder="Vault Code"
            className="text-gray-800 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:ring-gray-500"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="text-sm btn-secondary"
            disabled={loading}
          >
            {loading ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
