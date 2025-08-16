import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import Layout from "@/components/Layout/Layout";
import { X, Search, Loader2 } from "lucide-react";
import { encryptFile, encryptText, decryptText } from "@/lib/encryption";
import { UnsavedChangesModal } from "@/components/common/UnsavedChangesModal";

export default function PrivateEditDoc() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [files, setFiles] = useState([]);
  const [existingFiles, setExistingFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [vaultCode, setVaultCode] = useState("");
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [fileToDeleteIndex, setFileToDeleteIndex] = useState(null);
  const [filesToRemove, setFilesToRemove] = useState([]); // paths (preferred) or URLs (fallback)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);
  const [isVaulted, setIsVaulted] = useState(false);
  const [activeSpaceId, setActiveSpaceId] = useState(null);

  // Allowed MIME types
  const allowedMimes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "image/jpeg",
    "image/png",
    "image/gif",
    "application/zip",
    "application/json",
  ];

  // Messages timeout
  useEffect(() => {
    if (successMsg || errorMsg) {
      const t = setTimeout(() => {
        setSuccessMsg("");
        setErrorMsg("");
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [successMsg, errorMsg]);

  // Load doc + tags
  useEffect(() => {
    (async () => {
      // Document
      const { data, error } = await supabase
        .from("private_vault_items")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        setErrorMsg("Failed to load document.");
        console.error("❌ Failed to fetch doc:", error);
        return;
      }

      setTitle(data.title || "");
      setTags(data.tags || []);
      setNotes(data.notes || "");
      setExistingFiles(Array.isArray(data.file_metas) ? data.file_metas : []);
      setIsVaulted(!!data.is_vaulted);
      setActiveSpaceId(data.private_space_id || null);

      // Try to auto-decrypt existing private note if session has a code
      const storedVaultCode = sessionStorage.getItem("vaultCode")?.trim();
      if (data.encrypted_note && data.note_iv && storedVaultCode) {
        try {
          const decrypted = await decryptText(data.encrypted_note, data.note_iv, storedVaultCode);
          setPrivateNote(decrypted);
        } catch (err) {
          console.error("Failed to decrypt note:", err);
          setPrivateNote("🔐 Encrypted");
        }
      } else {
        setPrivateNote(""); // no encrypted note
      }

      // Tags for this private space (fallback to user-level)
      if (data.private_space_id) {
        const { data: t1, error: e1 } = await supabase
          .from("vault_tags")
          .select("name")
          .eq("section", "Private")
          .eq("private_space_id", data.private_space_id);

        if (!e1 && Array.isArray(t1)) {
          setAvailableTags(t1.map((r) => r.name));
        } else {
          const { data: userData } = await supabase.auth.getUser();
          const uid = userData?.user?.id || null;
          if (uid) {
            const { data: t2 } = await supabase
              .from("vault_tags")
              .select("name")
              .eq("section", "Private")
              .eq("user_id", uid);
            setAvailableTags(Array.isArray(t2) ? t2.map((r) => r.name) : []);
          } else {
            setAvailableTags([]);
          }
        }
      } else {
        setAvailableTags([]);
      }
    })();
  }, [id]);

  // DnD
  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => {
      const unique = dropped.filter(
        (f) => !prev.some((pf) => pf.name === f.name && pf.size === f.size)
      );
      return [...prev, ...unique];
    });
  };

  // Add tag
  const handleTagAdd = async () => {
    if (!newTag.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return;

    // insert if missing in DB (space-scoped, fallback user-scoped)
    if (!availableTags.includes(newTag)) {
      let ins = await supabase.from("vault_tags").insert({
        name: newTag.trim(),
        section: "Private",
        user_id: user.id,
        private_space_id: activeSpaceId || null,
      });

      if (ins.error && /column .*private_space_id/i.test(ins.error.message)) {
        ins = await supabase.from("vault_tags").insert({
          name: newTag.trim(),
          section: "Private",
          user_id: user.id,
        });
      }
      if (!ins.error) setAvailableTags((p) => [...p, newTag.trim()]);
    }

    if (!tags.includes(newTag)) setTags((p) => [...p, newTag.trim()]);
    setNewTag("");
  };

  // Mark existing file for deletion (store path if available, else URL)
  const handleRemoveExistingFile = (index) => {
    const f = existingFiles[index];
    if (!f) return;

    const token = f.path || f.url || null;
    if (token) setFilesToRemove((prev) => [...prev, token]);

    // remove from UI list
    setExistingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Helpers: derive path from a public URL if needed
  const parsePathFromUrl = (url) => {
    try {
      const u = new URL(url);
      // works for public URLs like /storage/v1/object/public/<bucket>/<path>
      const parts = u.pathname.split("/storage/v1/object/public/")[1];
      if (!parts) return null;
      const [_bucket, ...rest] = parts.split("/");
      return rest.join("/");
    } catch {
      return null;
    }
  };

  // Submit update
  const handleUpload = async (e) => {
    e.preventDefault();
    setUploading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const nothingToUpdate =
      files.length === 0 &&
      filesToRemove.length === 0 &&
      !title &&
      !(tags?.length) &&
      !notes &&
      (!privateNote || privateNote === "🔐 Encrypted");

    if (nothingToUpdate) {
      setUploading(false);
      setErrorMsg("⚠️ Nothing to update.");
      return;
    }

    const invalid = files.filter((f) => !allowedMimes.includes(f.type));
    if (invalid.length) {
      setUploading(false);
      setErrorMsg("One or more files have unsupported types.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUploading(false);
      setErrorMsg("User not authenticated.");
      return;
    }

    // If this doc is vaulted, require a correct private code to encrypt new content
    if (isVaulted) {
      if (!vaultCode.trim()) {
        setUploading(false);
        setErrorMsg("Please enter your Vault Code to encrypt the document.");
        return;
      }
      const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
        p_code: vaultCode.trim(),
      });
      if (vErr) {
        setUploading(false);
        setErrorMsg(vErr.message || "Failed to verify Vault Code.");
        return;
      }
      if (!ok) {
        setUploading(false);
        setErrorMsg("Incorrect Vault Code.");
        return;
      }
    }

    // Delete marked files from the correct bucket
    const bucketForExisting = isVaulted ? "private.vaulted" : "private.public";
    const filePathsToDelete = [];

    for (const token of filesToRemove) {
      if (!token) continue;
      if (token.includes("/storage/v1/object/public/")) {
        const p = parsePathFromUrl(token);
        if (p) filePathsToDelete.push(p);
      } else {
        // already a path
        filePathsToDelete.push(token);
      }
    }

    if (filePathsToDelete.length) {
      const { error: delErr } = await supabase.storage
        .from(bucketForExisting)
        .remove(filePathsToDelete);
      if (delErr) {
        console.error("Storage deletion error:", delErr);
        setErrorMsg("Failed to delete one or more files from storage.");
      }
    }

    // Keep remaining metas (exclude removed)
    let updatedFileMetas = existingFiles.filter((f) => {
      const token = f.path || f.url;
      if (!token) return true;
      if (token.includes("/storage/v1/object/public/")) {
        const p = parsePathFromUrl(token);
        return !filePathsToDelete.includes(p);
      }
      return !filePathsToDelete.includes(token);
    });

    // Upload any newly added files
    let noteIv = "";
    for (const file of files) {
      const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
      const filePath = `${activeSpaceId}/${Date.now()}-${sanitizedName}`;
      const bucket = isVaulted ? "private.vaulted" : "private.public";

      let ivHex = "";
      let uploadErr;

      if (isVaulted) {
        const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
        const { encryptedBlob, ivHex: hex } = await encryptFile(file, vaultCode.trim(), ivBytes);
        ivHex = hex;

        ({ error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(filePath, encryptedBlob, {
            contentType: file.type,
            upsert: false,
          }));
      } else {
        ({ error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(filePath, file, {
            contentType: file.type,
            upsert: false,
            metadata: { user_id: user.id, private_space_id: activeSpaceId },
          }));
      }

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
        if (urlData?.publicUrl) {
          updatedFileMetas.push({
            name: file.name,
            url: urlData.publicUrl,
            iv: isVaulted ? ivHex : "",
            type: file.type,
            path: filePath,
            user_id: user.id,
            private_space_id: activeSpaceId,
          });
        }
      } else {
        console.error("Upload failed:", uploadErr);
      }
    }

    // Encrypt private note if changed (only when vaulted)
    let encryptedNote = "";
    if (isVaulted && privateNote && privateNote !== "🔐 Encrypted") {
      try {
        const res = await encryptText(privateNote, vaultCode.trim());
        encryptedNote = res.encryptedData;
        noteIv = res.iv;
      } catch (err) {
        console.error(err);
        setUploading(false);
        setErrorMsg("Failed to encrypt private note.");
        return;
      }
    }

    // Update DB
    const { error: updateError } = await supabase
      .from("private_vault_items")
      .update({
        title,
        tags,
        notes,
        encrypted_note: isVaulted ? (encryptedNote || undefined) : null,
        note_iv: isVaulted ? (noteIv || (privateNote ? undefined : null)) : null,
        file_metas: updatedFileMetas,
      })
      .eq("id", id);

    if (updateError) {
      console.error(updateError);
      setErrorMsg("Failed to update document.");
    } else {
      setSuccessMsg("Document updated successfully!");
      setFilesToRemove([]);
      setHasUnsavedChanges(false);
      setTimeout(() => navigate("/privatespace/vaults"), 1300);
    }

    setUploading(false);
    setHasUnsavedChanges(false);
  };

  return (
    <Layout>
      {/* Confirm remove existing file */}
      {showConfirmPopup && fileToDeleteIndex !== null && (
        <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
          <p className="mt-10 text-gray-800">
            Are you sure you want to delete {existingFiles[fileToDeleteIndex]?.name}?
            <br />
            This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={async () => {
                await handleRemoveExistingFile(fileToDeleteIndex);
                setShowConfirmPopup(false);
                setFileToDeleteIndex(null);
              }}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Yes, Delete
            </button>
            <button
              onClick={() => {
                setShowConfirmPopup(false);
                setFileToDeleteIndex(null);
              }}
              className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Unsaved changes */}
      <UnsavedChangesModal
        show={showUnsavedPopup}
        onCancel={() => setShowUnsavedPopup(false)}
        redirectPath="/privatespace/vaults"
        message="You have unsaved changes. Are you sure you want to leave?"
      />

      <div className="relative max-w-xl mx-auto mt-10 p-6 bg-white rounded shadow border border-gray-200">
        <button
          onClick={() => {
            if (hasUnsavedChanges) setShowUnsavedPopup(true);
            else navigate("/privatespace/vaults");
          }}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          ${title || "Untitled Document"}
        </h2>
        <p className="text-xs text-blue-700 mt-1">
          Supported: PDF, Word, Excel, PowerPoint, Text, CSV, JPG, PNG, GIF, ZIP, JSON
        </p>

        <form onSubmit={handleUpload} className="space-y-5">
          {/* Drag & Drop */}
          <div
            onDrop={handleFileDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            className={`w-full h-32 border-2 border-dashed rounded-lg flex items-center justify-center text-gray-500 cursor-pointer ${
              dragging ? "border-purple-500 bg-purple-50" : "border-gray-300"
            }`}
          >
            {files.length > 0 ? (
              <ul className="text-sm space-y-1">
                {files.map((file, idx) => <li key={idx}>{file.name}</li>)}
              </ul>
            ) : (
              <span className="text-sm">Drag & Drop new file(s) here or browse below</span>
            )}
          </div>

          {/* File input */}
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.json"
            onChange={(e) => {
              const selected = Array.from(e.target.files);
              setFiles((prev) => [...prev, ...selected]);
              setHasUnsavedChanges(true);
            }}
            className="w-full border border-gray-300 p-2 rounded text-gray-500 text-sm"
          />

          {/* Existing Files */}
          {existingFiles.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Previously uploaded files:</h4>
              <ul className="space-y-1">
                {existingFiles.map((file, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded text-sm text-gray-800 bg-gray-50"
                  >
                    {file.name}
                    <button
                      type="button"
                      onClick={() => {
                        setFileToDeleteIndex(index);
                        setShowConfirmPopup(true);
                        setHasUnsavedChanges(true);
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* New Files */}
          {files.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-blue-800 mb-1">Newly selected files:</h4>
              <ul className="space-y-1">
                {files.map((file, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded text-sm text-blue-600 bg-gray-50"
                  >
                    {file.name}
                    <button
                      type="button"
                      onClick={() => {
                        setFiles((prev) => prev.filter((_, i) => i !== index));
                        setHasUnsavedChanges(true);
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-800 mt-4">Edit title:</label>
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setHasUnsavedChanges(true); }}
              className="w-full p-2 mb-1 border rounded text-gray-700 text-sm bg-gray-50 font-medium placeholder-gray-400"
              placeholder="Enter document title (Public)"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium text-gray-800 mb-1 block">Edit tags:</label>
            <div className="relative flex items-center gap-2 mb-1 text-sm">
              <Search className="absolute left-3 text-gray-400" size={16} />
              <input
                type="text"
                value={newTag}
                onChange={(e) => { setNewTag(e.target.value); setHasUnsavedChanges(true); }}
                placeholder="Search existing tags or create new"
                className="w-full pl-8 border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400"
              />
              <button type="button" onClick={handleTagAdd} className="btn-secondary text-sm">
                Create
              </button>
            </div>

            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
              {availableTags
                .filter((tag) => (!newTag || tag.toLowerCase().includes(newTag.toLowerCase())) && !tags.includes(tag))
                .map((tag) => (
                  <div key={tag} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={tags.includes(tag)}
                      onChange={() => {
                        setTags((prev) =>
                          prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                        );
                        setHasUnsavedChanges(true);
                      }}
                    />
                    <span className="text-xs text-gray-700">{tag}</span>
                  </div>
                ))}
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-yellow-50 text-gray-800 text-xs px-3 py-1 rounded-full font-medium flex items-center gap-1"
                  >
                    {tag}
                    <X
                      size={12}
                      className="cursor-pointer"
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                    />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Public Notes */}
          <div>
            <label className="text-sm font-medium text-gray-800 mb-1 block">Edit public note:</label>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setHasUnsavedChanges(true); }}
              placeholder="Public notes (Visible to shared contacts)"
              rows={2}
              className="w-full border bg-gray-50 border-gray-300 p-2 rounded font-medium text-gray-800 placeholder-gray-400 text-sm"
            />
          </div>

          {/* Private note + code (only when vaulted) */}
          {isVaulted && (
            <>
              <div>
                <p className="text-sm text-red-400 mb-1">
                  🔐 Private note will be encrypted using your Private vault code:
                </p>
                <textarea
                  value={privateNote}
                  onChange={(e) => { setPrivateNote(e.target.value); setHasUnsavedChanges(true); }}
                  placeholder="Private notes (For your eyes only)"
                  rows={2}
                  className="bg-gray-50 w-full border border-gray-300 p-2 rounded text-gray-800 font-medium placeholder-gray-400 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-800">
                  Re-enter Private vault code to encrypt:
                </label>
                <input
                  type="password"
                  value={vaultCode}
                  onChange={(e) => setVaultCode(e.target.value)}
                  className="w-full p-2 border font-medium rounded mb-3 text-gray-600 text-sm bg-gray-50"
                  placeholder="Vault code"
                  autoComplete="current-password"
                />
              </div>
            </>
          )}

          {/* Submit */}
          <button type="submit" disabled={uploading} className="btn-secondary w-full">
            {uploading ? (
              <span className="flex justify-center items-center gap-2">
                <Loader2 className="animate-spin" size={16} /> Updating...
              </span>
            ) : (
              "Update Document"
            )}
          </button>

          <br />
          {successMsg && <p className="text-sm text-green-600 text-center">{successMsg}</p>}
          {errorMsg && <p className="text-sm text-red-600 text-center">{errorMsg}</p>}
        </form>
      </div>
    </Layout>
  );
}
