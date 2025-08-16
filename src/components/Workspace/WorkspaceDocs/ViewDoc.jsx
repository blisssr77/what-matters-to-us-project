import React from "react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptFile, decryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { X, Copy, Edit2, Trash2 } from "lucide-react";
import { saveAs } from "file-saver";
import bcrypt from "bcryptjs";
import { useWorkspaceStore } from "../../../hooks/useWorkspaceStore";

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

export default function WorkspaceViewDoc() {
  const navigate = useNavigate();
  const { id } = useParams();
  // Get active workspace ID from store
  const { activeWorkspaceId } = useWorkspaceStore();

  const [vaultCode, setVaultCode] = useState("");
  const [entered, setEntered] = useState(false);
  const [doc, setDoc] = useState(null);
  const [decryptedFiles, setDecryptedFiles] = useState([]);
  const [decryptedFileType, setDecryptedFileType] = useState("");
  const [decryptedBlob, setDecryptedBlob] = useState(null);
  const [decryptedNote, setDecryptedNote] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
  
  // Fetch document data on mount
  useEffect(() => {
    const fetchDoc = async () => {
      if (!id || !activeWorkspaceId) return;

      const { data, error } = await supabase
        .from("workspace_vault_items")
        .select("*")
        .eq("id", id)
        .eq("workspace_id", activeWorkspaceId) 
        .single();

      if (error) {
        setErrorMsg("Failed to load document.");
        console.error("Failed to fetch doc:", error);
      } else {
        setDoc(data);
      }
    };
    fetchDoc();
  }, [id, activeWorkspaceId]);

  // Handle vault code entry and decryption — supports optional explicitCode (from auto-fill)
  const handleDecrypt = async (explicitCode) => {
    if (!doc) return;
    if (!doc.is_vaulted) {            // non-vaulted: nothing to decrypt
      setEntered(true);
      return;
    }

    const candidate = (explicitCode ?? vaultCode);
    const code = String(candidate || "").trim();
    if (!code) {
      setErrorMsg("Please enter your Vault Code.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      // 1) Verify via RPC (safer than selecting vault_codes)
      const { data: ok, error: verifyError } = await supabase.rpc(
        "verify_user_private_code",
        { p_code: code }
      );
      if (verifyError) {
        setErrorMsg(verifyError.message || "Failed to verify Vault Code.");
        return;
      }
      if (!ok) {
        setErrorMsg("Incorrect Vault Code.");
        return;
      }

      // 2) Remember per-doc for 15 minutes (or clear)
      if (rememberCode) {
        setExpiringItem(storageKey, code, FIFTEEN_MIN);
      } else {
        removeExpiringItem(storageKey);
      }
      // Keep session copy for this tab
      sessionStorage.setItem("vaultCode", code);

      // 3) Decrypt private note (if present)
      if (doc.encrypted_note && doc.note_iv) {
        try {
          const note = await decryptText(doc.encrypted_note, doc.note_iv, code);
          setDecryptedNote(note);
        } catch (err) {
          console.error("Note decryption failed:", err);
          setErrorMsg("Decryption failed for the private note.");
        }
      } else {
        // If there’s nothing to decrypt, surface it but don’t block files
        // setErrorMsg("Nothing to decrypt for this document.");
      }

      // 4) Decrypt each file (vaulted bucket)
      const files = [];
      if (Array.isArray(doc.file_metas) && doc.file_metas.length) {
        for (const fileMeta of doc.file_metas) {
          const { url, iv, type, name, path } = fileMeta;
          try {
            const bucket = "workspace.vaulted";
            // Prefer stored path; fallback to deriving from the public URL
            let filePath = path;
            if (!filePath && url) {
              const urlObj = new URL(url);
              const prefix = `/storage/v1/object/public/${bucket}/`;
              filePath = urlObj.pathname.startsWith(prefix)
                ? urlObj.pathname.slice(prefix.length)
                : urlObj.pathname.replace(/^\/+/, "");
            }

            const { data, error } = await supabase.storage.from(bucket).download(filePath);
            if (error) throw error;

            const encryptedBuffer = await data.arrayBuffer();
            const blob = await decryptFile(encryptedBuffer, iv, code, type);
            const blobUrl = URL.createObjectURL(blob);

            files.push({ url: blobUrl, type: blob.type, name });
          } catch (err) {
            console.error(`Failed to decrypt file "${name}":`, err);
          }
        }
        setDecryptedFiles(files);
      }

      setEntered(true);
    } finally {
      setLoading(false);
    }
  };

  // Triggers decryption when vault code is entered
  useEffect(() => {
    if (entered && doc) {
      handleDecrypt();
    }
  }, [entered, doc, vaultCode]);


  // Handle delete confirmation
  const handleDeleteDoc = async () => {
    setShowDeleteConfirm(false);

    if (!doc) return;

    // Delete from storage if files exist
    if (doc.file_metas && doc.file_metas.length > 0) {
      const paths = doc.file_metas.map((meta) => meta.path);

      const { error: storageError } = await supabase.storage
        .from("workspace.vaulted")
        .remove(paths);

      if (storageError) {
        console.error("Error deleting from storage:", storageError);
      }
    }

    // Delete from DB
    const { error: dbError } = await supabase
      .from("workspace_vault_items")
      .delete()
      .eq("id", doc.id);

    if (dbError) {
      console.error("Error deleting from DB:", dbError);
    } else {
      navigate("/workspace/vaults");
    }
  };

  // Handle copy to clipboard
  const handleCopy = async () => {
    if (decryptedNote) {
      await navigator.clipboard.writeText(decryptedNote);
    }
  };

  // Render file viewer based on type
  const renderFileViewer = () => {
    if (!decryptedFiles?.length) return null;

    return decryptedFiles.map((file, i) => {
      const { url, type, name } = file;

      return (
        <div key={i} className="mb-6 mt-6 p-4 bg-gray-100 rounded shadow-sm border border-gray-200">
          {/* File name and Download button */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-gray-800">{name}</span>
            <a
              href={url}
              download={name}
              className="text-sm text-blue-600 hover:underline"
            >
              ⬇ Download
            </a>
          </div>

          {/* File Preview */}
          {type.startsWith("image/") && (
            <img src={url} alt={name} className="w-full max-w-3xl rounded shadow" />
          )}

          {type === "application/pdf" && (
            <iframe
              src={url}
              title={`PDF-${i}`}
              className="w-full h-[80vh] rounded border"
            />
          )}

          {["application/json", "text/csv"].includes(type) || type.includes("text") ? (
            <iframe
              src={url}
              title={`Text-${i}`}
              className="w-full h-[80vh] rounded border"
            />
          ) : null}

          {(type.includes("word") || type.includes("excel") || type.includes("powerpoint")) && (
            <iframe
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
              title={`Office-${i}`}
              className="w-full h-[80vh] rounded border"
            />
          )}

          {/* Fallback */}
          {!(
            type.startsWith("image/") ||
            type === "application/pdf" ||
            ["application/json", "text/csv"].includes(type) ||
            type.includes("text") ||
            type.includes("word") ||
            type.includes("excel") ||
            type.includes("powerpoint")
          ) && (
            <p className="text-sm text-gray-600">
              {name}: File type not supported for inline viewing.
            </p>
          )}
        </div>
      );
    });
  };


  return (
    <Layout>
      {/* Delete confirmation modal */}
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
          onClick={() => navigate("/workspace/vaults")}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {doc?.title && <h2 className="text-xl text-gray-800 font-bold mb-4">{doc.title}</h2>}
        <h2 className="text-sm mb-1 text-gray-700">Notes:</h2>
        {doc?.notes && <p className="text-sm text-gray-800 mb-4">{doc.notes}</p>}
        {/* Tags */}
        {doc?.tags?.length > 0 && (
          <div className="mb-4 text-sm text-gray-700">
            Tags:{" "}
            {doc.tags.map((tag, index) => (
              <React.Fragment key={tag}>
                <span className="bg-yellow-50 px-1 rounded">{tag}</span>
                {index < doc.tags.length - 1 && ", "}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Display decrypted note if available */}
        {entered && decryptedNote && (
          <>
            <div className="text-gray-700 mb-1 font-bold text-sm">Private note:</div>
            <div className="text-sm text-gray-900 bg-purple-50 border border-purple-200 rounded p-3 mb-4">
              {decryptedNote}
            </div>
          </>
        )}

        {doc?.file_metas?.length > 0 && (
          <ul className="text-sm text-blue-500 space-y-1 mb-3">
            {doc.file_metas.map((file, index) => (
              <li key={index}>📄 {file.name}</li>
            ))}
          </ul>
        )}

        {/* 🔐 Vaulted logic */}
        {doc?.is_vaulted ? (
          !entered ? (
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
              {/* Action buttons */}
              <div className="flex gap-4 text-sm mb-4">
                <button onClick={handleCopy} className="flex items-center gap-1 text-purple-600 hover:underline">
                  <Copy size={16} /> Copy
                </button>
                <button onClick={() => navigate(`/workspace/vaults/doc-edit/${id}`)} className="flex items-center gap-1 text-blue-600 hover:underline">
                  <Edit2 size={16} /> Edit
                </button>
                <button onClick={() => setShowConfirmPopup(true)} className="flex items-center gap-1 text-red-600 hover:underline">
                  <Trash2 size={16} /> Delete
                </button>
              </div>

              {/* File viewer + Download */}
              {renderFileViewer()}
              {decryptedBlob && (
                <button
                  onClick={() => {
                    const extension = mimeToExtension[decryptedFileType] || "";
                    const fallbackName = doc?.title?.replace(/\s+/g, "_").toLowerCase() || "document";
                    const filename = fallbackName + extension;
                    saveAs(decryptedBlob, filename);
                  }}
                  className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  ⬇️ Download File
                </button>
              )}

              <div className="mt-4 text-xs text-gray-400">
                Last viewed just now · Private log only. Team audit history coming soon.
              </div>
            </>
          )
        ) : (
          // 🌐 Public document
          <>
            {renderFileViewer()}

            {/* Tags */}
            {/* {doc?.tags?.length > 0 && (
              <div className="mb-4 text-sm text-gray-700">
                Tags:{" "}
                {doc.tags.map((tag, index) => (
                  <React.Fragment key={tag}>
                    <span className="bg-yellow-50 px-1 rounded">{tag}</span>
                    {index < doc.tags.length - 1 && ", "}
                  </React.Fragment>
                ))}
              </div>
            )} */}

            {/* Public controls */}
            <div className="flex gap-4 text-sm mb-4">
              <button onClick={() => navigate(`/workspace/vaults/doc-edit/${id}`)} className="flex items-center gap-1 text-blue-600 hover:underline">
                <Edit2 size={16} /> Edit
              </button>
              <button onClick={() => setShowConfirmPopup(true)} className="flex items-center gap-1 text-red-600 hover:underline">
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
