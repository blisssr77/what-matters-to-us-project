import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { X, Search } from "lucide-react";
import { encryptText } from "../../utils/encryption";
import Layout from "../Layout/Layout";
import { file } from "jszip";
import bcrypt from "bcryptjs"; 

const WorkspaceUploadNote = () => {
    const [title, setTitle] = useState("");
    const [privateNote, setPrivateNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [newTag, setNewTag] = useState("");
    const [tags, setTags] = useState([]);
    const [availableTags, setAvailableTags] = useState([]);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [vaultCode, setVaultCode] = useState("");
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);


    const navigate = useNavigate();

    // Fetch available tags on component mount
    useEffect(() => {
        const fetchTags = async () => {
        const { data, error } = await supabase.from("vault_tags").select("*").eq("workspace_id", activeWorkspaceId);
        if (!error) setAvailableTags(data.map((tag) => tag.name));
        };
        fetchTags();
    }, []);

    // Handle adding a new tag
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
                workspace_id: activeWorkspaceId, // Assuming activeWorkspaceId is defined in your context
            });
            setAvailableTags((prev) => [...prev, newTag]);
        }

        // Add to local tag list if not already added
        if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
        setNewTag("");
    };

    // Handle creating the note
    const handleCreate = async () => {
        setLoading(true);
        setSuccessMsg("");
        setErrorMsg("");

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user || !vaultCode.trim()) {
            setErrorMsg("Missing user or vault code.");
            setLoading(false);
            return;
        }

        // Step 1: Fetch hashed vault code from Supabase
        const { data: vaultCodeRow, error: codeError } = await supabase
            .from("vault_codes")
            .select("private_code")
            .eq("id", user.id)
            .single();

        if (codeError || !vaultCodeRow?.private_code) {
            setErrorMsg("Vault code not found.");
            setLoading(false);
            return;
        }

        // Step 2: Validate input vaultCode against hash
        const isMatch = await bcrypt.compare(vaultCode, vaultCodeRow.private_code);
        if (!isMatch) {
            setErrorMsg("Incorrect Vault Code.");
            setLoading(false);
            return;
        }

        // Step 3: Encrypt and save note
        try {
            const { encryptedData, iv } = await encryptText(privateNote, vaultCode);

            const { error } = await supabase.from("workspace_vault_items").insert({
                user_id: user.id,
                file_name: title || "Untitled Note",
                title,
                encrypted_note: encryptedData,
                note_iv: iv,
                tags,
                workspace_id: activeWorkspaceId, 
                created_by: user.id
            });

            if (error) {
                console.error(error);
                setErrorMsg("Failed to create note.");
            } else {
                setSuccessMsg("Note created successfully!");
                setTimeout(() => navigate("/private/vaults"), 1300);
            }
        } catch (err) {
            console.error("Encryption failed:", err);
            setErrorMsg("Encryption error.");
        } finally {
            setLoading(false);
            setHasUnsavedChanges(false);
        }
    };

    return (
        <Layout>
            {/* Unsaved Changes Popup */}
            {showUnsavedPopup && (
                <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
                    <p className="mt-10 text-gray-800">
                    You have unsaved changes. Are you sure you want to leave?
                    </p>
                    <div className="flex gap-3 justify-end mt-4">
                    <button
                        onClick={() => navigate("/private/vaults")}
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
                        navigate("/private/vaults");
                        }
                    }}
                    className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                    >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold mb-4 text-gray-800">📝 Upload to Workspace Vault</h2>

                <label className="block text-sm font-medium mb-1 text-gray-700">Note title:</label>
                <input
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value);
                        setHasUnsavedChanges(true);
                    }}
                    className="w-full p-2 mb-4 border rounded text-gray-700 text-sm bg-gray-50"
                    placeholder="Enter note title (Public)"
                />

                <p className="text-sm text-red-400 mb-1">
                    🔐 <strong>Private note</strong> will be encrypted using your saved Vault Code:
                </p>
                <textarea
                    value={privateNote}
                    onChange={(e) => {
                        setPrivateNote(e.target.value);
                        setHasUnsavedChanges(true);
                    }}
                    rows="6"
                    className="w-full p-2 border bg-gray-50 rounded mb-3 text-gray-700 text-sm"
                    placeholder="Write your note here.."
                />

                {/* Tag Section */}
                <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Add tags:</label>

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
                        className="w-full pl-8 border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
                    />
                    <button
                        type="button"
                        onClick={handleTagAdd}
                        className="btn-secondary text-sm"
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
                            onChange={() => {
                                setHasUnsavedChanges(true);
                                setTags((prev) =>
                                prev.includes(tag)
                                    ? prev.filter((t) => t !== tag)
                                    : [...prev, tag]
                                )
                            }}
                            />
                            <span className="text-xs text-gray-700">{tag}</span>
                        </div>
                        ))}
                    </div>

                    {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {tags.map((tag) => (
                        <span
                            key={tag}
                            className="bg-yellow-50 text-gray-800 text-xs px-3 py-1 rounded-full flex items-center gap-1"
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

                {/* Vault Code Section */}
                <label className="block text-sm font-medium mb-1 text-gray-700">
                    Enter <strong>Private</strong> vault code to encrypt note:
                </label>
                <input
                    type="password"
                    value={vaultCode}
                    onChange={(e) => setVaultCode(e.target.value)}
                    className="w-full p-2 border rounded mb-3 text-gray-600 text-sm bg-gray-50"
                    placeholder="Vault code"
                />

                <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="btn-secondary w-full mt-4"
                >
                    {loading ? "Creating..." : "Upload Note"}
                </button>

                <br />
                {successMsg && (
                    <p className="text-sm text-center mt-3 text-green-600">{successMsg}</p>
                )}
                {errorMsg && (
                    <p className="text-sm text-center mt-3 text-red-600">{errorMsg}</p>
                )}
            </div>
        </Layout>
    );
};

export default WorkspaceUploadNote;
