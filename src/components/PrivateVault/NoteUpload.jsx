import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { X, Search } from "lucide-react";

const VaultedNoteUpload = () => {
    const [title, setTitle] = useState("");
    const [privateNote, setPrivateNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [newTag, setNewTag] = useState("");
    const [tags, setTags] = useState([]);
    const [availableTags, setAvailableTags] = useState([]);
    const [successMsg, setSuccessMsg] = useState("");

    const navigate = useNavigate();

    useEffect(() => {
        const fetchTags = async () => {
        const { data, error } = await supabase.from("vault_tags").select("*");
        if (!error) setAvailableTags(data.map((tag) => tag.name));
        };
        fetchTags();
    }, []);

    const handleTagAdd = async () => {
        if (!newTag.trim()) return;
        if (!availableTags.includes(newTag)) {
        await supabase.from("vault_tags").insert({ name: newTag });
        setAvailableTags((prev) => [...prev, newTag]);
        }
        if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
        setNewTag("");
    };

    const handleCreate = async () => {
        setLoading(true);
        setSuccessMsg("");

        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase.from("vaulted_notes").insert({
        user_id: user?.id,
        title,
        private_note: privateNote,
        tags,
        created_at: new Date().toISOString(),
        });

        setLoading(false);
        if (error) {
        console.error(error);
        setSuccessMsg("❌ Failed to create note.");
        } else {
        setSuccessMsg("✅ Note created successfully!");
        setTimeout(() => navigate("/private/vaults"), 1300);
        }
    };

    return (
        <div className="max-w-xl mx-auto mt-10 p-6 bg-white rounded shadow border border-gray-200">
        <h2 className="text-xl font-bold mb-4 text-purple-700">📝 Create Note</h2>

        <label className="block text-sm font-medium mb-1 text-gray-500">Title</label>
        <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-2 mb-4 border rounded text-gray-700"
            placeholder="Enter note title"
        />

        <label className="block text-sm font-medium mb-1 text-gray-500">Note</label>
        <textarea
            value={privateNote}
            onChange={(e) => setPrivateNote(e.target.value)}
            rows="6"
            className="w-full p-2 border rounded mb-4 text-gray-700"
            placeholder="Write your note here..."
        />

        {/* Tag Section */}
        <div>
            <label className="text-sm font-medium text-gray-500 mb-1 block">Tags</label>

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

            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
            {availableTags
                .filter((tag) => tag.toLowerCase().includes(newTag.toLowerCase()) && !tags.includes(tag))
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

        <button
            onClick={handleCreate}
            disabled={loading}
            className="mt-6 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 w-full"
        >
            {loading ? "Creating..." : "Save Note"}
        </button>

        {successMsg && (
            <p className="text-sm text-center mt-3 text-green-600">{successMsg}</p>
        )}
        </div>
    );
};

export default VaultedNoteUpload;
