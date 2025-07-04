import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { Loader2, X, Search } from "lucide-react";

export default function VaultedFileUpload() {
    const [file, setFile] = useState(null);
    const [tags, setTags] = useState([]);
    const [availableTags, setAvailableTags] = useState([]);
    const [newTag, setNewTag] = useState("");
    const [notes, setNotes] = useState("");
    const [privateNote, setPrivateNote] = useState("");
    const [uploading, setUploading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [dragging, setDragging] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
        const fetchTags = async () => {
        const { data, error } = await supabase.from("vault_tags").select("*");
        if (!error) setAvailableTags(data.map((tag) => tag.name));
        };
        fetchTags();
    }, []);

    const handleFileDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) setFile(droppedFile);
    };

    const handleTagAdd = async () => {
        if (!newTag.trim()) return;
        if (!availableTags.includes(newTag)) {
        await supabase.from("vault_tags").insert({ name: newTag });
        setAvailableTags((prev) => [...prev, newTag]);
        }
        if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
        setNewTag("");
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        setUploading(true);
        setSuccessMsg("");

        if (!file) {
            setUploading(false);
            setSuccessMsg("⚠️ Please attach a file before uploading.");
            return;
        }

        const {
            data: { user },
        } = await supabase.auth.getUser();

        const userId = user?.id;
        console.log("User ID:", userId);

        const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
        const filePath = `${userId}/${Date.now()}-${sanitizedName}`;

        const { error: uploadError } = await supabase.storage
            .from("vaulted")
            .upload(filePath, file);

        if (uploadError) {
            console.error(uploadError);
            setUploading(false);
            setSuccessMsg("❌ Upload failed.");
            return;
        }

        const { data } = supabase.storage.from("vaulted").getPublicUrl(filePath);
        const publicUrl = data?.publicUrl;

        const { error: insertError } = await supabase.from("vaulted_documents").insert({
            user_id: userId,
            name: file.name,
            file_url: publicUrl,
            tags,
            notes,
            private_note: privateNote,
            created_at: new Date().toISOString(),
        });

        if (insertError) {
            console.error(insertError);
            setSuccessMsg("❌ Failed to save document.");
        } else {
            setSuccessMsg("✅ File uploaded successfully!");
            setTimeout(() => navigate("/private/vaults"), 1300);
        }

        setUploading(false);
    };

    return (
        <div className="max-w-xl mx-auto mt-10 p-6 bg-white rounded-xl shadow-lg border border-gray-200">
        <h2 className="text-xl font-semibold text-purple-600 mb-4">📤 Upload to My Vault</h2>

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
            {file ? (
                <span className="text-sm ">{file.name}</span>
            ) : (
                <span className="text-sm">Drag & Drop your file here or use browse below</span>
            )}
            </div>

            <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            className="w-full border border-gray-300 p-2 rounded text-gray-500"
            />

            {/* Tag Input Section */}
            <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Tags</label>

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
                    className="ml-2 px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
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
            <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Public Notes (visible to shared contacts)"
            rows={2}
            className="w-full border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400"
            />

            <textarea
            value={privateNote}
            onChange={(e) => setPrivateNote(e.target.value)}
            placeholder="Private Notes (for your eyes only)"
            rows={2}
            className="w-full border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400"
            />

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
                "Upload Document"
            )}
            </button>

            {successMsg && (
            <p className="text-sm text-green-600 text-center">{successMsg}</p>
            )}
        </form>
        </div>
    );
}

