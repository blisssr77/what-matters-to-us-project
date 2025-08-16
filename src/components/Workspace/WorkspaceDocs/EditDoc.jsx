import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import Layout from "../../Layout/Layout";
import { X, Search, Loader2 } from "lucide-react";
import { encryptFile, encryptText, decryptText } from "../../../lib/encryption";
import bcrypt from "bcryptjs";
import { useWorkspaceStore } from "../../../hooks/useWorkspaceStore";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";

export default function WorkspaceEditDoc() {
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
    const [filesToRemove, setFilesToRemove] = useState([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);
    const [isVaulted, setIsVaulted] = useState(false);

    const { activeWorkspaceId } = useWorkspaceStore();

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
        "image/png",
        "image/gif",
        "application/zip",
        "application/json",
    ];

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
    
    // Fetch document data and tags on mount
    useEffect(() => {
        const fetchDoc = async () => {
            const { data, error } = await supabase
            .from("workspace_vault_items")
            .select("*")
            .eq("id", id)
            .eq("workspace_id", activeWorkspaceId)
            .single();

            if (!error && data) {
            setTitle(data.title);
            setTags(data.tags || []);
            setNotes(data.notes || []);
            setExistingFiles(data.file_metas || []);
            setIsVaulted(data.is_vaulted || false);


            const storedVaultCode = sessionStorage.getItem("vaultCode");

            if (data.encrypted_note && data.note_iv && storedVaultCode) {
                try {
                const decrypted = await decryptText(
                    data.encrypted_note,
                    data.note_iv,
                    storedVaultCode
                );
                setPrivateNote(decrypted);
                } catch (err) {
                console.error("Failed to decrypt note:", err);
                setPrivateNote("🔐 Encrypted");
                }
            } else {
                setPrivateNote(""); // no encrypted note
            }}
        };
        const fetchTags = async () => {
            const { data } = await supabase
            .from("vault_tags")
            .select("*")
            .eq("workspace_id", activeWorkspaceId);
            const tagNames = data?.map((tag) => tag.name) || [];
            setAvailableTags(tagNames);
        };

        fetchDoc();
        fetchTags();
    }, [id]);

    // Handle file drop
    const handleFileDrop = (e) => {
        e.preventDefault();
        setDragging(false);

        const droppedFiles = Array.from(e.dataTransfer.files);
        setFiles((prevFiles) => {
            const newFiles = droppedFiles.filter(
                (file) => !prevFiles.some((f) => f.name === file.name && f.size === file.size)
            );
            return [...prevFiles, ...newFiles];
        });
    };

    // Handle tags addition
    const handleTagAdd = async () => {
        if (!newTag.trim()) return;

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user?.id) {
            console.error("Unable to get user.");
            return;
        }

        // Insert only if not already in DB
        if (!availableTags.includes(newTag)) {
            await supabase.from("vault_tags").insert({
                name: newTag,
                section: "Workspace",
                user_id: user.id,
                workspace_id: activeWorkspaceId,
            });
            setAvailableTags((prev) => [...prev, newTag]);
        }

        // Add to local tag list if not already added
        if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
        setNewTag("");
    };


    // Remove existing file from the list
    const handleRemoveExistingFile = (index) => {
        const fileToRemove = existingFiles[index];
        if (!fileToRemove?.url) return;

        setFilesToRemove((prev) => [...prev, fileToRemove.url]);

        // Optionally: remove it from visible UI
        const updatedFiles = existingFiles.filter((_, i) => i !== index);
        setExistingFiles(updatedFiles);
    };

    // Handle file upload and document update
    const handleUpload = async (e) => {
        e.preventDefault();
        setUploading(true);
        setErrorMsg("");
        setSuccessMsg("");

        if (!files.length && !privateNote && !title && !tags.length && !notes && filesToRemove.length === 0) {
            setUploading(false);
            setErrorMsg("⚠️ Nothing to update.");
            return;
        }

        const invalidFiles = files.filter((f) => !allowedMimes.includes(f.type));
        if (invalidFiles.length > 0) {
            setUploading(false);
            setErrorMsg("One or more files have unsupported types.");
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setUploading(false);
            setErrorMsg("User not authenticated.");
            return;
        }
        if (isVaulted) {
            if (!vaultCode) {
                setUploading(false);
                setErrorMsg("Please enter your Vault Code to encrypt the document.");
                return;
            }

            // Validate vault code
            const { data: vaultRow, error: vaultError } = await supabase
                .from("vault_codes")
                .select("private_code_hash")
                .eq("id", user.id)
                .single();

            if (vaultError || !vaultRow?.private_code_hash) {
                setUploading(false);
                setErrorMsg("Vault code not found or not set.");
                return;
            }

            const isMatch = await bcrypt.compare(vaultCode, vaultRow.private_code_hash);
            if (!isMatch) {
                setUploading(false);
                setErrorMsg("Incorrect Vault Code.");
                return;
            }
        }

        // Delete marked files from Supabase Storage
        const filePathsToDelete = [];

        for (const url of filesToRemove) {
            try {
                const urlParts = url.split("/");
                const index = urlParts.findIndex(part => part === "workspace.vaulted");
                const filePath = decodeURIComponent(urlParts.slice(index + 1).join("/"));

                if (filePath) {
                    filePathsToDelete.push(filePath);
                }
            } catch (err) {
                console.warn("⚠️ Failed to parse file path from URL:", url, err);
            }
        }

        if (filePathsToDelete.length > 0) {
            const { error: deleteError } = await supabase
                .storage
                .from("workspace.vaulted")
                .remove(filePathsToDelete);

            if (deleteError) {
                console.error("Storage deletion error:", deleteError);
                setErrorMsg("Failed to delete one or more files from storage.");
            }
        }

        // Exclude deleted files from updatedFileMetas
        let updatedFileMetas = existingFiles.filter((f) => !filesToRemove.includes(f.url));
        let noteIv = "";

        // Upload new files
        for (const file of files) {
            const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
            const { encryptedBlob, ivHex } = await encryptFile(file, vaultCode, ivBytes);

            const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
            const filePath = `${activeWorkspaceId}/${Date.now()}-${sanitizedName}`;
            const bucket = isVaulted ? "workspace.vaulted" : "workspace.documents";

            // Upload file
            const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(filePath, isVaulted ? encryptedBlob : file, {
                contentType: file.type,
                metadata: {
                user_id: user.id,
                workspace_id: activeWorkspaceId,
                },
            });

            if (!uploadError) {
                const { data: urlData } = await supabase.storage.from(bucket).getPublicUrl(filePath);
            if (urlData?.publicUrl) {
                updatedFileMetas.push({ name: file.name, url: urlData.publicUrl, iv: isVaulted ? ivHex : "", type: file.type });
            }
            }
        }

        // Encrypt private note if changed
        let encryptedNote = "";
        if (privateNote && privateNote !== "🔐 Encrypted") {
            try {
                const result = await encryptText(privateNote, vaultCode);
                encryptedNote = result.encryptedData;
                noteIv = result.iv;
            } catch (err) {
                console.error(err);
                setUploading(false);
                setErrorMsg("Failed to encrypt private note.");
                return;
            }
        }

        // Final DB update
        const { error: updateError } = await supabase
            .from("workspace_vault_items")
            .update({
            title,
            tags,
            notes,
            encrypted_note: encryptedNote || undefined,
            note_iv: noteIv || undefined,
            file_metas: updatedFileMetas,
            })
            .eq("id", id)
            .eq("workspace_id", activeWorkspaceId);

        if (updateError) {
            console.error(updateError);
            setErrorMsg("Failed to update document.");
        } else {
            setSuccessMsg("Document updated successfully!");
            setFilesToRemove([]); // clear removed file list
            setHasUnsavedChanges(false);
            setTimeout(() => navigate("/workspace/vaults"), 1300);
        }

        setUploading(false);
        setHasUnsavedChanges(false);
    };


    return (
        <Layout>
            {/* Confirmation popup for file deletion */}
            {showConfirmPopup && fileToDeleteIndex !== null && (
                <div className="fixed top-6 right-6  bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
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

            <h2 className="text-xl font-semibold text-gray-900 mb-4">${title || "Untitled Document"}</h2>
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
                    <span className="text-sm">
                    Drag & Drop new file(s) here or browse below to upload replacements
                    </span>
                )}
                </div>

                {/* File input */}
                <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.json"
                    onChange={(e) => {
                        const selectedFiles = Array.from(e.target.files);
                        setFiles((prevFiles) => [...prevFiles, ...selectedFiles]);
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

                    {/* Current Selected Files */}
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
                        onChange={(e) => {
                            setTitle(e.target.value);
                            setHasUnsavedChanges(true);
                        }}
                        className="w-full p-2 mb-1 border rounded text-gray-700 text-sm bg-gray-50 font-bold"
                        placeholder="Enter document title (Public)"
                    />
                </div>

                {/* Tag Input Section */}
                <div>
                    <label className="text-sm font-medium text-gray-800 mb-1 block">Edit tags:</label>
                    <div className="relative flex items-center gap-2 mb-1 text-sm">
                        <Search className="absolute left-3 text-gray-400" size={16} />
                        <input
                            type="text"
                            value={newTag}
                            onChange={(e) => {
                                setNewTag(e.target.value);
                                setHasUnsavedChanges(true);
                            }}
                            placeholder="Search existing tags or create new"
                            className="w-full pl-8 border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400"
                        />
                        <button
                            type="button"
                            onClick={handleTagAdd}
                            className="btn-secondary text-sm"
                        >
                            Create
                        </button>
                    </div>

                {/* Display available tags */}
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
                    {availableTags
                   .filter(
                    (tag) =>
                        (!newTag || tag.toLowerCase().includes(newTag.toLowerCase())) &&
                        !tags.includes(tag)
                    )
                    .map((tag) => (
                        <div key={tag} className="flex items-center gap-2 py-1">
                        <input
                            type="checkbox"
                            checked={tags.includes(tag)}
                            onChange={() => {
                                setTags((prev) =>
                                    prev.includes(tag)
                                    ? prev.filter((t) => t !== tag)
                                    : [...prev, tag]
                                )
                                setHasUnsavedChanges(true);
                            }}
                        />
                        <span className="text-xs text-gray-700">{tag}</span>
                        </div>
                    ))}
                </div>

                {/* Display selected tags */}
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
                        onChange={(e) => {
                            setNotes(e.target.value);
                            setHasUnsavedChanges(true);
                        }}
                        placeholder="Public notes (Visible to shared contacts)"
                        rows={2}
                        className="w-full border bg-gray-50 border-gray-300 p-2 rounded font-medium text-gray-800 placeholder-gray-400 text-sm"
                    />
                </div>

                {isVaulted && (
                    <>            
                        {/* Private Note Section */}
                        <div>
                            <p className="text-sm text-red-400 mb-1">
                                🔐 Private note will be encrypted using your saved Vault Code:
                            </p>

                            {/* Private Notes */}
                            <textarea
                                value={privateNote}
                                onChange={(e) => {
                                    setPrivateNote(e.target.value);
                                    setHasUnsavedChanges(true);
                                }}
                                placeholder="Private notes (For your eyes only)"
                                rows={2}
                                className="bg-gray-50 w-full border border-gray-300 p-2 rounded text-gray-800 font-medium placeholder-gray-400 text-sm"
                            />
                        </div>

                        {/* Vault Code */}
                        <div>
                            <label className="block text-sm font-medium mb-1 text-gray-800">
                                Re-enter Private vault code to encrypt:
                            </label>
                            <input
                                type="password"
                                value={vaultCode}
                                onChange={(e) => {
                                    setVaultCode(e.target.value);
                                }}
                                className="w-full p-2 border font-medium rounded mb-3 text-gray-600 text-sm bg-gray-50"
                                placeholder="Vault code"
                            />
                        </div>
                    </>
                )}

                {/* Upload Button */}
                <button
                    type="submit"
                    disabled={uploading}
                    className="btn-secondary w-full text-sm"
                >
                {uploading ? (
                    <span className="flex justify-center items-center gap-2">
                    <Loader2 className="animate-spin" size={16} /> Updating...
                    </span>
                ) : (
                    "Update Document"
                )}
                </button>

                <br />
                {successMsg && (
                <p className="text-sm text-green-600 text-center">{successMsg}</p>
                )}
                {errorMsg && (
                <p className="text-sm text-red-600 text-center">{errorMsg}</p>
                )}
            </form>
            </div>
        </Layout>
    );
}
