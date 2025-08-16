// src/components/PrivateSpace/PrivateSpaceDocs/P-UploadDoc.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { Loader2, X, Search } from "lucide-react";
import Layout from "../../Layout/Layout";
import { encryptText, encryptFile } from "../../../lib/encryption";
import bcrypt from "bcryptjs";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";

export default function PrivateSpaceUploadDoc() {
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

  // PrivateSpace equivalents
  const [activePrivateSpaceId, setActivePrivateSpaceId] = useState(null);
  const [psName, setPsName] = useState("");
  const [isVaulted, setIsVaulted] = useState(true);

  const navigate = useNavigate();

  // Allowed MIME types (same as workspace version)
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
  ];

  // 1) Pick an active private space for this user (first one)
  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      console.log('user?', userData);
      const userId = userData?.user?.id;
      if (!userId) return;
      // 2) see what the DB returns (and any error)
      const { data, error } = await supabase.from('private_spaces').select('id,name,created_by');
      console.log('spaces', data, error);

      const { data: space } = await supabase
        .from("private_spaces")
        .select("id")
        .eq("created_by", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(1);

      if (!data.length) {
        console.warn('⚠️ No private space found for user.');
        return;
      }

      const first = data[0];
      setActivePrivateSpaceId((prev) =>
        prev ? prev : first.id
      );
      setPsName(first.name);

      if (space.length) {
        const keep = space.find(s => s.id === activePrivateSpaceId)?.id;
        setActivePrivateSpaceId(keep ?? space[0].id);
        setPsName(space.find(s => s.id === (keep ?? space[0].id))?.name ?? '');
      } else {
        console.warn('⚠️ No private space found for user.');
      }
    })();
  }, []);

  // 2) Fetch the private space name whenever active changes
  useEffect(() => {
    if (!activePrivateSpaceId) {
      setPsName("");
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("private_spaces")
        .select("name")
        .eq("id", activePrivateSpaceId)
        .single();

      setPsName(error ? "" : data?.name ?? "");
    })();
  }, [activePrivateSpaceId]);

  // Fetch available tags scoped to this private space (same UX)
  useEffect(() => {
    if (!activePrivateSpaceId) return;
    const fetchTags = async () => {
      const { data, error } = await supabase
        .from("vault_tags")
        .select("*")
        .eq("private_space_id", activePrivateSpaceId);
      if (!error) setAvailableTags((data || []).map((t) => t.name));
    };
    fetchTags();
  }, [activePrivateSpaceId]);

  // File DnD
  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(droppedFiles);
  };

  // Add tag (insert if missing)
  const handleTagAdd = async () => {
    if (!newTag.trim()) return;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.id) {
      console.error("Unable to get user.");
      return;
    }

    if (!activePrivateSpaceId) {
      setErrorMsg("No active private space selected.");
      return;
    }

    if (!availableTags.includes(newTag)) {
      await supabase.from("vault_tags").insert({
        name: newTag,
        section: "Private",
        user_id: user.id,
        private_space_id: activePrivateSpaceId,
      });
      setAvailableTags((prev) => [...prev, newTag]);
    }

    if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
    setNewTag("");
  };

  // Auto clear messages
  useEffect(() => {
    if (successMsg || errorMsg) {
      const timer = setTimeout(() => {
        setSuccessMsg("");
        setErrorMsg("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg, errorMsg]);

  // Upload handler (same logic, swapped to private)
  const handleUpload = async (e) => {
    e.preventDefault();
    setUploading(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!files.length) {
      setUploading(false);
      setErrorMsg("⚠️ Please attach file(s) before uploading.");
      return;
    }

    const invalidFiles = files.filter((f) => !allowedMimes.includes(f.type));
    if (invalidFiles.length > 0) {
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

    // Vault code check (private_code)
    if (isVaulted) {
      if (!vaultCode) {
        setUploading(false);
        setErrorMsg("Please enter your Vault Code.");
        return;
      }

      const { data: row, error: vErr } = await supabase
        .from("vault_codes")
        .select("private_code_hash")
        .eq("id", userId)
        .single();

      if (vErr || !row?.private_code_hash) {
        setUploading(false);
        setErrorMsg(
          'Please set your Vault Code in <a href="/account/manage" class="text-blue-600 underline">Account Settings</a> before uploading.'
        );
        return;
      }

      const isMatch = await bcrypt.compare(vaultCode, row.private_code_hash);
      if (!isMatch) {
        setUploading(false);
        setErrorMsg("Incorrect Vault Code.");
        return;
      }
    }

    if (!activePrivateSpaceId) {
      setUploading(false);
      setErrorMsg("Private space not selected. Please refresh or select a private space.");
      return;
    }

    const fileMetas = [];
    let uploadedCount = 0;
    let noteIv = "";

    for (const file of files) {
      try {
        const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
        const filePath = `${activePrivateSpaceId}/${Date.now()}-${sanitizedName}`;
        console.log('upload path:', filePath, 'spaceId:', activePrivateSpaceId);

        let ivHex = "";
        let uploadError, urlData;

        if (isVaulted) {
          const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
          const { encryptedBlob, ivHex: hex } = await encryptFile(file, vaultCode, ivBytes);
          ivHex = hex;

          ({ error: uploadError } = await supabase.storage
            .from("private.vaulted")
            .upload(filePath, encryptedBlob, {
              contentType: file.type,
              upsert: false,
              metadata: { user_id: userId, private_space_id: activePrivateSpaceId },
            }));

          ({ data: urlData } = supabase.storage.from("private.vaulted").getPublicUrl(filePath));
        } else {
          ({ error: uploadError } = await supabase.storage
            .from("private.public")
            .upload(filePath, file, {
              contentType: file.type,
              upsert: false,
              metadata: { user_id: userId, private_space_id: activePrivateSpaceId },
            }));

          ({ data: urlData } = supabase.storage.from("private.public").getPublicUrl(filePath));
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
          private_space_id: activePrivateSpaceId,
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

    // Encrypt private note if provided
    let encryptedNote = "";
    if (isVaulted && privateNote) {
      try {
        const result = await encryptText(privateNote, vaultCode);
        encryptedNote = result.encryptedData;
        noteIv = result.iv;
      } catch (err) {
        console.error("Note encryption failed:", err);
        setUploading(false);
        setErrorMsg("Failed to encrypt private note.");
        return;
      }
    }

    // Ensure tags exist (Private scope)
    for (const tag of tags) {
      if (!availableTags.includes(tag)) {
        const { error } = await supabase.from("vault_tags").insert({
          name: tag,
          section: "Private",
          user_id: userId,
          private_space_id: activePrivateSpaceId,
        });

        if (!error) {
          setAvailableTags((prev) => [...prev, tag]);
        } else {
          console.error("❌ Failed to insert tag:", tag, error.message);
        }
      }
    }

    // Save to private_vault_items
    const { error: insertError } = await supabase.from("private_vault_items").insert({
      user_id: userId,
      file_name: files.map((f) => f.name).join(", "),
      file_metas: fileMetas,
      title,
      tags,
      notes,
      encrypted_note: encryptedNote,
      note_iv: noteIv,
      created_at: new Date().toISOString(),
      private_space_id: activePrivateSpaceId,
      created_by: userId,
      is_vaulted: isVaulted,
    });

    if (insertError) {
      console.error(insertError);
      setErrorMsg("Failed to save document.");
    } else {
      setSuccessMsg("✅ Files uploaded successfully!");
      setTimeout(() => navigate("/privatespace/vaults"), 1300);
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

        <h2 className="text-xl font-semibold text-gray-800 mb-4">📤 Upload to {psName}</h2>
        <p className="text-xs text-blue-700 mt-1">
          Supported: PDF, Word, Excel, PowerPoint, Text, CSV, JPG, PNG
        </p>

        <form onSubmit={handleUpload} className="space-y-5">
          {/* Drag & Drop */}
          <div
            onDrop={handleFileDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            className={`w-full h-32 border-2 border-dashed rounded-lg flex items-center justify-center text-gray-500 cursor-pointer ${
              dragging ? "border-purple-500 bg-purple-50" : "border-gray-300"
            }`}
          >
            {files.length > 0 ? (
              <ul className="text-sm space-y-1">
                {files.map((file, idx) => (
                  <li key={idx}>{file.name}</li>
                ))}
              </ul>
            ) : (
              <span className="text-sm">
                Drag & Drop your file(s) here or use browse below <br />
                <br />
                Format not exeeding 10 MB each
              </span>
            )}
          </div>

          {/* File input */}
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png"
            onChange={(e) => {
              setFiles(Array.from(e.target.files));
              setHasUnsavedChanges(true);
            }}
            className="w-full border border-gray-300 p-2 rounded text-gray-500 text-sm"
          />

          {/* Privacy Section */}
          <div className="mb-4">
            <label className="mr-4 font-semibold text-gray-800 text-sm">Upload Type:</label>
            <label className="mr-4 text-gray-800 text-sm">
              <input
                type="radio"
                name="privacy"
                value="vaulted"
                checked={isVaulted}
                onChange={() => setIsVaulted(true)}
              />
              Vaulted (Encrypted)
            </label>
            <label className="text-gray-800 text-sm">
              <input
                type="radio"
                name="privacy"
                value="public"
                checked={!isVaulted}
                onChange={() => setIsVaulted(false)}
              />
              Public
            </label>
          </div>

          {/* Document title input */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-800 mt-4">Document title:</label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setHasUnsavedChanges(true);
              }}
              className="w-full p-2 border rounded text-gray-700 text-sm bg-gray-50"
              placeholder="Enter document title (Public)"
            />
          </div>

          {/* Tag Input Section */}
          <div>
            <label className="text-sm font-medium text-gray-800 mb-1 block">Add tags:</label>

            {/* Search + Create */}
            <div className="relative flex items-center gap-2 mb-2">
              <Search className="absolute left-3 text-gray-400" size={16} />
              <input
                type="text"
                value={newTag}
                onChange={(e) => {
                  setNewTag(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Search existing tags or create new"
                className="w-full pl-8 border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400  text-sm"
              />
              <button type="button" onClick={handleTagAdd} className="btn-secondary text-sm px-3 py-1">
                Create
              </button>
            </div>

            {/* Filtered Tag Suggestions (scrollable) */}
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
              {availableTags
                .filter((tag) => tag.toLowerCase().includes(newTag.toLowerCase()) && !tags.includes(tag))
                .map((tag) => (
                  <div key={tag} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={tags.includes(tag)}
                      onChange={() => {
                        setHasUnsavedChanges(true);
                        setTags((prev) =>
                          prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                        );
                      }}
                    />
                    <span className="text-xs text-gray-700">{tag}</span>
                  </div>
                ))}
            </div>

            {/* Selected Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-yellow-50 text-gray-800 text-sm px-3 py-1 rounded-full flex items-center gap-1"
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

          {/* Notes */}
          <div>
            <h className="text-sm font-medium mb-1 text-gray-800">Public note:</h>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setHasUnsavedChanges(true);
              }}
              placeholder="Public notes (Visible to shared contacts)"
              rows={2}
              className="w-full border bg-gray-50 border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
            />
          </div>

          {/* Private Note Section */}
          {isVaulted && (
            <>
              <div>
                <p className="text-sm text-red-400 mb-1">
                  🔐 Private note will be encrypted using your saved Vault Code:
                </p>
                <textarea
                  value={privateNote}
                  onChange={(e) => {
                    setPrivateNote(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="Private notes (For your eyes only)"
                  rows={2}
                  className="bg-gray-50 w-full border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
                />
              </div>

              {/* Vault Code Section */}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-500">
                  Enter Private vault code to encrypt document:
                </label>
                <input
                  type="password"
                  value={vaultCode}
                  onChange={(e) => {
                    setVaultCode(e.target.value);
                  }}
                  className="w-full p-2 border rounded mb-3 text-gray-600 text-sm bg-gray-50"
                  placeholder="Vault code"
                />
              </div>
            </>
          )}

          {/* Upload */}
          <button type="submit" disabled={uploading} className="btn-secondary w-full mt-4">
            {uploading ? (
              <span className="flex justify-center items-center gap-2">
                <Loader2 className="animate-spin" size={16} /> Uploading...
              </span>
            ) : (
              "Upload Document(s)"
            )}
          </button>

          <br />
          {successMsg && <p className="text-sm text-green-600 text-center">{successMsg}</p>}
          {errorMsg && (
            <div
              className="text-sm text-red-500 mt-2 text-center"
              dangerouslySetInnerHTML={{ __html: errorMsg }}
            />
          )}
        </form>
      </div>
    </Layout>
  );
}
