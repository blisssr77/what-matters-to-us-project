import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import Layout from "../Layout/Layout";
import { X, Search, Loader2 } from "lucide-react";
import { encryptFile, encryptText, decryptText } from "../../utils/encryption";

export default function VaultEditDoc() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [files, setFiles] = useState([]);
    const [existingFiles, setExistingFiles] = useState([]);
    const [removedFiles, setRemovedFiles] = useState([]);
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
    const [loading, setLoading] = useState(false);
    const [showConfirmPopup, setShowConfirmPopup] = useState(false);
    const [fileToDeleteIndex, setFileToDeleteIndex] = useState(null);

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
    
    // Fetch document data and tags on mount
    useEffect(() => {
        const fetchDoc = async () => {
            const { data, error } = await supabase
            .from("vault_items")
            .select("*")
            .eq("id", id)
            .single();

            if (!error && data) {
            setTitle(data.title);
            setTags(data.tags || []);
            setNotes(data.notes || []);
            setExistingFiles(data.file_metas || []);

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
                console.error("❌ Failed to decrypt note:", err);
                setPrivateNote("🔐 Encrypted");
                }
            } else {
                setPrivateNote(""); // no encrypted note
            }
        }
    };

        const fetchTags = async () => {
            const { data } = await supabase.from("vault_tags").select("name");
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
        setFiles(Array.from(e.dataTransfer.files));
    };

    // Handle drag over
    const handleTagAdd = async () => {
        if (!newTag.trim()) return;
        if (!availableTags.includes(newTag)) {
        await supabase.from("vault_tags").insert({ name: newTag });
        setAvailableTags((prev) => [...prev, newTag]);
        }
        if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
        setNewTag("");
    };

    // Remove existing file from the list
    const handleRemoveExistingFile = async (index) => {
        const fileToRemove = existingFiles[index];

        if (!fileToRemove?.url) return;

        // Derive file path from public URL
        const urlParts = fileToRemove.url.split("/");
        const filePath = decodeURIComponent(urlParts.slice(4).join("/")); // vault_items/[user.id]/filename

        // Delete file from storage
        const { error: deleteError } = await supabase
            .storage
            .from("vaulted")
            .remove([filePath]);

        if (deleteError) {
            console.error("❌ Storage deletion error:", deleteError);
            setSuccessMsg("❌ Failed to delete file from storage.");
            return;
    }

    // Update state by removing from UI and prepare for DB update
    const updatedFiles = existingFiles.filter((_, i) => i !== index);

    // Update the vault_items row immediately
    const { error: updateError } = await supabase
        .from("vault_items")
        .update({ file_metas: updatedFiles })
        .eq("id", id);

    if (updateError) {
        console.error("❌ DB update error:", updateError);
        setSuccessMsg("❌ Failed to update database after deleting file.");
    } else {
        setExistingFiles(updatedFiles);
        setSuccessMsg("✅ File deleted successfully.");
    }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        setUploading(true);
        setSuccessMsg("");

        if (!files.length && !privateNote && !title && !tags.length && !notes) {
            setUploading(false);
            setSuccessMsg("⚠️ Nothing to update.");
            return;
        }

        const invalidFiles = files.filter((f) => !allowedMimes.includes(f.type));
        if (invalidFiles.length > 0) {
            setUploading(false);
            setSuccessMsg("❌ One or more files have unsupported types.");
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setUploading(false);
            setSuccessMsg("❌ User not authenticated.");
            return;
        }

        if (!vaultCode) {
            setUploading(false);
            setSuccessMsg("❌ Please enter your Vault Code to encrypt.");
            return;
        }

        let updatedFileMetas = [...existingFiles]; // Already removed deleted ones
        let noteIv = "";

        for (const file of files) {
            const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
            const { encryptedBlob, ivHex } = await encryptFile(file, vaultCode, ivBytes);

            const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
            const filePath = `${user.id}/${Date.now()}-${sanitizedName}`;

            const { error: uploadError } = await supabase.storage
            .from("vaulted")
            .upload(filePath, encryptedBlob, { contentType: file.type });

            if (!uploadError) {
            const { data: urlData } = await supabase.storage.from("vaulted").getPublicUrl(filePath);
            if (urlData?.publicUrl) {
                updatedFileMetas.push({ name: file.name, url: urlData.publicUrl, iv: ivHex });
            }
            }
        }

        let encryptedNote = "";
        if (privateNote && privateNote !== "🔐 Encrypted") {
            const result = await encryptText(privateNote, vaultCode);
            encryptedNote = result.encryptedData;
            noteIv = result.iv;
        }

        const { error: updateError } = await supabase
            .from("vault_items")
            .update({
            title,
            tags,
            notes,
            encrypted_note: encryptedNote || undefined,
            note_iv: noteIv || undefined,
            file_metas: updatedFileMetas,
            })
            .eq("id", id);

        if (updateError) {
            console.error(updateError);
            setSuccessMsg("❌ Failed to update document.");
        } else {
            setSuccessMsg("✅ Document updated successfully!");
            setTimeout(() => navigate("/private/vaults"), 1300);
        }

        setUploading(false);
    };

    return (
        <Layout>
            {/* Confirmation popup for file deletion */}
            {showConfirmPopup && fileToDeleteIndex !== null && (
                <div className="fixed top-6 right-6  bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
                    <p className="mt-10 text-gray-800">
                    Are you sure you want to delete <strong>{existingFiles[fileToDeleteIndex]?.name}</strong>?
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

            <div className="relative max-w-xl mx-auto mt-10 p-6 bg-white rounded shadow border border-gray-200">
            <button
                onClick={() => navigate("/private/vaults")}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            >
                <X size={20} />
            </button>

            <h2 className="text-xl font-semibold text-gray-800 mb-4">✏️ Edit Your Vaulted Document</h2>
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
                    onChange={(e) => setFiles(Array.from(e.target.files))}
                    className="w-full border border-gray-300 p-2 rounded text-gray-500"
                />

                {/* Existing Files */}
                {existingFiles.length > 0 && (
                    <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Previously Uploaded Files:</h4>
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
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Newly Selected Files:</h4>
                        <ul className="space-y-1">
                        {files.map((file, index) => (
                            <li
                            key={index}
                            className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded text-sm text-gray-800 bg-gray-50"
                            >
                            {file.name}
                            <button
                                type="button"
                                onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
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
                    <label className="block text-sm font-medium mb-1 text-gray-800 mt-4">Title:</label>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full p-2 mb-1 border rounded text-gray-700"
                        placeholder="Enter document title (Public)"
                    />
                </div>

                {/* Tag Input Section */}
                <div>
                    <label className="text-sm font-medium text-gray-800 mb-1 block">Edit tags:</label>
                    <div className="relative flex items-center gap-2 mb-2">
                        <Search className="absolute left-3 text-gray-400" size={16} />
                        <input
                            type="text"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            placeholder="Search existing tags or create new"
                            className="w-full pl-8 border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400"
                        />
                        <button
                            type="button"
                            onClick={handleTagAdd}
                            className="ml-2 px-3 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
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
                            onChange={() =>
                            setTags((prev) =>
                                prev.includes(tag)
                                ? prev.filter((t) => t !== tag)
                                : [...prev, tag]
                            )
                            }
                        />
                        <span className="text-sm text-gray-700">{tag}</span>
                        </div>
                    ))}
                </div>

                {/* Display selected tags */}
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                    {tags.map((tag) => (
                        <span
                        key={tag}
                        className="bg-purple-100 text-gray-800 text-xs mb-2 px-3 py-1 rounded-full flex items-center gap-1"
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
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Public notes (Visible to shared contacts)"
                        rows={2}
                        className="w-full border bg-gray-50 border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400"
                    />
                </div>


                {/* Private Note Section */}
                <div>
                    <p className="text-sm text-red-400 mb-1">
                        🔐 <strong>Private note</strong> will be encrypted using your saved Vault Code:
                    </p>

                    {/* Private Notes */}
                    <textarea
                        value={privateNote}
                        onChange={(e) => setPrivateNote(e.target.value)}
                        placeholder="Private notes (For your eyes only)"
                        rows={2}
                        className="bg-gray-50 w-full border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400"
                    />
                </div>

                {/* Vault Code */}
                <div>
                    <label className="block text-sm font-medium mb-1 text-gray-500">
                         Re-enter <strong>Private</strong> vault code to encrypt:
                    </label>
                    <input
                        type="password"
                        value={vaultCode}
                        onChange={(e) => setVaultCode(e.target.value)}
                        className="w-full p-2 border rounded mb-3 text-gray-600"
                        placeholder="Vault code"
                    />
                </div>

                {/* Upload Button */}
                <button
                    type="submit"
                    disabled={uploading}
                    className="bg-purple-600 text-white w-full py-2 rounded hover:bg-purple-700 transition"
                >
                {uploading ? (
                    <span className="flex justify-center items-center gap-2">
                    <Loader2 className="animate-spin" size={16} /> Updating...
                    </span>
                ) : (
                    "Update Document"
                )}
                </button>

                {successMsg && (
                <p className="text-sm text-green-600 text-center">{successMsg}</p>
                )}
            </form>
            </div>
        </Layout>
    );
}
