import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { Loader2, X, Search } from "lucide-react";
import Layout from "../Layout/Layout";
import { encryptText, encryptFile } from "../../utils/encryption"; // AES-GCM helper

export default function VaultedFileUpload() {
    const [files, setFiles] = useState([]);
    const [tags, setTags] = useState([]);
    const [availableTags, setAvailableTags] = useState([]);
    const [newTag, setNewTag] = useState("");
    const [notes, setNotes] = useState("");
    const [privateNote, setPrivateNote] = useState("");
    const [uploading, setUploading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [dragging, setDragging] = useState(false);
    const [title, setTitle] = useState("");
    const [vaultCode, setVaultCode] = useState("");

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

    // Fetch available tags on component mount
    useEffect(() => {
        const fetchTags = async () => {
            const { data, error } = await supabase.from("vault_tags").select("*");
            if (!error) setAvailableTags(data.map((tag) => tag.name));
        };
        fetchTags();
    }, []);

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
        if (!availableTags.includes(newTag)) {
            await supabase.from("vault_tags").insert({ name: newTag });
            setAvailableTags((prev) => [...prev, newTag]);
        }
        if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
        setNewTag("");
    };

    // Handle file upload
    const handleUpload = async (e) => {
        e.preventDefault();
        setUploading(true);
        setSuccessMsg("");

        if (!files.length) {
            setUploading(false);
            setSuccessMsg("⚠️ Please attach file(s) before uploading.");
            return;
        }

        const invalidFiles = files.filter((f) => !allowedMimes.includes(f.type));
        if (invalidFiles.length > 0) {
            setUploading(false);
            setSuccessMsg(`❌ One or more files have unsupported types.`);
            return;
        }

        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) {
            setUploading(false);
            setSuccessMsg("❌ User not authenticated.");
            return;
        }

        if (!vaultCode) {
            setUploading(false);
            setSuccessMsg("❌ Please enter your Vault Code to encrypt.");
            return;
        }

        const fileMetas = []; // to hold file info: url, iv, name
        let noteIv = ""; // optional IV for private note
        let uploadedCount = 0;

        for (const file of files) {
            const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
            const { encryptedBlob, ivHex } = await encryptFile(file, vaultCode, ivBytes);

            const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
            const filePath = `${userId}/${Date.now()}-${sanitizedName}`;

            const { error: uploadError } = await supabase.storage
                .from("vaulted")
                .upload(filePath, encryptedBlob, { contentType: file.type });

            if (uploadError) {
                console.error(uploadError);
                continue;
            }

            const { data } = supabase.storage.from("vaulted").getPublicUrl(filePath);
            if (data?.publicUrl) {
                fileMetas.push({
                name: file.name,
                url: data.publicUrl,
                iv: ivHex,
                });
            }
        }

        if (!fileMetas.length) {
            setUploading(false);
            setSuccessMsg("❌ Upload failed for all files.");
            return;
        } else if (uploadedCount < files.length) {
            setSuccessMsg(`⚠️ Only ${uploadedCount} of ${files.length} files uploaded successfully.`);
        }

        // Encrypt private note (if provided)
        let encryptedNote = "";
        if (privateNote) {
            const result = await encryptText(privateNote, vaultCode);
            encryptedNote = result.encryptedData;
            noteIv = result.iv;
        }

        const { error: insertError } = await supabase.from("vault_items").insert({
            user_id: userId,
            file_name: files.map((f) => f.name).join(", "),
            file_metas: fileMetas, // ✅ instead of file_urls
            title,
            tags,
            notes,
            encrypted_note: encryptedNote,
            note_iv: noteIv,
            created_at: new Date().toISOString()
        });

        if (insertError) {
            console.error(insertError);
            setSuccessMsg("❌ Failed to save document.");
        } else {
            setSuccessMsg("✅ Files uploaded successfully!");
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

            <h2 className="text-xl font-semibold text-gray-800 mb-4">📤 Upload to My Private Vault</h2>
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
                    onChange={(e) => setFiles(Array.from(e.target.files))}
                    className="w-full border border-gray-300 p-2 rounded text-gray-500"
                />

                {/* File input */}
                <div>
                    <label className="block text-sm font-medium mb-1 text-gray-800 mt-4">Document title:</label>
                    <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full p-2 border rounded text-gray-700"
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

                    {/* Selected Tags */}
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            {tags.map((tag) => (
                                <span
                                key={tag}
                                className="bg-purple-100 text-gray-800 text-xs px-3 py-1 rounded-full flex items-center gap-1"
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
                    <textarea
                        value={privateNote}
                        onChange={(e) => setPrivateNote(e.target.value)}
                        placeholder="Private notes (For your eyes only)"
                        rows={2}
                        className="bg-gray-50 w-full border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400"
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
                        onChange={(e) => setVaultCode(e.target.value)}
                        className="w-full p-2 border rounded mb-3 text-gray-600"
                        placeholder="Vault code"
                    />
                </div>

                {/* Upload */}
                <button
                    type="submit"
                    disabled={uploading}
                    className="bg-purple-600 text-white w-full py-2 rounded hover:bg-purple-700 transition"
                    >
                    {uploading ? (
                        <span className="flex justify-center items-center gap-2">
                        <Loader2 className="animate-spin" size={16} /> Uploading...
                        </span>
                    ) : (
                        "Upload Document(s)"
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

