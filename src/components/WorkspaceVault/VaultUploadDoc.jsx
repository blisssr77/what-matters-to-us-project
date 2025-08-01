import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { Loader2, X, Search } from "lucide-react";
import Layout from "../Layout/Layout";
import { encryptText, encryptFile } from "../../utils/encryption"; 
import bcrypt from "bcryptjs";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";

export default function WorkspaceUploadDoc() {
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
    const { activeWorkspaceId } = useWorkspaceStore();

    const navigate = useNavigate();

    // Allowed MIME types for file uploads
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
        "image/png"
    ];

    // Fetch active workspace ID on mount
    useEffect(() => {
        const fetchWorkspace = async () => {
            const { data: userData, error: userError } = await supabase.auth.getUser();
            const authUserId = userData?.user?.id;

            if (!authUserId) {
                console.error("No authenticated user found");
                return;
            }

            const { data, error } = await supabase
                .from("workspace_members")
                .select("workspace_id")
                .eq("user_id", authUserId)
                .maybeSingle();

            if (data?.workspace_id) {
                useWorkspaceStore.getState().setActiveWorkspaceId(data.workspace_id);
                console.log("Active Workspace ID:", data.workspace_id);
            } else {
                console.warn("⚠️ No workspace found for user.");
            }
        };

        fetchWorkspace();
    }, []);

    // Fetch available tags on component mount
    useEffect(() => {
        if (!activeWorkspaceId) return;
        const fetchTags = async () => {
            const { data, error } = await supabase.from("vault_tags").select("*").eq("workspace_id", activeWorkspaceId);
            if (!error) setAvailableTags(data.map((tag) => tag.name));
        };
        fetchTags();
    }, [activeWorkspaceId]);

    // Handle file drop
    const handleFileDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const droppedFiles = Array.from(e.dataTransfer.files);
        setFiles(droppedFiles);
    };

    // Handle tags selection
    const handleTagAdd = async () => {
        if (!newTag.trim()) return;

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user?.id) {
            console.error("Unable to get user.");
            return;
        }
        
        if (!activeWorkspaceId) {
            setErrorMsg("No active workspace selected.");
            return;
        }

        // Insert only if not already in DB
        if (!availableTags.includes(newTag)) {
            await supabase.from("vault_tags").insert({
                name: newTag,
                section: "Workspace",
                user_id: user.id,
                workspace_id: activeWorkspaceId
            });
            setAvailableTags((prev) => [...prev, newTag]);
        }

        // Add to local tag list if not already added
        if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
        setNewTag("");
    };

    // Handle file upload
    const handleUpload = async (e) => {
        e.preventDefault();
        setUploading(true);
        setErrorMsg("");
        setSuccessMsg("");

        // Validate files
        if (!files.length) {
            setUploading(false);
            setErrorMsg("⚠️ Please attach file(s) before uploading.");
            return;
        }

        // Validate file types
        const invalidFiles = files.filter((f) => !allowedMimes.includes(f.type));
        if (invalidFiles.length > 0) {
            setUploading(false);
            setErrorMsg("One or more files have unsupported types.");
            return;
        }

        // Authenticate user
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) {
            setUploading(false);
            setErrorMsg("User not authenticated.");
            return;
        }

        // Check Vault Code
        if (!vaultCode) {
            setUploading(false);
            setErrorMsg("Please enter your Vault Code.");
            return;
        }

        // Fetch user's vault code from DB
        const { data: vaultCodeRow, error: vaultError } = await supabase
            .from("vault_codes")
            .select("private_code")
            .eq("id", userId)
            .single();

        if (vaultError || !vaultCodeRow?.private_code) {
            setUploading(false);
            setErrorMsg(
                'Please set your Vault Code in <a href="/account/manage" class="text-blue-600 underline">Account Settings</a> before uploading.'
            );
            return;
        }

        const isMatch = await bcrypt.compare(vaultCode, vaultCodeRow.private_code);
        if (!isMatch) {
            setUploading(false);
            setErrorMsg("Incorrect Vault Code.");
            return;
        }

        // Upload files
        if (!activeWorkspaceId) {
            setUploading(false);
            console.error("Missing activeWorkspaceId");
            setErrorMsg("Workspace not selected. Please refresh or select a workspace.");
            return;
        }

        const fileMetas = [];
        let noteIv = "";
        let uploadedCount = 0;

        for (const file of files) {
            try {
                const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
                const { encryptedBlob, ivHex } = await encryptFile(file, vaultCode, ivBytes);

                const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
                const filePath = `${activeWorkspaceId}/${Date.now()}-${sanitizedName}`;

                const { error: uploadError } = await supabase.storage
                    .from("workspace.vaulted")
                    .upload(filePath, encryptedBlob, {
                        contentType: file.type,
                        upsert: false,
                        metadata: { workspace_id: activeWorkspaceId }, // optional, useful for RLS
                    });

                if (uploadError) {
                    console.error("Upload failed:", uploadError.message);
                    continue;
                }

                const { data: urlData, error: urlError } = supabase.storage
                    .from("workspace.vaulted")
                    .getPublicUrl(filePath);

                if (urlError || !urlData?.publicUrl) {
                    console.error("Failed to retrieve public URL:", urlError?.message);
                    continue;
                }

                fileMetas.push({
                    name: file.name,
                    url: urlData.publicUrl,
                    iv: ivHex,
                    type: file.type,
                    path: filePath,
                });

                uploadedCount++;
            } catch (err) {
                console.error("Unexpected file upload error:", err);
            }
        }

        // Post-upload status
        if (!fileMetas.length) {
            setUploading(false);
            setErrorMsg("All uploads failed. Please try again.");
            return;
        } else if (uploadedCount < files.length) {
            setErrorMsg(`⚠️ Only ${uploadedCount} of ${files.length} files uploaded.`);
        }

        // Encrypt private note if needed
        let encryptedNote = "";
        if (privateNote) {
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

        // Ensure all selected tags exist in vault_tags
        for (const tag of tags) {
            if (!availableTags.includes(tag)) {
                const { error: tagInsertError } = await supabase.from("vault_tags").insert({
                    name: tag,
                    section: "Workspace",
                    user_id: userId,
                    workspace_id: activeWorkspaceId,
                });

                if (!tagInsertError) {
                    setAvailableTags((prev) => [...prev, tag]); // optional, updates state
                } else {
                    console.error("❌ Failed to insert tag:", tag, tagInsertError.message);
                }
            }
        }

        // Insert metadata into DB
        const { error: insertError } = await supabase.from("workspace_vault_items").insert({
            user_id: userId,
            file_name: files.map((f) => f.name).join(", "),
            file_metas: fileMetas,
            title,
            tags,
            notes,
            encrypted_note: encryptedNote,
            note_iv: noteIv,
            created_at: new Date().toISOString(),
            workspace_id: activeWorkspaceId,
            created_by: userId,
        });

        if (insertError) {
            console.error("Insert error:", insertError);
            setErrorMsg("Failed to save file metadata.");
        } else {
            setSuccessMsg("Files uploaded successfully!");
            setTimeout(() => navigate("/workspace/vaults"), 1300);
        }

        setUploading(false);
        setHasUnsavedChanges(false);
    };


    return (
        <Layout>
            {/* Unsaved changes confirmation popup */}
            {showUnsavedPopup && (
                <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
                    <p className="mt-10 text-gray-800">
                    You have unsaved changes. Are you sure you want to leave?
                    </p>
                    <div className="flex gap-3 justify-end mt-4">
                    <button
                        onClick={() => navigate("/workspace/vaults")}
                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        Leave Anyway
                    </button>
                    <button
                        onClick={() => setShowUnsavedPopup(false)}
                        className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                    >
                        Cancel
                    </button>
                    </div>
                </div>
            )}

            <div className="relative max-w-xl mx-auto mt-10 p-6 bg-white rounded shadow border border-gray-200">
                <button
                    onClick={() => {
                        if (hasUnsavedChanges) {
                        setShowUnsavedPopup(true);
                        } else {
                        navigate("/workspace/vaults");
                        }
                    }}
                    className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                    >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">📤 Upload to Workspace Vault</h2>
                <p className="text-xs text-blue-700 mt-1">
                    Supported: PDF, Word, Excel, PowerPoint, Text, CSV, JPG, PNG, GIF, ZIP, JSON
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
                        <span className="text-sm">Drag & Drop your file(s) here or use browse below <br /><br />Format not exeeding 10 MB each</span>
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
                            <button
                                type="button"
                                onClick={handleTagAdd}
                                className="btn-secondary text-sm px-3 py-1"
                            >
                            Create
                            </button>
                        </div>

                        {/* Filtered Tag Suggestions (scrollable) */}
                        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
                            {availableTags
                            .filter((tag) =>
                                tag.toLowerCase().includes(newTag.toLowerCase()) && !tags.includes(tag)
                            )
                            .map((tag) => (
                                <div key={tag} className="flex items-center gap-2 py-1">
                                    <input
                                        type="checkbox"
                                        checked={tags.includes(tag)}
                                        onChange={() => {
                                            setHasUnsavedChanges(true);
                                            setTags((prev) =>
                                                prev.includes(tag)
                                                    ? prev.filter((t) => t !== tag)
                                                    : [...prev, tag]
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
                    <div>
                        <p className="text-sm text-red-400 mb-1">
                        🔐 <strong>Private note</strong> will be encrypted using your saved Vault Code:
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
                            Enter <strong>Private</strong> vault code to encrypt document:
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

                    {/* Upload */}
                    <button
                        type="submit"
                        disabled={uploading}
                        className="btn-secondary w-full mt-4"
                        >
                        {uploading ? (
                            <span className="flex justify-center items-center gap-2">
                            <Loader2 className="animate-spin" size={16} /> Uploading...
                            </span>
                        ) : (
                            "Upload Document(s)"
                        )}
                    </button>

                    <br />
                    {successMsg && (
                        <p className="text-sm text-green-600 text-center">{successMsg}</p>
                    )}
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

