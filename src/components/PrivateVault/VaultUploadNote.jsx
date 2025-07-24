import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { X, Search } from "lucide-react";
import { encryptText } from "../../utils/encryption";
import Layout from "../Layout/Layout";

const VaultedNoteUpload = () => {
    const [title, setTitle] = useState("");
    const [privateNote, setPrivateNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [newTag, setNewTag] = useState("");
    const [tags, setTags] = useState([]);
    const [availableTags, setAvailableTags] = useState([]);
    const [successMsg, setSuccessMsg] = useState("");
    const [vaultCode, setVaultCode] = useState("");


    const navigate = useNavigate();

    // Fetch available tags on component mount
    useEffect(() => {
        const fetchTags = async () => {
        const { data, error } = await supabase.from("vault_tags").select("*");
        if (!error) setAvailableTags(data.map((tag) => tag.name));
        };
        fetchTags();
    }, []);

    // Handle adding a new tag
    const handleTagAdd = async () => {
        if (!newTag.trim()) return;
        if (!availableTags.includes(newTag)) {
        await supabase.from("vault_tags").insert({ name: newTag });
        setAvailableTags((prev) => [...prev, newTag]);
        }
        if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
        setNewTag("");
    };

    // Encrypt the note before saving
    const handleCreate = async () => {
        setLoading(true);
        setSuccessMsg("");

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user || !vaultCode) {
            setSuccessMsg("❌ Missing user or vault code");
            setLoading(false);
            return;
        }

        const { encryptedData, iv } = await encryptText(privateNote, vaultCode); // ✅ Use vaultCode

        const { error } = await supabase.from("vaulted_notes").insert({
            user_id: user.id,
            title,
            encrypted_note: encryptedData,
            note_iv: iv, // ✅ save IV under note_iv
            tags,
        });

        setLoading(false);
        if (error) {
            console.error(error);
            setSuccessMsg("❌ Failed to create note");
        } else {
            setSuccessMsg("✅ Note created successfully!");
            setTimeout(() => navigate("/private/vaults"), 1300);
        }
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
            <h2 className="text-xl font-bold mb-4 text-gray-800">📝 Upload to My Private Vault</h2>

            <label className="block text-sm font-medium mb-1 text-gray-700">Title</label>
            <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2 mb-4 border rounded text-gray-700"
                placeholder="Enter note title (Public)"
            />

             <p className="text-sm text-red-400 mb-4">
                🔐 Private Note will be encrypted using your saved Vault Code. 
            </p>
            <label className="block text-sm font-medium mb-1 text-gray-700">Private Note</label>
            <textarea
                value={privateNote}
                onChange={(e) => setPrivateNote(e.target.value)}
                rows="6"
                className="w-full p-2 border bg-gray-50 rounded mb-4 text-gray-700"
                placeholder="Write your note here..."
            />

            {/* Vault Code Section */}
            <label className="block text-sm font-medium mb-1 text-gray-700">
                Enter <strong>Private</strong> Vault Code to Encrypt Note
            </label>
            <input
                type="password"
                value={vaultCode}
                onChange={(e) => setVaultCode(e.target.value)}
                className="w-full p-2 border rounded mb-3 text-gray-600"
                placeholder="Vault Code"
            />

            {/* Tag Section */}
            <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Add tags</label>

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
                    className="ml-2 px-3 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
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
    </Layout>
    );
};

export default VaultedNoteUpload;
