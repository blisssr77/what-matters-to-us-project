import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { decryptText, encryptText } from "../../utils/encryption";
import Layout from "../Layout/Layout";
import { X, Search } from "lucide-react";
import bcrypt from "bcryptjs";

export default function VaultEditNote() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [vaultCode, setVaultCode] = useState("");
    const [noteData, setNoteData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [editedTitle, setEditedTitle] = useState("");
    const [editedNote, setEditedNote] = useState("");
    const [toastMessage, setToastMessage] = useState("");
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);


    // Tag-related
    const [availableTags, setAvailableTags] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);
    const [newTag, setNewTag] = useState("");

    const tagBoxRef = useRef(null);

    // Load vault code from session storage on mount
    useEffect(() => {
        const storedCode = sessionStorage.getItem("vaultCode");
        if (storedCode && noteData) {
            handleDecrypt(storedCode);
        }
    }, [noteData]);

    // Fetch note data and available tags on mount
    useEffect(() => {
        const fetchNote = async () => {
            const { data: note, error } = await supabase
                .from("vault_items")
                .select("*")
                .eq("id", id)
                .single();
                console.log("Fetched note in Edit Page:", note);

            if (error) {
                console.error("Error fetching note:", error);
                setErrorMsg("Failed to load note.");
            } else {
                setNoteData(note);
                setSelectedTags(note.tags || []);
                setEditedTitle(note.title || "");
            }
        };

        const fetchTags = async () => {
            const { data, error } = await supabase.from("vault_tags").select("*");
            if (!error) setAvailableTags(data.map((tag) => tag.name));
        };

        fetchNote();
        fetchTags();
    }, [id]);

    // Decrypt note when vault code and note data are available
    useEffect(() => {
        if (vaultCode && noteData) {
            handleDecrypt();
            console.log("🔍 noteData updated:", noteData);
        }
    }, [vaultCode, noteData]);

    // Handle vault code change
    const handleDecrypt = async (code) => {
        setLoading(true);
        setErrorMsg("");

        const {
            data: { user },
        } = await supabase.auth.getUser();

        const { data: vaultCodeRow, error: codeError } = await supabase
            .from("vault_codes")
            .select("private_code")
            .eq("id", user.id)
            .single();

        if (codeError || !vaultCodeRow?.private_code) {
            setErrorMsg("❌ Vault code not set.");
            setLoading(false);
            return;
        }

        const isMatch = await bcrypt.compare(code, vaultCodeRow.private_code);
        if (!isMatch) {
            setErrorMsg("Incorrect Vault Code.");
            setLoading(false);
            return;
        }

        try {
            const ivToUse = noteData.note_iv || noteData.iv;
            const decrypted = await decryptText(noteData.encrypted_note, ivToUse, code);

            console.log("✅ Decrypted note:", decrypted);
            setEditedNote(decrypted);
            setEditedTitle(noteData.title || "");
        } catch (err) {
            console.error("❌ Decryption error:", err);
            setErrorMsg("Failed to decrypt note.");
        }

        setLoading(false);
    };

    // Handle saving the edited note
    const handleSave = async () => {
        setSaving(true);
        setErrorMsg("");

        if (!vaultCode.trim()) {
            setErrorMsg("Vault Code is required to save the note.");
            setSaving(false);
            return;
        }

        const {
            data: { user },
        } = await supabase.auth.getUser();

        // Step 1: Fetch hashed vault code
        const { data: vaultCodeRow, error: codeError } = await supabase
            .from("vault_codes")
            .select("private_code")
            .eq("id", user.id)
            .single();

        if (codeError || !vaultCodeRow?.private_code) {
            setErrorMsg("Vault Code not set or fetch failed.");
            setSaving(false);
            return;
        }

        // Step 2: Compare input vaultCode with hashed version
        const isMatch = await bcrypt.compare(vaultCode, vaultCodeRow.private_code);
        if (!isMatch) {
            setErrorMsg("❌ Incorrect Vault Code.");
            setSaving(false);
            return;
        }

        try {
            // Step 3: Encrypt and save
            const { encryptedData, iv } = await encryptText(editedNote, vaultCode);

            const updatedTags = selectedTags
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0);

            const { error: updateError } = await supabase
                .from("vault_items")
                .update({
                    title: editedTitle,
                    tags: updatedTags,
                    encrypted_note: encryptedData,
                    note_iv: iv,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", id);

            if (updateError) {
                console.error("❌ Update error:", updateError);
                setErrorMsg("Failed to update note.");
            } else {
                setSuccessMsg("✅ Note updated successfully!");
                setTimeout(() => {
                    navigate(`/private/vaults/note-view/${id}`);
                }, 1300);
            }
        } catch (err) {
            console.error("❌ Encryption error:", err);
            setErrorMsg("Encryption failed.");
            
        } finally {
            setSaving(false);
            setHasUnsavedChanges(false);
        }
    };

    // Handle tag addition
    const handleTagAdd = async () => {
        if (!newTag.trim()) return;

        if (!availableTags.includes(newTag)) {
            await supabase.from("vault_tags").insert({ name: newTag });
            setAvailableTags((prev) => [...prev, newTag]);
        }

        if (!selectedTags.includes(newTag)) {
            setSelectedTags((prev) => [...prev, newTag]);
        }

        setNewTag("");
    };

    return (
        <Layout>
            {/* Unsaved changes popup */}
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

            <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded shadow-lg z-50 transition duration-300 ${toastMessage ? "opacity-100 bg-green-500" : "opacity-0"} text-white`}>
                {toastMessage}
            </div>

            <div className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
                {/* Close button */}
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

                <h2 className="text-xl font-bold mb-5 text-gray-900">✏️ Edit Note</h2>

                <label className="text-sm font-medium text-gray-800 mb-1 block">Note title:</label>
                <input
                    value={editedTitle}
                    onChange={(e) => {
                        setEditedTitle(e.target.value);
                        setHasUnsavedChanges(true);
                    }}
                    className="w-full p-2 border rounded mb-3 text-gray-800 font-semibold text-sm bg-gray-50"
                    placeholder="Title"
                />

                <p className="text-sm text-red-400 mb-1">
                    🔐 <strong>Private note</strong> will be encrypted using your saved Vault Code:
                </p>
                <textarea
                    value={editedNote}
                    onChange={(e) => {
                        setEditedNote(e.target.value);
                        setHasUnsavedChanges(true);
                    }}
                    rows="8"
                    className="w-full p-3 border rounded bg-gray-50 text-sm font-medium text-gray-800 leading-relaxed mb-3"
                    placeholder="Edit your note..."
                />

                <div className="mb-4">
                    <label className="text-sm font-medium text-gray-800 mb-1 block">Tags:</label>

                    <div className="relative flex items-center gap-2 mb-2">
                        <Search className="absolute left-3 text-gray-400" size={16} />
                        <input
                            type="text"
                            value={newTag}
                            onChange={(e) => {
                                setNewTag(e.target.value);
                                setHasUnsavedChanges(true);
                            }}
                            placeholder="Search or create new tag"
                            className="w-full pl-8 border border-gray-300 p-2 text-gray-700 rounded text-sm"
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
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50 mb-1">
                        {availableTags
                            .filter(tag => tag.toLowerCase().includes(newTag.toLowerCase()) && !selectedTags.includes(tag))
                            .map(tag => (
                                <div key={tag} className="flex items-center gap-2 py-1">
                                    <input
                                        type="checkbox"
                                        checked={selectedTags.includes(tag)}
                                        onChange={() => {
                                            setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
                                            setHasUnsavedChanges(true);
                                        }}
                                    />
                                    <span className="text-xs text-gray-700">{tag}</span>
                                </div>
                            ))}
                    </div>

                    {selectedTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            {selectedTags.map(tag => (
                                <span key={tag} className="bg-yellow-50 text-gray-800 text-xs px-3 py-1 rounded-full flex items-center gap-1">
                                    {tag}
                                    <X size={12} className="cursor-pointer" onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))} />
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Vault Code */}
                <div>
                    <label className="block text-sm font-medium mb-1 text-gray-800">
                        Re-enter <strong>Private</strong> vault code to encrypt:
                    </label>
                    <input
                        type="password"
                        value={vaultCode}
                        onChange={(e) => setVaultCode(e.target.value)}
                        className="w-full p-2 border font-medium rounded mb-3 text-gray-600 text-sm bg-gray-50"
                        placeholder="Vault code"
                        autoComplete="off"
                    />
                </div>

                <div className="flex gap-4 mt-4">
                    <button onClick={handleSave} className="btn-secondary w-full mt-3" disabled={saving}>
                        Save Note
                    </button>
                </div>
                <br />
                {successMsg && (
                <p className="text-sm text-green-600 text-center">{successMsg}</p>
                )}
                {errorMsg && (
                    <p className="text-sm text-red-600 text-center">{errorMsg}</p>
                )}
            </div>
        </Layout>
    );
}