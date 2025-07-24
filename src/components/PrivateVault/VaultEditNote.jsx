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
    const [errorMsg, setErrorMsg] = useState("");
    const [loading, setLoading] = useState(false);
    const [editedTitle, setEditedTitle] = useState("");
    const [editedNote, setEditedNote] = useState("");
    const [toastMessage, setToastMessage] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // Tag-related
    const [availableTags, setAvailableTags] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);
    const [newTag, setNewTag] = useState("");

    const tagBoxRef = useRef(null);

    // Load vault code from session storage on mount
    useEffect(() => {
        const storedCode = sessionStorage.getItem("vaultCode");
        console.log("🔑 Loaded vaultCode from sessionStorage:", storedCode);
        if (storedCode) setVaultCode(storedCode);
    }, []);

    // Fetch note data and available tags on mount
    useEffect(() => {
        const fetchNote = async () => {
            const { data: note, error } = await supabase
                .from("vaulted_notes")
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
    const handleDecrypt = async () => {
        setLoading(true);
        setErrorMsg("");

        const {
            data: { user },
        } = await supabase.auth.getUser();
        console.log("🔐 User ID:", user.id);

        const { data: vaultCodeRow, error: codeError } = await supabase
            .from("vault_codes")
            .select("private_code")
            .eq("id", user.id)
            .single();

        console.log("🔐 Running handleDecrypt()");

        if (codeError || !vaultCodeRow?.private_code) {
            setErrorMsg("❌ Vault code not set.");
            setLoading(false);
            return;
        }

        const isMatch = await bcrypt.compare(vaultCode, vaultCodeRow.private_code);
        if (!isMatch) {
            setErrorMsg("Incorrect Vault Code.");
            setLoading(false);
            return;
        }

        if (!noteData) {
            console.error("❌ Note data not yet loaded");
            setErrorMsg("Please wait for note data to load.");
            setLoading(false);
            return;
        }

        try {
            const ivToUse = noteData.note_iv || noteData.iv; // ✅ fallback for backward compatibility

            const decrypted = await decryptText(
            noteData.encrypted_note,
            ivToUse,
            vaultCode
            );

            console.log("✅ Decrypted note:", decrypted);
            setEditedNote(decrypted);
            setEditedTitle(noteData.title || "");
        } catch (err) {
            console.error("❌ Decryption error:", err);
            setErrorMsg("Failed to decrypt note.");
        }

        setLoading(false);
    };


    // Handle vault code change
    const handleSave = async () => {
        setSaving(true);
        setError("");

        const {
            data: { user },
        } = await supabase.auth.getUser();

        try {
            const { encryptedData, iv } = await encryptText(editedNote, vaultCode);

            const updatedTags = selectedTags
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0);

            const { error: updateError } = await supabase
            .from("vaulted_notes")
            .update({
                title: editedTitle,
                tags: updatedTags,
                encrypted_note: encryptedData,
                note_iv: iv, // ✅ save as note_iv instead of iv
                updated_at: new Date().toISOString(),
            })
            .eq("id", id);

            if (updateError) {
            console.error("❌ Update error:", updateError);
            setError("Failed to update note.");
            } else {
            console.log("🔐 Encrypted Note:", encryptedData);
            console.log("🧂 Note IV:", iv);
            setSuccessMsg("✅ Note updated successfully!");
            setTimeout(() => {
                navigate(`/private/vaults/note-view/${id}`);
            }, 1300);
            }
        } catch (err) {
            console.error("❌ Encryption error:", err);
            setError("Encryption failed.");
        } finally {
            setSaving(false);
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
            <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded shadow-lg z-50 transition duration-300 ${toastMessage ? "opacity-100 bg-green-500" : "opacity-0"} text-white`}>
                {toastMessage}
            </div>

            <div className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
                <button onClick={() => navigate(-1)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold mb-4 text-gray-800">✏️ Edit Note</h2>

                <input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="w-full p-2 border rounded mb-3  text-gray-800 font-semibold"
                    placeholder="Title"
                />

                <textarea
                    value={editedNote}
                    onChange={(e) => setEditedNote(e.target.value)}
                    rows="8"
                    className="w-full p-3 border rounded bg-gray-50 text-sm text-gray-800 leading-relaxed mb-4"
                    placeholder="Edit your note..."
                />

                <div className="mb-4">
                    <label className="text-sm font-medium text-gray-600 mb-1 block">Tags</label>

                    <div className="relative flex items-center gap-2 mb-2">
                        <Search className="absolute left-3 text-gray-400" size={16} />
                        <input
                            type="text"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            placeholder="Search or create new tag"
                            className="w-full pl-8 border border-gray-300 p-2 text-gray-700 rounded text-sm"
                        />
                        <button
                            type="button"
                            onClick={handleTagAdd}
                            className="ml-2 px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
                        >
                            Create
                        </button>
                    </div>

                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
                        {availableTags
                            .filter(tag => tag.toLowerCase().includes(newTag.toLowerCase()) && !selectedTags.includes(tag))
                            .map(tag => (
                                <div key={tag} className="flex items-center gap-2 py-1">
                                    <input
                                        type="checkbox"
                                        checked={selectedTags.includes(tag)}
                                        onChange={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                    />
                                    <span className="text-sm text-gray-700">{tag}</span>
                                </div>
                            ))}
                    </div>

                    {selectedTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            {selectedTags.map(tag => (
                                <span key={tag} className="bg-purple-100 text-gray-800 text-xs px-3 py-1 rounded-full flex items-center gap-1">
                                    {tag}
                                    <X size={12} className="cursor-pointer" onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))} />
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex gap-4 mt-4">
                    <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                        Save
                    </button>
                    <button onClick={() => navigate(`/private/vaults/note-view/${id}`)} className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                        Cancel
                    </button>
                </div>
            </div>
        </Layout>
    );
}