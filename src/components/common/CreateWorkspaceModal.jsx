// src/components/common/CreateWorkspaceModal.jsx
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { X } from "lucide-react";

export default function CreateWorkspaceModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Auto-clear success message after 3 seconds
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  if (!open) return null;

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg("Workspace name is required.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      setErrorMsg("You must be logged in.");
      setLoading(false);
      return;
    }

    // 1) create workspace
    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .insert({ name: trimmed, role: "owner", created_by: user.id, created_at: new Date().toISOString() })
      .select()
      .single();

    if (wsErr || !ws) {
      setErrorMsg(wsErr?.message || "Failed to create workspace.");
      setLoading(false);
      return;
    }

    // 2) add creator as owner member so it shows up in the tabs query
    const { error: memErr } = await supabase
      .from("workspace_members")
      .insert({
        workspace_id: ws.id,
        user_id: user.id,
        role: "owner",
        invited_by_name: null,
        is_admin: true,
        created_at: new Date().toISOString(),
      });

    if (memErr) {
      // roll forward but inform
      console.error("Failed to insert workspace_members:", memErr);
    }

    // Show success
    setSuccessMsg("✅ Workspace created successfully!");

    onCreated?.(ws);
    setLoading(false);
    setName("");
    onClose();
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
            className="w-full text-gray-800 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
          />

          {errorMsg && <p className="mt-2 text-xs text-red-600">{errorMsg}</p>}
          {successMsg && <p className="mt-2 text-xs text-green-600">{successMsg}</p>}
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
