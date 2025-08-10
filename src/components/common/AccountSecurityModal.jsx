import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AccountSecurityModal({ open, onClose }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  if (!open) return null;

  const save = async () => {
    setLoading(true);
    setMsg("");
    const { error } = await supabase.rpc("set_user_vault_code", { p_code: code.trim() });
    if (error) setMsg(error.message);
    else setMsg("Vault Code saved.");
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 grid place-items-center bg-black/40 z-50">
      <div className="bg-white rounded-xl p-4 w-full max-w-sm">
        <h3 className="font-semibold mb-2">Set / Change Vault Code</h3>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="New Vault Code"
          disabled={loading}
        />
        {msg && <p className="text-xs mt-2">{msg}</p>}
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="border rounded px-3 py-1.5 text-sm" disabled={loading}>
            Close
          </button>
          <button onClick={save} className="bg-purple-600 text-white rounded px-3 py-1.5 text-sm" disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
