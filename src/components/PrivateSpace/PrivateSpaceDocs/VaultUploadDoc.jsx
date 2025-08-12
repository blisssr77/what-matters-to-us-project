import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { Loader2, X, Search } from "lucide-react";
import Layout from "@/components/Layout/Layout";
import { encryptText, encryptFile } from "@/lib/encryption";
import { UnsavedChangesModal } from "@/components/common/UnsavedChangesModal";

export default function PrivateUploadDoc() {
  const [files, setFiles] = useState([]);
  const [tags, setTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [vaultCode, setVaultCode] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);

  // Private space selection (local, no store)
  const [activeSpaceId, setActiveSpaceId] = useState(null);
  const [spaceName, setSpaceName] = useState("");

  // Default to encrypted uploads
  const [isVaulted, setIsVaulted] = useState(true);

  const navigate = useNavigate();

  // Allowed MIME types (align with your helper text)
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

  // 1) Pick an active private space (first one) for this user
  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from("private_spaces")
        .select("id, name")
        .eq("created_by", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Failed to fetch private spaces:", error);
        return;
      }

      const firstId = data?.[0]?.id ?? null;
      setActiveSpaceId(firstId);
      setSpaceName(data?.[0]?.name ?? "");
    })();
  }, []);

  // 2) Load active space name and available tags whenever activeSpaceId changes
  useEffect(() => {
    if (!activeSpaceId) {
      setSpaceName("");
      setAvailableTags([]);
      return;
    }

    (async () => {
      // fetch space name
      const { data: sData, error: sErr } = await supabase
        .from("private_spaces")
        .select("name")
        .eq("id", activeSpaceId)
        .single();
      setSpaceName(sErr ? "" : sData?.name ?? "");

      // fetch tags: try private_space_id (if your table has it), otherwise fallback to user + section
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      // attempt: scoped tags per space
      let tagsRes = await supabase
        .from("vault_tags")
        .select("name")
        .eq("section", "Private")
        .eq("private_space_id", activeSpaceId);

      if (tagsRes.error) {
        // fallback: user-level private tags
        tagsRes = await supabase
          .from("vault_tags")
          .select("name")
          .eq("section", "Private")
          .eq("user_id", userId);
      }

      if (!tagsRes.error && Array.isArray(tagsRes.data)) {
        setAvailableTags(tagsRes.data.map((t) => t.name));
      } else {
        setAvailableTags([]);
      }
    })();
  }, [activeSpaceId]);

  // Message timeout
  useEffect(() => {
    if (successMsg || errorMsg) {
      const t = setTimeout(() => {
        setSuccessMsg("");
        setErrorMsg("");
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [successMsg, errorMsg]);

  // DnD
  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles(dropped);
  };

  // Add a tag (space-scoped if column exists; otherwise user-scoped)
  const handleTagAdd = async () => {
    if (!newTag.trim() || !activeSpaceId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return;

    // avoid dup locally
    if (availableTags.includes(newTag)) {
      if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
      setNewTag("");
      return;
    }

    // Try insert with private_space_id
    let insertRes = await supabase.from("vault_tags").insert({
      name: newTag.trim(),
      section: "Private",
      user_id: user.id,
      private_space_id: activeSpaceId, // may not exist in your schema
    });

    if (insertRes.error && /column .*private_space_id/i.test(insertRes.error.message)) {
      // Fallback: no private_space_id column -> user-level
      insertRes = await supabase.from("vault_tags").insert({
        name: newTag.trim(),
        section: "Private",
        user_id: user.id,
      });
    }

    if (!insertRes.error) {
      setAvailableTags((prev) => [...prev, newTag.trim()]);
      if (!tags.includes(newTag.trim())) setTags((prev) => [...prev, newTag.trim()]);
      setNewTag("");
    }
  };

  // Upload
  const handleUpload = async (e) => {
    e.preventDefault();
    setUploading(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!activeSpaceId) {
      setUploading(false);
      setErrorMsg("No active private space selected.");
      return;
    }

    if (!files.length) {
      setUploading(false);
      setErrorMsg("⚠️ Please attach file(s) before uploading.");
      return;
    }

    const invalid = files.filter((f) => !allowedMimes.includes(f.type));
    if (invalid.length) {
      setUploading(false);
      setErrorMsg("One or more files have unsupported types.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      setUploading(false);
      setErrorMsg("User not authenticated.");
      return;
    }

    // Verify private code (server-side, hash)
    if (isVaulted) {
      if (!vaultCode.trim()) {
        setUploading(false);
        setErrorMsg("Please enter your Private vault code.");
        return;
      }
      const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
        p_code: vaultCode.trim(),
      });
      if (vErr) {
        setUploading(false);
        setErrorMsg(vErr.message || "Failed to verify Private vault code.");
        return;
      }
      if (!ok) {
        setUploading(false);
        setErrorMsg("Incorrect Private vault code.");
        return;
      }
    }

    const fileMetas = [];
    let uploadedCount = 0;
    let noteIv = "";
    let encryptedNote = "";

    // Encrypt note if needed
    if (isVaulted && privateNote) {
      try {
        const res = await encryptText(privateNote, vaultCode.trim());
        encryptedNote = res.encryptedData;
        noteIv = res.iv;
      } catch (err) {
        console.error("Note encryption failed:", err);
        setUploading(false);
        setErrorMsg("Failed to encrypt private note.");
        return;
      }
    }

    // Ensure tags exist (already added individually, but in case user typed then uploaded directly)
    for (const tag of tags) {
      if (!availableTags.includes(tag)) {
        // best-effort insert
        await supabase.from("vault_tags").insert({
          name: tag,
          section: "Private",
          user_id: userId,
          private_space_id: activeSpaceId,
        }).catch(async (e) => {
          if (/column .*private_space_id/i.test(e?.message || "")) {
            await supabase.from("vault_tags").insert({
              name: tag,
              section: "Private",
              user_id: userId,
            });
          }
        });
      }
    }

    // Upload files
    for (const file of files) {
      try {
        const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
        const filePath = `${activeSpaceId}/${Date.now()}-${sanitizedName}`;
        let ivHex = "";
        let uploadError, urlData;

        if (isVaulted) {
          const ivBytes = crypto.getRandomValues(new Uint8Array(12));
          const { encryptedBlob, ivHex: hex } = await encryptFile(file, vaultCode.trim(), ivBytes);
          ivHex = hex;

          ({ error: uploadError } = await supabase.storage
            .from("private.vaulted") // ensure bucket exists
            .upload(filePath, encryptedBlob, {
              contentType: file.type,
              upsert: false,
              metadata: { user_id: userId, private_space_id: activeSpaceId },
            }));

          ({ data: urlData } = supabase.storage
            .from("private.vaulted")
            .getPublicUrl(filePath));
        } else {
          ({ error: uploadError } = await supabase.storage
            .from("private.public")
            .upload(filePath, file, {
              contentType: file.type,
              upsert: false,
              metadata: { user_id: userId, private_space_id: activeSpaceId },
            }));

          ({ data: urlData } = supabase.storage
            .from("private.public")
            .getPublicUrl(filePath));
        }

        if (uploadError || !urlData?.publicUrl) {
          console.error("Upload failed:", uploadError);
          continue;
        }

        fileMetas.push({
          name: file.name,
          url: urlData.publicUrl,
          iv: ivHex,
          type: file.type,
          path: filePath,
          user_id: userId,
          private_space_id: activeSpaceId,
        });
        uploadedCount++;
      } catch (err) {
        console.error("Unexpected upload error:", err);
      }
    }

    if (!fileMetas.length) {
      setUploading(false);
      setErrorMsg("Upload failed for all files.");
      return;
    } else if (uploadedCount < files.length) {
      setErrorMsg(`⚠️ Only ${uploadedCount} of ${files.length} files uploaded successfully.`);
    }

    // Insert DB row
    const { error: insertError } = await supabase.from("private_vault_items").insert({
      created_by: userId,
      user_id: userId, // keep if still present for back-compat
      file_name: files.map((f) => f.name).join(", "),
      file_metas: fileMetas,
      title,
      tags,
      notes,
      encrypted_note: encryptedNote,
      note_iv: noteIv,
      created_at: new Date().toISOString(),
      private_space_id: activeSpaceId,
      is_vaulted: isVaulted,
    });

    if (insertError) {
      console.error(insertError);
      setErrorMsg("Failed to save document.");
    } else {
      setSuccessMsg("✅ Files uploaded successfully!");
      setTimeout(() => navigate("/privatespace"), 1300);
    }

    setUploading(false);
    setHasUnsavedChanges(false);
  };

  return (
    <Layout>
      {/* Unsaved changes confirmation popup */}
      <UnsavedChangesModal
        show={showUnsavedPopup}
        onCancel={() => setShowUnsavedPopup(false)}
        redirectPath="/privatespace"
        message="You have unsaved changes. Are you sure you want to leave?"
      />

      <div className="relative max-w-xl mx-auto mt-10 p-6 bg-white rounded shadow border border-gray-200">
        <button
          onClick={() => {
            if (hasUnsavedChanges) setShowUnsavedPopup(true);
            else navigate("/privatespace");
          }}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-semibold text-gray-800 mb-4">📤 Upload to {spaceName}</h2>
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
              <span className="text-sm">
                Drag & Drop your file(s) here or use browse below
                <br /><br />Format not exceeding 10 MB each
              </span>
            )}
          </div>

          {/* File input */}
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.json"
            onChange={(e) => { setFiles(Array.from(e.target.files)); setHasUnsavedChanges(true); }}
            className="w-full border border-gray-300 p-2 rounded text-gray-500 text-sm"
          />

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-800 mt-4">Document title:</label>
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setHasUnsavedChanges(true); }}
              className="w-full p-2 border rounded text-gray-700 text-sm bg-gray-50"
              placeholder="Enter document title (Public)"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium text-gray-800 mb-1 block">Add tags:</label>
            <div className="relative flex items-center gap-2 mb-2">
              <Search className="absolute left-3 text-gray-400" size={16} />
              <input
                type="text"
                value={newTag}
                onChange={(e) => { setNewTag(e.target.value); setHasUnsavedChanges(true); }}
                placeholder="Search existing tags or create new"
                className="w-full pl-8 border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
              />
              <button type="button" onClick={handleTagAdd} className="btn-secondary text-sm px-3 py-1">
                Create
              </button>
            </div>

            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
              {availableTags
                .filter((t) => t.toLowerCase().includes(newTag.toLowerCase()) && !tags.includes(t))
                .map((tag) => (
                  <label key={tag} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tags.includes(tag)}
                      onChange={() => {
                        setHasUnsavedChanges(true);
                        setTags((prev) =>
                          prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
                        );
                      }}
                    />
                    <span className="text-xs text-gray-700">{tag}</span>
                  </label>
                ))}
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {tags.map((tag) => (
                  <span key={tag} className="bg-yellow-50 text-gray-800 text-sm px-3 py-1 rounded-full flex items-center gap-1">
                    {tag}
                    <X size={12} className="cursor-pointer" onClick={() => setTags(tags.filter((t) => t !== tag))} />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Public Note */}
          <div>
            <label className="text-sm font-medium mb-1 text-gray-800">Public note:</label>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setHasUnsavedChanges(true); }}
              placeholder="Public notes (Visible to shared contacts)"
              rows={2}
              className="w-full border bg-gray-50 border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
            />
          </div>

          {/* Privacy */}
          <div className="mb-4">
            <label className="mr-4 font-semibold text-gray-800 text-sm">Upload Type:</label>
            <label className="mr-4 text-gray-800 text-sm">
              <input type="radio" name="privacy" value="vaulted" checked={isVaulted} onChange={() => setIsVaulted(true)} />
              {" "}Vaulted (Encrypted)
            </label>
            <label className="text-gray-800 text-sm">
              <input type="radio" name="privacy" value="public" checked={!isVaulted} onChange={() => setIsVaulted(false)} />
              {" "}Public
            </label>
          </div>

          {/* Private Note + Code */}
          {isVaulted && (
            <>
              <div>
                <p className="text-sm text-red-400 mb-1">
                  🔐 <strong>Private note</strong> will be encrypted using your Private vault code:
                </p>
                <textarea
                  value={privateNote}
                  onChange={(e) => { setPrivateNote(e.target.value); setHasUnsavedChanges(true); }}
                  placeholder="Private notes (For your eyes only)"
                  rows={2}
                  className="bg-gray-50 w-full border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-500">
                  Enter <strong>Private</strong> vault code to encrypt document:
                </label>
                <input
                  type="password"
                  value={vaultCode}
                  onChange={(e) => setVaultCode(e.target.value)}
                  className="w-full p-2 border rounded mb-3 text-gray-600 text-sm bg-gray-50"
                  placeholder="Vault code"
                  autoComplete="current-password"
                />
              </div>
            </>
          )}

          <button type="submit" disabled={uploading} className="btn-secondary w-full mt-4">
            {uploading ? (
              <span className="flex justify-center items-center gap-2">
                <Loader2 className="animate-spin" size={16} /> Uploading...
              </span>
            ) : (
              "Upload Document(s)"
            )}
          </button>

          {successMsg && <p className="text-sm text-green-600 text-center mt-2">{successMsg}</p>}
          {errorMsg && (
            <div className="text-sm text-red-500 mt-2 text-center" dangerouslySetInnerHTML={{ __html: errorMsg }} />
          )}
        </form>
      </div>
    </Layout>
  );
}