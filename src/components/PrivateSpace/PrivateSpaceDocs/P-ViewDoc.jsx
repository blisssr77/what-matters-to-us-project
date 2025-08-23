import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { decryptFile, decryptText } from "@/lib/encryption";
import Layout from "@/components/Layout/Layout";
import { X, Copy, Edit2, Trash2 } from "lucide-react";
import { usePrivateSpaceStore } from "@/hooks/usePrivateSpaceStore";
import { usePrivateSpaceActions } from "@/hooks/usePrivateSpaceActions";

const mimeToExtension = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

export default function PrivateViewDoc() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [vaultCode, setVaultCode] = useState("");
  const [entered, setEntered] = useState(false);
  const [doc, setDoc] = useState(null);

  const [decryptedFiles, setDecryptedFiles] = useState([]);
  const [decryptedFileType, setDecryptedFileType] = useState("");
  const [decryptedBlob, setDecryptedBlob] = useState(null);
  const [decryptedNote, setDecryptedNote] = useState(null);

  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);

  // remember-opt-in
  const [codeEntered, setCodeEntered] = useState(false);
  const [rememberCode, setRememberCode] = useState(false);
  // per-user namespacing (safer if multiple accounts use same browser)
  const [storageKey, setStorageKey] = useState("pv_vault_code:anon");

  // 15-minute TTL in ms
  const FIFTEEN_MIN = 15 * 60 * 1000;

  // per-item cached code helpers
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

  // --- end expiring storage helpers ---
  useEffect(() => {
    (async () => {
      const { data: { user } = {} } = await supabase.auth.getUser();
      const userId = user?.id ?? "anon";
      setStorageKey(`pv_vault_code:${userId}:doc:${id}`);
    })();
  }, [id]);

  // Auto-fill vault code if previously remembered
  useEffect(() => {
      (async () => {
        if (!doc?.is_vaulted) return;

        const { data: { user } = {} } = await supabase.auth.getUser();
        const userId = user?.id ?? "anon";
        const userKey = `pv_vault_code:${userId}:doc:${id}`;
        const anonKey = `pv_vault_code:anon:doc:${id}`;

        let remembered = getExpiringItem(userKey) || getExpiringItem(anonKey);
        if (!remembered || codeEntered) return;

        // optional: migrate anon → user key
        if (!getExpiringItem(userKey)) setExpiringItem(userKey, remembered, FIFTEEN_MIN);

        setVaultCode(remembered);
        await handleDecrypt(remembered);
    })();
  }, [doc, storageKey]); // eslint-disable-line

  // Fetch the document
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("private_vault_items")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        setErrorMsg("Failed to load document.");
        console.error("❌ Failed to fetch doc:", error);
      } else {
        setDoc(data);
        // If not vaulted, we can display immediately (no code needed)
        if (data && !data.is_vaulted) {
          const files = (data.file_metas || []).map((fm) => ({
            url: fm.url, // public bucket files can use url directly
            type: fm.type,
            name: fm.name,
          }));
          setDecryptedFiles(files);
          setEntered(true);
        }
      }
    })();
  }, [id]);

  // Decrypt (vaulted) — supports optional explicitCode (from auto-fill) and 15-min remember
  const handleDecrypt = async (explicitCode) => {
    if (!doc || !doc.is_vaulted) return; // non-vaulted doesn't need this

    const candidate = (explicitCode ?? vaultCode);
    if (typeof candidate !== "string" || !candidate.trim()) {
      setErrorMsg("Please enter your Vault Code.");
      return;
    }
    const code = candidate.trim();

    setLoading(true);
    setErrorMsg("");

    try {
      // 1) Verify user private code (RPC)
      const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
        p_code: code,
      });
      if (vErr) {
        setErrorMsg(vErr.message || "Failed to verify Vault Code.");
        return;
      }
      if (!ok) {
        setErrorMsg("Incorrect Vault Code.");
        return;
      }

      // 2) Remember or clear per-doc code (15 minutes)
      const { data: { user } = {} } = await supabase.auth.getUser();
      const userId = user?.id ?? "anon";
      const effectiveKey = `pv_vault_code:${userId}:doc:${id}`;

      // if explicitCode is provided, this call came from auto-fill (storage)
      const cameFromStorage = typeof explicitCode === "string";

      if (rememberCode || cameFromStorage) {
        // refresh TTL or set fresh
        setExpiringItem(effectiveKey, code, FIFTEEN_MIN);
      } else {
        removeExpiringItem(effectiveKey);
      }

      // Keep session copy for this tab
      sessionStorage.setItem("vaultCode", code);

      // 3) Decrypt private note (if present)
      if (doc.encrypted_note && doc.note_iv) {
        try {
          const note = await decryptText(doc.encrypted_note, doc.note_iv, code);
          setDecryptedNote(note);
        } catch (err) {
          console.error("❌ Note decryption failed:", err);
          setErrorMsg("Decryption failed for the private note.");
        }
      }

      // 4) Decrypt each file from private.vaulted using stored path
      const files = [];
      if (Array.isArray(doc.file_metas) && doc.file_metas.length) {
        for (const fm of doc.file_metas) {
          try {
            const bucket = "private.vaulted";
            const { data, error } = await supabase.storage.from(bucket).download(fm.path);
            if (error) throw error;

            const encryptedBuffer = await data.arrayBuffer();
            const blob = await decryptFile(encryptedBuffer, fm.iv, code, fm.type);
            const blobUrl = URL.createObjectURL(blob);

            files.push({ url: blobUrl, type: blob.type, name: fm.name });

            // keep first file handy for "Download" button
            if (!decryptedBlob) {
              setDecryptedBlob(blob);
              setDecryptedFileType(blob.type);
            }
          } catch (err) {
            console.error(`❌ Failed to decrypt file "${fm.name}":`, err);
          }
        }
      }

      setDecryptedFiles(files);
      setEntered(true);
    } finally {
      setLoading(false);
    }
  };

  // Delete
  const handleDeleteDoc = async () => {
    setShowConfirmPopup(false);
    if (!doc) return;

    // Delete storage objects from the proper bucket
    if (doc.file_metas && doc.file_metas.length > 0) {
      const bucket = doc.is_vaulted ? "private.vaulted" : "private.public";
      const paths = doc.file_metas.map((m) => m.path);
      const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
      if (storageError) console.error("❌ Error deleting from storage:", storageError);
    }

    // Delete DB row
    const { error: dbError } = await supabase
      .from("private_vault_items")
      .delete()
      .eq("id", doc.id);

    if (dbError) {
      console.error("❌ Error deleting from DB:", dbError);
    } else {
      navigate("/privatespace/vaults");
    }
  };

  const handleCopy = async () => {
    if (decryptedNote) await navigator.clipboard.writeText(decryptedNote);
  };

  // Render file viewer (works for both decrypted (vaulted) and public files)
  const renderFileViewer = () =>
    (decryptedFiles || []).map((file, i) => {
      const { url, type, name } = file;

      const isOffice =
        type.includes("word") || type.includes("excel") || type.includes("powerpoint");
      const isTextish =
        ["application/json", "text/csv"].includes(type) || type.includes("text");

      return (
        <div key={i} className="mb-6 mt-6 p-4 bg-gray-100 rounded shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-gray-800">{name}</span>
            <a href={url} download={name} className="text-sm text-blue-600 hover:underline">
              ⬇ Download
            </a>
          </div>

          {type.startsWith("image/") && (
            <img src={url} alt={name} className="w-full max-w-3xl rounded shadow" />
          )}

          {type === "application/pdf" && (
            <iframe src={url} title={`PDF-${i}`} className="w-full h-[80vh] rounded border" />
          )}

          {isTextish && (
            <iframe src={url} title={`Text-${i}`} className="w-full h-[80vh] rounded border" />
          )}

          {isOffice && (
            <iframe
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
              title={`Office-${i}`}
              className="w-full h-[80vh] rounded border"
            />
          )}

          {!(
            type.startsWith("image/") ||
            type === "application/pdf" ||
            isTextish ||
            isOffice
          ) && <p className="text-sm text-gray-600">{name}: File type not supported for inline viewing.</p>}
        </div>
      );
    });

  return (
    <Layout>
      {/* Delete confirmation */}
      {showConfirmPopup && (
        <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
          <p className="mt-10 text-gray-900">
            Are you sure you want to delete {doc?.title || "this document"}?
            <br />
            This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={async () => {
                await handleDeleteDoc();
                setShowConfirmPopup(false);
              }}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setShowConfirmPopup(false)}
              className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="relative max-w-4xl mx-auto p-6 mt-10 bg-white rounded shadow border border-gray-200">
        <button
          onClick={() => navigate("/privatespace/vaults")}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {doc?.title && <h2 className="text-xl text-gray-800 font-bold mb-4">{doc.title}</h2>}
        <h2 className="text-sm mb-1 text-gray-700">Notes:</h2>
        {doc?.notes && <p className="text-sm text-gray-800 mb-4">{doc.notes}</p>}

        {/* Decrypted private note */}
        {entered && decryptedNote && (
          <div className="text-sm text-gray-900 bg-purple-50 border border-purple-200 rounded p-3 mb-4">
            {decryptedNote}
          </div>
        )}

        {/* File list (names) */}
        {doc?.file_metas?.length > 0 && (
          <ul className="text-sm text-blue-500 space-y-1 mb-3">
            {doc.file_metas.map((file, index) => (
              <li key={index}>📄 {file.name}</li>
            ))}
          </ul>
        )}

        {/* Vault code prompt (only for vaulted docs) */}
        {doc?.is_vaulted && !entered ? (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Enter Vault Code to Decrypt Document:
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
            
            {errorMsg && <p className="text-sm text-red-600 mt-2">{errorMsg}</p>}
          </div>
        ) : loading ? (
          <p className="text-sm text-gray-500">🔐 Decrypting document...</p>
        ) : (
          <>
            {/* Tags */}
            {doc?.tags?.length > 0 && (
              <div className="mb-4 text-sm text-gray-700">
                Tags:{" "}
                {doc.tags.map((tag, i) => (
                  <React.Fragment key={tag}>
                    <span className="bg-yellow-50 px-1 rounded">{tag}</span>
                    {i < doc.tags.length - 1 && ", "}
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4 text-sm mb-4">
              {decryptedNote && (
                <button onClick={handleCopy} className="flex items-center gap-1 text-purple-600 hover:underline">
                  <Copy size={16} /> Copy
                </button>
              )}
              <button
                onClick={() => navigate(`/privatespace/vaults/doc-edit/${id}`)}
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <Edit2 size={16} /> Edit
              </button>
              <button
                onClick={() => setShowConfirmPopup(true)}
                className="flex items-center gap-1 text-red-600 hover:underline"
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>

            {/* Viewer */}
            {renderFileViewer()}

            {/* Single-blob download helper */}
            {/* {decryptedBlob && (
              <button
                onClick={() => {
                  const ext = mimeToExtension[decryptedFileType] || "";
                  const fallback = (doc?.title || "document").replace(/\s+/g, "_").toLowerCase();
                  saveAs(decryptedBlob, fallback + ext);
                }}
                className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                ⬇️ Download File
              </button>
            )} */}

            <div className="mt-4 text-xs text-gray-400">
              Last viewed just now · Private log only. Team audit history coming soon.
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
