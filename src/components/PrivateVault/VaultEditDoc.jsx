import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import Layout from "../Layout/Layout";
import { X, Search, Loader2 } from "lucide-react";
import { encryptFile, encryptText } from "../../utils/encryption";

export default function VaultEditDoc() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [files, setFiles] = useState([]);
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
    
    // Fetch available tags on component mount
    useEffect(() => {
        const fetchTags = async () => {
            const { data, error } = await supabase.from("vault_tags").select("*");
            if (!error) setAvailableTags(data.map((tag) => tag.name));
        };
        fetchTags();
    }, []);

    useEffect(() => {
        // Fetch document details and tags on mount
        const fetchDoc = async () => {
        const { data, error } = await supabase
            .from("vaulted_documents")
            .select("*")
            .eq("id", id)
            .single();

        if (!error && data) {
            setTitle(data.title);
            setTags(data.tags || []);
            setNotes(data.notes || "");
            setPrivateNote(data.encrypted_note ? "🔐 Encrypted" : "");
        }
        };

        // Fetch all unique tags from vaulted_documents
        const fetchTags = async () => {
        const { data } = await supabase.from("vaulted_documents").select("tags");
        const allTags = data?.flatMap((item) => item.tags || []);
        const uniqueTags = [...new Set(allTags)];
        setAvailableTags(uniqueTags);
        };

        fetchDoc();
        fetchTags();
    }, [id]);

    // Handle file drop events
    const handleFileDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        setFiles(Array.from(e.dataTransfer.files));
    };

    // Handle file selection from input
    const handleTagAdd = async () => {
        if (!newTag.trim()) return;
        if (!availableTags.includes(newTag)) {
            await supabase.from("vault_tags").insert({ name: newTag });
            setAvailableTags((prev) => [...prev, newTag]);
        }
        if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
        setNewTag("");
    };


    // Handle file drag over
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

        const {
            data: { user },
        } = await supabase.auth.getUser();
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

        const fileMetas = [];
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
                const { data } = supabase.storage.from("vaulted").getPublicUrl(filePath);
                if (data?.publicUrl) {
                fileMetas.push({ name: file.name, url: data.publicUrl, iv: ivHex });
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
        .from("vaulted_documents")
        .update({
            title,
            tags,
            notes,
            encrypted_note: encryptedNote || undefined,
            note_iv: noteIv || undefined,
            file_metas: fileMetas.length > 0 ? fileMetas : undefined,
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
