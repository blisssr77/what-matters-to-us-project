import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { Loader2, X, Search } from "lucide-react";
import Layout from "../../Layout/Layout";
import { encryptText, encryptFile } from "../../../lib/encryption"; 
import bcrypt from "bcryptjs";
import { useWorkspaceStore } from "../../../hooks/useWorkspaceStore";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";

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
    const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();
    const [isVaulted, setIsVaulted] = useState(true);
    const [wsName, setWsName] = useState("");

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
    // 1) On mount, pick an active workspace ID for this user
    useEffect(() => {
        (async () => {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) return;

        const { data: membership } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (membership?.workspace_id) {
            setActiveWorkspaceId(membership.workspace_id);
            console.log("Active Workspace ID:", membership.workspace_id);
        } else {
            console.warn("⚠️ No workspace found for user.");
        }
        })();
    }, [setActiveWorkspaceId]);

    // 2) Whenever the active ID changes, fetch its name
    useEffect(() => {
        if (!activeWorkspaceId) {
        setWsName("");
        return;
        }
        (async () => {
        const { data, error } = await supabase
            .from("workspaces")
            .select("name")
            .eq("id", activeWorkspaceId)
            .single();

        setWsName(error ? "" : data?.name ?? "");
        })();
    }, [activeWorkspaceId]);

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

    // Message timeout for success/error
    useEffect(() => {
        if (successMsg || errorMsg) {
            const timer = setTimeout(() => {
                setSuccessMsg("");
                setErrorMsg("");
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [successMsg, errorMsg]);

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

        // Check Vault Code if needed
        if (isVaulted) {
            if (!vaultCode) {
                setUploading(false);
                setErrorMsg("Please enter your Vault Code.");
                return;
            }

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
        }

        if (!activeWorkspaceId) {
            setUploading(false);
            setErrorMsg("Workspace not selected. Please refresh or select a workspace.");
            return;
        }

        const fileMetas = [];
        let uploadedCount = 0;
        let noteIv = "";

        for (const file of files) {
            try {
                const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
                const filePath = `${activeWorkspaceId}/${Date.now()}-${sanitizedName}`;

                let ivHex = "";
                let uploadError, urlData;

                if (isVaulted) {
                    const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
                    const { encryptedBlob, ivHex: hex } = await encryptFile(file, vaultCode, ivBytes);
                    ivHex = hex;

                    ({ error: uploadError } = await supabase.storage
                        .from("workspace.vaulted")
                        .upload(filePath, encryptedBlob, {
                            contentType: file.type,
                            upsert: false,
                            metadata: { user_id: userId, workspace_id: activeWorkspaceId },
                        }));

                    ({ data: urlData } = supabase.storage
                        .from("workspace.vaulted")
                        .getPublicUrl(filePath));
                } else {
                    ({ error: uploadError } = await supabase.storage
                        .from("workspace.public")
                        .upload(filePath, file, {
                            contentType: file.type,
                            upsert: false,
                            metadata: { user_id: userId, workspace_id: activeWorkspaceId },
                        }));

                    ({ data: urlData } = supabase.storage
                        .from("workspace.public")
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
                    workspace_id: activeWorkspaceId,
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

        // Ensure tags exist
        for (const tag of tags) {
            if (!availableTags.includes(tag)) {
                const { error } = await supabase.from("vault_tags").insert({
                    name: tag,
                    section: "Workspace",
                    user_id: userId,
                    workspace_id: activeWorkspaceId,
                });

                if (!error) {
                    setAvailableTags((prev) => [...prev, tag]);
                } else {
                    console.error("❌ Failed to insert tag:", tag, error.message);
                }
            }
        }

        // Save metadata to DB
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
            is_vaulted: isVaulted,
        });

        if (insertError) {
            console.error(insertError);
            setErrorMsg("Failed to save document.");
        } else {
            setSuccessMsg("✅ Files uploaded successfully!");
            setTimeout(() => navigate("/workspace/vaults"), 1300);
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
                redirectPath="/workspace/vaults"
                message="You have unsaved changes. Are you sure you want to leave?"
            />

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

                <h2 className="text-xl font-semibold text-gray-800 mb-4">📤 Upload to {wsName}</h2>
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

