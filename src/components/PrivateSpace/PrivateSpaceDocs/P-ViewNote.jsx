import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { X, Copy, Edit2, Trash2 } from "lucide-react";
import dayjs from "dayjs";

export default function PrivateViewNote() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [vaultCode, setVaultCode] = useState(sessionStorage.getItem("vaultCode") || "");
  const [noteData, setNoteData] = useState(null);
  const [decryptedNote, setDecryptedNote] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeEntered, setCodeEntered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load note
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("private_vault_items")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching note:", error);
      } else {
        setNoteData(data);
      }
    })();
  }, [id]);

  // If we already have a code in session and note is vaulted, try decrypt automatically
  useEffect(() => {
    if (!noteData) return;
    const isVaulted = !!noteData.is_vaulted;
    if (isVaulted && vaultCode && !codeEntered) {
      handleDecrypt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteData]);

  const handleDecrypt = async () => {
    if (!noteData || !noteData.is_vaulted) {
      // non-vaulted: nothing to decrypt; just mark as "entered" so UI shows details
      setDecryptedNote("");
      setCodeEntered(true);
      return;
    }

    const code = vaultCode.trim();
    if (!code) {
      setErrorMsg("Please enter your Vault Code.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    // Verify user private code via RPC
    const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
      p_code: code,
    });
    if (vErr) {
      setErrorMsg(vErr.message || "Failed to verify Vault Code.");
      setLoading(false);
      return;
    }
    if (!ok) {
      setErrorMsg("Incorrect Vault Code.");
      setLoading(false);
      return;
    }

    // If there is no encrypted note content, bail early with a friendly message
    if (!noteData.note_iv || !noteData.encrypted_note) {
      setErrorMsg("This note has no encrypted content to decrypt.");
      setCodeEntered(true);
      setLoading(false);
      return;
    }

    try {
      const ivToUse = noteData.note_iv || noteData.iv; // optional fallback
      const decrypted = await decryptText(noteData.encrypted_note, ivToUse, code);
      setDecryptedNote(decrypted || ""); // allow empty-string content
      sessionStorage.setItem("vaultCode", code);
      setCodeEntered(true);
    } catch (err) {
      console.error("❌ Decryption failed:", err);
      setErrorMsg("Decryption failed. Please confirm your code and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (decryptedNote) {
      await navigator.clipboard.writeText(decryptedNote);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    await supabase.from("private_vault_items").delete().eq("id", id);
    navigate("/privatespace/vaults");
  };

  const isVaulted = !!noteData?.is_vaulted;

  return (
    <Layout>
      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
          <p className="mt-10 text-gray-800">
            Are you sure you want to delete <strong>{noteData?.title || "this note"}</strong>?
          </p>
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={handleDelete}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
        <button
          onClick={() => navigate("/privatespace/vaults")}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-bold mb-5 text-gray-900">🔒 View Note</h2>
        {noteData?.title && <h3 className="text-md text-gray-800 font-semibold mb-3">{noteData.title}</h3>}
        {noteData?.notes && <p className="text-sm text-gray-700 mb-4">{noteData.notes}</p>}

        {/* If not vaulted, show content without requiring code */}
        {!isVaulted ? (
          <>
            {/* Tags */}
            {noteData?.tags?.length > 0 && (
              <div className="mb-3 text-sm text-gray-900 font-medium">
                Tags:{" "}
                {noteData.tags.map((tag, index) => (
                  <React.Fragment key={tag}>
                    <span className="bg-yellow-50 px-1 rounded">{tag}</span>
                    {index < noteData.tags.length - 1 && ", "}
                  </React.Fragment>
                ))}
              </div>
            )}

            <div className="mb-1 text-xs text-gray-400">
                Created: {noteData?.created_at ? dayjs(noteData.created_at).format("MMM D, YYYY h:mm A") : "—"}
            </div>
            <div className="mb-3 text-xs text-gray-400">
                Updated: {noteData?.updated_at ? dayjs(noteData.updated_at).format("MMM D, YYYY h:mm A") : "—"}
            </div>

            <div className="flex gap-4 text-sm">
              <button
                onClick={() => navigate(`/privatespace/vaults/note-edit/${id}`)}
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <Edit2 size={16} /> Edit
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1 text-red-600 hover:underline"
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>

            <div className="mt-4 text-xs text-gray-400">
              Last viewed just now · Private log only. Team audit history coming soon.
            </div>
          </>
        ) : (
          // Vaulted flow (needs code to decrypt)
          <>
            {!codeEntered ? (
              <>
                <label className="block text-sm font-medium mb-1 mt-6 text-gray-600">
                  Enter <strong>Private</strong> Vault Code to Decrypt Note:
                </label>
                <input
                  type="password"
                  value={vaultCode}
                  onChange={(e) => {
                    const newCode = e.target.value;
                    setVaultCode(newCode);
                    sessionStorage.setItem("vaultCode", newCode);
                  }}
                  className="w-full p-2 border rounded mb-3 text-gray-600 text-sm"
                  placeholder="Vault Code"
                  autoComplete="current-password"
                />
                <button onClick={handleDecrypt} disabled={loading} className="btn-secondary">
                  {loading ? "Decrypting..." : "Decrypt"}
                </button>
                {errorMsg && <p className="text-sm text-red-500 mt-2">{errorMsg}</p>}
              </>
            ) : (
              <>
                {/* Tags */}
                {noteData?.tags?.length > 0 && (
                  <div className="mb-3 text-sm text-gray-900 font-medium">
                    Tags:{" "}
                    {noteData.tags.map((tag, index) => (
                      <React.Fragment key={tag}>
                        <span className="bg-yellow-50 px-1 rounded">{tag}</span>
                        {index < noteData.tags.length - 1 && ", "}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                <div className="mb-1 text-xs text-gray-400">
                  Created: {dayjs(noteData.created_at).format("MMM D, YYYY h:mm A")}
                </div>
                <div className="mb-3 text-xs text-gray-400">
                  Updated: {dayjs(noteData.updated_at).format("MMM D, YYYY h:mm A")}
                </div>

                <div className="text-gray-900 mb-1 text-sm font-medium">Private note:</div>
                <div className="text-sm text-gray-900 bg-purple-50 border border-purple-200 rounded p-3 mb-4">
                  {decryptedNote !== "" ? decryptedNote : "⚠️ Decryption returned nothing."}
                </div>

                <div className="flex gap-4 text-sm">
                  <button onClick={async () => { if (decryptedNote) await navigator.clipboard.writeText(decryptedNote); }} className="flex items-center gap-1 text-purple-600 hover:underline">
                    <Copy size={16} /> Copy
                  </button>
                  <button onClick={() => navigate(`/privatespace/vaults/note-edit/${id}`)} className="flex items-center gap-1 text-blue-600 hover:underline">
                    <Edit2 size={16} /> Edit
                  </button>
                  <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-1 text-red-600 hover:underline">
                    <Trash2 size={16} /> Delete
                  </button>
                </div>

                <div className="mt-4 text-xs text-gray-400">
                  Last viewed just now · Private log only. Team audit history coming soon.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
