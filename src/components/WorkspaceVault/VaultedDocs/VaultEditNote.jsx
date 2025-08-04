import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText, encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { X, Search } from "lucide-react";
import bcrypt from "bcryptjs";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";

export default function WorkspaceEditNote() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [vaultCode, setVaultCode] = useState("");
    const [noteData, setNoteData] = useState(null); // Note data fetched from Supabase
    const [notes, setNotes] = useState(""); // Public notes
    const [loading, setLoading] = useState(false);
    const [editedTitle, setEditedTitle] = useState("");
    const [editedNote, setEditedNote] = useState("");
    const [toastMessage, setToastMessage] = useState("");
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);
    const [isVaulted, setIsVaulted] = useState(false);

    const { activeWorkspaceId } = useWorkspaceStore();

    // Tag-related
    const [availableTags, setAvailableTags] = useState([]);
    const [newTag, setNewTag] = useState("");
    const [tags, setTags] = useState([]);

    const tagBoxRef = useRef(null);

    // Load vault code from session storage on mount
    useEffect(() => {
        const storedCode = sessionStorage.getItem("vaultCode");
        if (
            storedCode &&
            noteData?.is_vaulted &&
            noteData?.encrypted_note &&
            noteData?.note_iv
        ) {
            handleDecrypt(storedCode);
        }
    }, [noteData]);

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

    // Fetch note data and available tags on mount
    useEffect(() => {
        const fetchNote = async () => {
            const { data: note, error } = await supabase
                .from("workspace_vault_items")
                .select("*")
                .eq("id", id)
                .single();
                console.log("Fetched note in Edit Page:", note);

            if (error) {
                console.error("Error fetching note:", error);
                setErrorMsg("Failed to load note.");
            } else {
                setNoteData(note);
                setTags(note.tags || []);
                setEditedTitle(note.title || "");
                setIsVaulted(note.is_vaulted || false);
                setNotes(note.notes || "");
            }
        };

        const fetchTags = async () => {
            const { data, error } = await supabase.from("vault_tags").select("*").eq("workspace_id", activeWorkspaceId);
            if (!error) setAvailableTags(data.map((tag) => tag.name));
        };

        fetchNote();
        fetchTags();
    }, [id]);

    // Handle vault code change
    const handleDecrypt = async (code = vaultCode) => {
        if (!noteData?.is_vaulted) {
            console.warn("Note is not vaulted. Skipping decryption.");
            return;
        }

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
            setErrorMsg("Vault code not set.");
            setLoading(false);
            return;
        }

        const isMatch = await bcrypt.compare(code.trim(), vaultCodeRow.private_code);
        if (!isMatch) {
            setErrorMsg("Incorrect Vault Code.");
            setLoading(false);
            return;
        }

        try {
            const ivToUse = noteData.note_iv || noteData.iv;
            const decrypted = await decryptText(noteData.encrypted_note, ivToUse, code);

            setEditedNote(decrypted);
            setEditedTitle(noteData.title || "");
        } catch (err) {
            console.error("Decryption error:", err);
            setErrorMsg("Failed to decrypt note.");
        }

        setLoading(false);
    };


    // Handle saving the edited note
    const handleSave = async () => {
        setSaving(true);
        setErrorMsg("");

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) {
            setErrorMsg("User not authenticated.");
            setSaving(false);
            return;
        }

        // Vaulted note requires Vault Code
        if (isVaulted) {
            if (!vaultCode.trim()) {
                setErrorMsg("Vault Code is required to save the note.");
                setSaving(false);
                return;
            }

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
                setErrorMsg("Incorrect Vault Code.");
                setSaving(false);
                return;
            }
        }

        // Step 3: Encrypt if needed
        let encryptedData = "";
        let iv = "";

        if (isVaulted) {
            const encrypted = await encryptText(editedNote, vaultCode);
            encryptedData = encrypted.encryptedData;
            iv = encrypted.iv;
        }

        try {
            const updatedTags = tags
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0);

            // Step 4: Save to DB
            const { error: updateError } = await supabase
                .from("workspace_vault_items")
                .update({
                    title: editedTitle,
                    tags: updatedTags,
                    notes, // public note
                    encrypted_note: encryptedData, // only if vaulted
                    note_iv: iv,                   // only if vaulted
                    updated_at: new Date().toISOString(),
                    is_vaulted: isVaulted,
                })
                .eq("id", id)
                .eq("workspace_id", activeWorkspaceId);

            if (updateError) {
                console.error("Update error:", updateError);
                if (isVaulted) {
                    setErrorMsg("Failed to update note.");
                }
            } else {
                setSuccessMsg("Note updated successfully!");
                setTimeout(() => {
                    navigate(`/workspace/vaults/`);
                }, 1300);
            }
        } catch (err) {
            console.error("Encryption error:", err);
            setErrorMsg("Encryption failed.");
        } finally {
            setSaving(false);
            setHasUnsavedChanges(false);
        }
    };

    // Handle tag addition
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
                        onClick={() => navigate("/workspace/vaults")}
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
                        navigate("/workspace/vaults");
                        }
                    }}
                    className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                    >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold mb-5 text-gray-900">✏️ Edit Note</h2>

                {/* Title Input Section */}
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

                {/* Tag Input Section */}
                <div className="mb-4">
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
                            className="btn-secondary"
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

                {/* Vaulted Note Section */}
                {isVaulted && (
                    <>
                    {/* Private Note Input */}
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
                    </>
                )}

                <div className="flex gap-4 mt-4">
                    <button onClick={handleSave} className="btn-secondary w-full mt-3" disabled={loading}>
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