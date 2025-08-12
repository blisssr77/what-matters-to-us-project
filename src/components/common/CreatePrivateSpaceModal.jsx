import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { X } from "lucide-react";

export default function CreatePrivateSpaceModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [vaultCode, setVaultCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Auto-clear success message after 3s
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(""), 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  if (!open) return null;

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedCode = vaultCode.trim();

    if (!trimmedName) {
      setErrorMsg("Private space name is required.");
      return;
    }
    if (!trimmedCode) {
      setErrorMsg("Private vault code is required.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      // 0) must be logged in
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        setErrorMsg("You must be logged in.");
        return;
      }

      // 1) verify user's *Private* vault code (server-side)
      const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
        p_code: trimmedCode,
      });
      if (vErr) {
        console.error("verify_user_private_code error:", vErr);
        setErrorMsg("Failed to verify Private vault code. Please try again.");
        return;
      }
      if (!ok) {
        setErrorMsg("Private vault code does not match your account.");
        return;
      }

      // 2) create private space
      const { data: ps, error: psErr } = await supabase
        .from("private_spaces")
        .insert({
          name: trimmedName,
          created_by: user.id,
          created_at: new Date().toISOString(),
        })
        .select("id, name")
        .single();

      if (psErr || !ps) {
        setErrorMsg(psErr?.message || "Failed to create private space.");
        return;
      }

      setSuccessMsg("✅ Private space created successfully!");
      onCreated?.(ps);
      setName("");
      setVaultCode("");
      onClose(); // if you want to show the success in the modal, delay closing
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
          <h2 className="text-base font-semibold text-gray-900">Create New Private Space</h2>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Private space name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrorMsg(""); }}
            placeholder="e.g., Personal Docs, Research Notes"
            className="w-full text-gray-800 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-0"
          />

          {errorMsg && <p className="mt-2 text-xs text-red-600">{errorMsg}</p>}
          {successMsg && <p className="mt-2 text-xs text-green-600">{successMsg}</p>}
        </div>

        {/* Private Vault Code */}
        <div className="px-4 pb-2">
          <label className="block text-sm font-medium text-gray-700 mt-3 mb-1">
            Enter your <strong>Private</strong> vault code to confirm
          </label>
          <input
            type="password"
            value={vaultCode}
            onChange={(e) => { setVaultCode(e.target.value); setErrorMsg(""); }}
            placeholder="Private vault code"
            className="text-gray-800 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-0"
            autoComplete="current-password"
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
