import React from "react";
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText } from "../../../lib/encryption";
import { useWorkspaceStore } from "../../../hooks/useWorkspaceStore";
import Layout from "../../Layout/Layout";
import { X, Copy, Edit2, Trash2 } from "lucide-react";
import dayjs from "dayjs";
import bcrypt from "bcryptjs";

export default function WorkspaceViewNote() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspaceStore();

  const [vaultCode, setVaultCode] = useState("");
  const [noteData, setNoteData] = useState(null);
  const [decryptedNote, setDecryptedNote] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isVaulted, setIsVaulted] = useState(false);

  // same flags as ViewDoc
  const [codeEntered, setCodeEntered] = useState(false);
  const [rememberCode, setRememberCode] = useState(false);

  // per-user, per-item storage key (note)
  const [storageKey, setStorageKey] = useState("ws_vault_code:anon");
  const FIFTEEN_MIN = 15 * 60 * 1000;

  // expiring storage helpers — identical to ViewDoc
  const setExpiringItem = (key, value, ttlMs) => {
    const payload = { v: String(value), e: Date.now() + ttlMs };
    localStorage.setItem(key, JSON.stringify(payload));
  };
  const getExpiringItem = (key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const { v, e } = JSON.parse(raw);
      if (!e || Date.now() > e) {
        localStorage.removeItem(key);
        return null;
      }
      return v;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  };
  const removeExpiringItem = (key) => localStorage.removeItem(key);

  // reset UI flags when switching notes (like ViewDoc does for docs)
  useEffect(() => {
    setCodeEntered(false);
    setDecryptedNote("");
    setErrorMsg("");
    setVaultCode("");
  }, [id]);

  // set per-user storage key (NOTE not DOC)
  useEffect(() => {
    (async () => {
      const { data: { user } = {} } = await supabase.auth.getUser();
      const userId = user?.id ?? "anon";
      setStorageKey(`ws_vault_code:${userId}:note:${id}`);
    })();
  }, [id]);

  // DO NOT prefill or auto-decrypt. Unlike ViewDoc, we skip the auto-fill effect entirely.

  // Fetch the note
  useEffect(() => {
    (async () => {
      if (!id || !activeWorkspaceId) return;

      const { data, error } = await supabase
        .from("workspace_vault_items")
        .select("*")
        .eq("id", id)
        .eq("workspace_id", activeWorkspaceId)
        .single();

      if (error) {
        console.error("❌ Failed to fetch note:", error);
        setErrorMsg("Note not found or access denied.");
      } else {
        setNoteData(data);
        if (data && !data.is_vaulted) {
          // not vaulted → show immediately (like ViewDoc does for non-vaulted docs)
          setDecryptedNote(data.notes || "");
          setCodeEntered(true);
        }
      }
    })();
  }, [id, activeWorkspaceId]);

  // Decrypt (same pattern as ViewDoc; optional explicit code param kept for parity)
  const handleDecrypt = async (explicitCode, isFromRememberedStorage = false) => {
    if (!noteData) return;
    if (!noteData.is_vaulted) { setCodeEntered(true); return; }

    const candidate = explicitCode ?? vaultCode;
    const code = String(candidate || "").trim();
    if (!code) { setErrorMsg("Please enter your Vault Code."); return; }

    setLoading(true);
    setErrorMsg("");

    try {
      // 1) verify code against workspace code RPC (same as ViewDoc)
      const { data: ok, error: verifyErr } = await supabase.rpc(
        "verify_workspace_code",
        { p_workspace: activeWorkspaceId, p_code: code }
      );
      if (verifyErr) {
        setErrorMsg(verifyErr.message || "Failed to verify Vault Code.");
        return;
      }
      if (!ok) {
        setErrorMsg("Incorrect Vault Code.");
        return;
      }

      // 2) remember 15m logic (identical pattern)
      const { data: { user } = {} } = await supabase.auth.getUser();
      const userId = user?.id ?? "anon";
      const effectiveKey = `ws_vault_code:${userId}:note:${id}`;
      const alreadyRemembered = !!getExpiringItem(effectiveKey);

      if (isFromRememberedStorage) {
        setExpiringItem(effectiveKey, code, FIFTEEN_MIN);
      } else if (rememberCode) {
        setExpiringItem(effectiveKey, code, FIFTEEN_MIN);
      } else if (alreadyRemembered) {
        setExpiringItem(effectiveKey, code, FIFTEEN_MIN);
      } else {
        removeExpiringItem(effectiveKey);
      }

      sessionStorage.setItem("vaultCode", code);

      // 3) decrypt note text — single call, with defensive checks
      const ivToUse = noteData?.note_iv || noteData?.iv;
      if (!ivToUse || !noteData?.encrypted_note) {
        console.debug("Nothing to decrypt. note_iv:", noteData?.note_iv, "iv:", noteData?.iv, "enc:", !!noteData?.encrypted_note);
        setErrorMsg("This note has no encrypted content to decrypt.");
        setCodeEntered(true);
        return;
      }

      try {
        const plaintext = await decryptText(noteData.encrypted_note, ivToUse, code);
        setDecryptedNote(plaintext || "");
      } catch (decErr) {
        // AES-GCM OperationError → wrong key/iv/ciphertext
        console.error("❌ Note decryption failed:", decErr, {
          ivLen: typeof ivToUse === "string" ? ivToUse.length : "n/a",
          hasCipher: !!noteData.encrypted_note
        });
        setErrorMsg("Decryption failed for the private note.");
        return;
      }

      setCodeEntered(true);
    } finally {
      setLoading(false);
    }
  };

    // Handle copy to clipboard
    const handleCopy = () => {
        try {
            navigator.clipboard.writeText(decryptedNote);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    // Handle delete confirmation
    const handleDelete = async () => {
        setShowDeleteConfirm(false);
        await supabase.from("workspace_vault_items").delete().eq("id", id);
        navigate("/workspace/vaults");
    };

  return (
    <Layout>
      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
          <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
              <p className="mt-10 text-gray-800">
              Are you sure you want to delete {noteData?.title || "this note"}?
              </p>
              <div className="flex gap-3 justify-end mt-4">
              <button
                  onClick={async () => {
                  await handleDelete();
                  setShowDeleteConfirm(false);
                  }}
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
              onClick={() => navigate("/workspace/vaults")}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
              aria-label="Close"
          >
              <X size={20} />
          </button>

          {noteData?.title && <h2 className="text-xl text-gray-800 font-bold mb-4">{noteData.title}</h2>}
          <h2 className="text-sm mb-1 text-gray-700">Notes:</h2>
          {noteData?.notes && <p className="text-sm text-gray-800 mb-4">{noteData.notes}</p>}
          {/* Display tags content */}
          {Array.isArray(noteData?.tags) && noteData.tags.length > 0 && (
              <div className="mb-3 text-sm text-gray-700 font-medium">
                  Tags:{" "}
                  {noteData.tags.map((tag, index) => (
                  <React.Fragment key={tag}>
                      <span className="bg-yellow-50 px-1 rounded font-extralight">{tag}</span>
                      {index < noteData.tags.length - 1 && ", "}
                  </React.Fragment>
                  ))}
              </div>
          )}

          <div>
          {noteData?.is_vaulted && !codeEntered ? (
              <>
                  <label className="block text-sm font-medium mb-1 mt-6 text-gray-600">
                  Enter Private Vault Code to Decrypt Note:
                  </label>
                  {/* Vault code input */}
                  <div className="mt-2 flex items-center gap-3">
                      <input
                          type="password"
                          value={vaultCode}
                          onChange={(e) => setVaultCode(e.target.value)}
                          className="w-full p-2 border rounded text-sm text-gray-700"
                          placeholder="Vault Code"
                          autoComplete="current-password"
                      />
                      {/* Remember option for 15 minutes */}
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                          <input
                          type="checkbox"
                          checked={rememberCode}
                          onChange={(e) => setRememberCode(e.target.checked)}
                          />
                          Remember code for 15 min
                      </label>
                      <button onClick={() => handleDecrypt()} disabled={loading} className="btn-secondary text-sm">
                          {loading ? "Decrypting..." : "Decrypt"}
                      </button>
                  </div>

                  {errorMsg && <p className="text-sm text-red-500 mt-2">{errorMsg}</p>}
              </>
          ) : (
              <>
              {noteData?.created_at && (
                  <div className="mb-1 text-xs text-gray-400">
                      Created: {dayjs(noteData.created_at).format("MMM D, YYYY h:mm A")}
                  </div>
              )}
              {noteData?.updated_at && (
                  <div className="mb-3 text-xs text-gray-400">
                      Updated: {dayjs(noteData.updated_at).format("MMM D, YYYY h:mm A")}
                  </div>
              )}

              {isVaulted && (
                  <>
                  {/* Display decrypted note content */}
                  {codeEntered && noteData && (
                      <>
                          <div className="text-gray-900 mb-1 text-sm font-medium">Private note:</div>
                          <div className="text-sm text-gray-900 bg-purple-50 border border-purple-200 rounded p-3 mb-4">
                              {noteData.is_vaulted ? decryptedNote : "⚠️ Decryption returned nothing."}
                          </div>
                      </>
                  )}
                  </>
              )}

              {/* Action buttons */}
              <div className="flex gap-4 text-sm">
                  <button
                      onClick={handleCopy}
                      className="flex items-center gap-1 text-purple-600 hover:underline"
                  >
                      <Copy size={16} />
                      Copy
                  </button>
                  <button
                      onClick={() => navigate(`/workspace/vaults/note-edit/${id}`)}
                      className="flex items-center gap-1 text-blue-600 hover:underline"
                  >
                      <Edit2 size={16} />
                      Edit
                  </button>
                  <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-1 text-red-600 hover:underline"
                  >
                      <Trash2 size={16} />
                      Delete
                  </button>
              </div>

              <div className="mt-4 text-xs text-gray-400">
                  Last viewed just now · Private log only. Team audit history coming soon.
              </div>
              </>
          )}
          </div>

      </div>
    </Layout>
  );
}