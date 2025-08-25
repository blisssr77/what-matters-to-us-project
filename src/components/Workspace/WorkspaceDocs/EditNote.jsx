import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText, encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { X, Search } from "lucide-react";
import bcrypt from "bcryptjs";
import { useWorkspaceStore } from "../../../hooks/useWorkspaceStore";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";

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

    // Ensure selected tags are visible even if legacy/user-only
    const tagOptions = useMemo(
        () => Array.from(new Set([...(availableTags || []), ...(tags || [])])),
        [availableTags, tags]
    );

    // Handle decryption
    const handleDecrypt = async (codeParam = vaultCode) => {
        if (!noteData?.is_vaulted) {
            console.warn("Note is not vaulted. Skipping decryption.");
            return;
        }

        const code = String(codeParam || "").trim();
        if (!code) {
            setErrorMsg("Please enter your Vault Code.");
            return;
        }

        setLoading(true);
        setErrorMsg("");

        // 1) Verify against the per-user workspace code (and membership)
        const { data: ok, error } = await supabase.rpc("verify_workspace_code", {
            p_workspace: activeWorkspaceId,
            p_code: code,
        });

        if (error) {
            setLoading(false);
            setErrorMsg(error.message || "Verification failed.");
            return;
        }
        if (!ok) {
            setLoading(false);
            setErrorMsg("Incorrect Vault Code.");
            return;
        }

        // 2) Decrypt
        try {
            const ivToUse = noteData.note_iv || noteData.iv;
            const decrypted = await decryptText(noteData.encrypted_note, ivToUse, code);
            setEditedNote(decrypted);
            setEditedTitle(noteData.title || "");

            // (optional) keep for this tab so user isn't prompted again
            sessionStorage.setItem("vaultCode", code);
        } catch (err) {
            console.error("Decryption error:", err);
            setErrorMsg("Failed to decrypt note.");
        } finally {
            setLoading(false);
        }
    };

    // Handle saving the edited note
    const handleSave = async () => {
        setSaving(true);
        setErrorMsg("");

        const { data: { user } = {} } = await supabase.auth.getUser();
        if (!user?.id) {
            setErrorMsg("User not authenticated.");
            setSaving(false);
            return;
        }

        // We’ll use the code the user typed OR a previously verified code in this tab
        const sessionCode = sessionStorage.getItem("vaultCode") || "";
        const code = String(vaultCode || sessionCode || "").trim();

        // If you’re saving as vaulted, verify workspace code via RPC
        if (isVaulted) {
            if (!code) {
            setErrorMsg("Vault Code is required to save the note.");
            setSaving(false);
            return;
            }

            const { data: ok, error } = await supabase.rpc("verify_workspace_code", {
            p_workspace: activeWorkspaceId,
            p_code: code,
            });
            if (error) {
            setErrorMsg(error.message || "Verification failed.");
            setSaving(false);
            return;
            }
            if (!ok) {
            setErrorMsg("Incorrect Vault Code.");
            setSaving(false);
            return;
            }

            // keep it for this tab so subsequent actions don’t prompt again
            sessionStorage.setItem("vaultCode", code);
        }

        // Prepare fields
        const updatedTags = tags.map(t => t.trim()).filter(Boolean);

        let encryptedData = null;
        let iv = null;

        if (isVaulted) {
            const { encryptedData: enc, iv: ivHex } = await encryptText(editedNote || "", code);
            encryptedData = enc;
            iv = ivHex;
        }

        // If user turns OFF vaulting, clear encrypted fields
        const payload = {
            title: editedTitle,
            tags: updatedTags,
            notes,                         // public note
            updated_at: new Date().toISOString(),
            is_vaulted: isVaulted,
            encrypted_note: isVaulted ? encryptedData : null,
            note_iv: isVaulted ? iv : null,
        };

        const { error: updateError } = await supabase
            .from("workspace_vault_items")
            .update(payload)
            .eq("id", id)
            .eq("workspace_id", activeWorkspaceId);

        if (updateError) {
            console.error("Update error:", updateError);
            setErrorMsg("Failed to update note.");
        } else {
            setSuccessMsg("Note updated successfully!");
            setTimeout(() => navigate("/workspace/vaults/"), 1200);
        }

        setSaving(false);
        setHasUnsavedChanges(false);
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
            {/* Unsaved changes confirmation popup */}
            <UnsavedChangesModal
                show={showUnsavedPopup}
                onCancel={() => setShowUnsavedPopup(false)}
                redirectPath="/workspace/vaults"
                message="You have unsaved changes. Are you sure you want to leave?"
            />

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

                <h2 className="text-xl font-bold mb-5 text-gray-900">${editedTitle}</h2>

                {/* Title Input Section */}
                <label className="text-sm font-bold text-gray-800 mb-1 block">Note title:</label>
                <input
                    value={editedTitle}
                    onChange={(e) => {
                        setEditedTitle(e.target.value);
                        setHasUnsavedChanges(true);
                    }}
                    className="w-full p-2 border rounded mb-3 text-gray-800 text-sm bg-gray-50"
                    placeholder="Title"
                />

                {/* Public / Private toggle */}
                <div className="mb-3 text-sm">
                    <label className="mr-4 text-gray-800">Note Type:</label>
                    <label className="mr-4 text-gray-800">
                        <input
                        type="radio"
                        name="privacy"
                        value="vaulted"
                        checked={isVaulted}
                        onChange={() => {
                            setIsVaulted(true);
                            setHasUnsavedChanges(true);
                        }}
                        />{" "}
                        Vaulted (Encrypted)
                    </label>
                    <label className="text-gray-800">
                        <input
                        type="radio"
                        name="privacy"
                        value="public"
                        checked={!isVaulted}
                        onChange={() => {
                            setIsVaulted(false);
                            setHasUnsavedChanges(true);
                        }}
                        />{" "}
                        Public
                    </label>
                    <h2 className="text-xs text-purple-500 mt-1">Switching to Public will permanently delete the Private note.</h2>
                </div>

                {/* Public Notes */}
                <div>
                    <label className="text-sm font-bold text-gray-800 mb-1 block">Edit public note:</label>
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
                    <label className="block text-sm mb-1 text-gray-800">Tags:</label>
                    <div className="flex gap-2">
                        <input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        className="border rounded px-2 py-1 text-sm flex-1 text-gray-700"
                        placeholder="Add a tag"
                        />
                        <button onClick={handleTagAdd} className="btn-secondary">Add</button>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                        {tagOptions.map((t) => {
                        const selected = tags.includes(t);
                        return (
                            <button
                            key={t}
                            type="button"
                            onClick={() =>
                                setTags((prev) =>
                                selected ? prev.filter((x) => x !== t) : [...prev, t]
                                )
                            }
                            className={`px-2 py-1 rounded text-xs border ${
                                selected
                                ? "bg-purple-100 border-purple-400 text-purple-700"
                                : "bg-white border-gray-300 text-gray-700"
                            }`}
                            >
                            {t}
                            </button>
                        );
                        })}
                    </div>
                </div>

                {/* Vaulted Note Section */}
                {isVaulted && (
                    <>
                    {/* Private Note Input */}
                    <p className="text-sm text-red-400 mb-1 font-bold">
                        🔐 Private note will be encrypted using your saved Vault Code:
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
                            Re-enter Private vault code to encrypt:
                        </label>
                        <input
                            name="workspace_vault_code"
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