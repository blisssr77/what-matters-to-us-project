import React from "react";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText } from "../../../lib/encryption";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import Layout from "../../Layout/Layout";
import { X, Copy, Edit2, Trash2 } from "lucide-react";
import dayjs from "dayjs";
import bcrypt from "bcryptjs";

export default function WorkspaceViewNote() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { activeWorkspaceId } = useWorkspaceStore();

    const [vaultCode, setVaultCode] = useState("");
    const [noteData, setNoteData] = useState(null);
    const [decryptedNote, setDecryptedNote] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [loading, setLoading] = useState(false);
    const [codeEntered, setCodeEntered] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Fetch note data on mount
    useEffect(() => {
        const fetchNote = async () => {
        if (!id || !activeWorkspaceId) return;

        const { data, error } = await supabase
            .from("workspace_vault_items")
            .select("*")
            .eq("id", id)
            .eq("workspace_id", activeWorkspaceId)
            .single();

        if (error) {
            console.error("Error fetching note:", error);
            setErrorMsg("Note not found or access denied.");
        } else {
            setNoteData(data);
            if (!data.is_vaulted) {
            setCodeEntered(true); // Auto-show content if not vaulted
            }
        }
        };

        fetchNote();
    }, [id, activeWorkspaceId]);

    // Handle decryption when vault code is entered
    const handleDecrypt = async () => {
        if (loading) return; // Prevent multiple clicks
        setLoading(true);
        setErrorMsg("");

        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();

            if (userError || !user) {
                setErrorMsg("User not found. Please log in again.");
                setLoading(false);
                return;
            }

            if (!vaultCode.trim()) {
                setErrorMsg("Vault Code is required.");
                setLoading(false);
                return;
            }

            const { data: vaultCodeRow, error: codeError } = await supabase
                .from("vault_codes")
                .select("private_code")
                .eq("id", user.id)
                .single();

            if (codeError || !vaultCodeRow?.private_code) {
                setErrorMsg("Vault code not set. Please try again later.");
                setLoading(false);
                return;
            }

            const isMatch = await bcrypt.compare(vaultCode, vaultCodeRow.private_code);
            if (!isMatch) {
                setErrorMsg("Incorrect Vault Code.");
                setLoading(false);
                return;
            }

            if (!noteData?.encrypted_note || !noteData?.note_iv) {
                setErrorMsg("Nothing to decrypt for this note.");
                setLoading(false);
                return;
            }

            sessionStorage.setItem("vaultCode", vaultCode);

            const decrypted = await decryptText(
                noteData.encrypted_note,
                noteData.note_iv,
                vaultCode
            );

            setDecryptedNote(decrypted);
            setCodeEntered(true);
        } catch (err) {
            console.error("Decryption failed:", err);
            setErrorMsg("Unexpected error during decryption.");
        } finally {
            setLoading(false);
        }
    };

    // Handle copy to clipboard
    const handleCopy = () => {
        try {
            navigator.clipboard.writeText(decryptedNote);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    // Handle delete confirmation
    const handleDelete = async () => {
        setShowDeleteConfirm(false);
        await supabase.from("workspace_vault_items").delete().eq("id", id);
        navigate("/workspace/vaults");
    };



    return (
        <Layout>
            {/* Delete confirmation modal */}
            {showDeleteConfirm && (
                <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
                    <p className="mt-10 text-gray-800">
                    Are you sure you want to delete <strong>{noteData?.title || "this note"}</strong>?
                    </p>
                    <div className="flex gap-3 justify-end mt-4">
                    <button
                        onClick={async () => {
                        await handleDelete();
                        setShowDeleteConfirm(false);
                        }}
                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        Yes, Delete
                    </button>
                    <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                    >
                        Cancel
                    </button>
                    </div>
                </div>
            )}

            <div className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
                <button
                    onClick={() => navigate("/workspace/vaults")}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
                    aria-label="Close"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold mb-5 text-gray-900">🔓 View Note</h2>
                {noteData?.title && <h3 className="text-lg text-gray-800 font-semibold mb-3">{noteData.title}</h3>}
                {noteData?.notes && <p className="text-s text-gray-700 mb-4">{noteData.notes}</p>}
                {/* Display tags content */}
                {Array.isArray(noteData?.tags) && noteData.tags.length > 0 && (
                    <div className="mb-3 text-sm text-gray-700">
                        <strong>Tags:</strong>{" "}
                        {noteData.tags.map((tag, index) => (
                        <React.Fragment key={tag}>
                            <span className="bg-yellow-50 px-1 rounded">{tag}</span>
                            {index < noteData.tags.length - 1 && ", "}
                        </React.Fragment>
                        ))}
                    </div>
                )}

                <div>
                {noteData?.is_vaulted && !codeEntered ? (
                    <>
                        <label className="block text-sm font-medium mb-1 text-gray-600">
                            Enter <strong>Private</strong> Vault Code to Decrypt Note:
                        </label>
                        <input
                            type="password"
                            value={vaultCode}
                            onChange={(e) => {
                                const newCode = e.target.value;
                                setVaultCode(newCode);
                                sessionStorage.setItem("vaultCode", newCode); // persist vault code immediately
                            }}
                            className="w-full p-2 border rounded mb-3 text-gray-600 text-sm"
                            placeholder="Vault Code"
                        />
                        <button
                            onClick={handleDecrypt}
                            disabled={loading}
                            className="btn-secondary"
                        >
                            {loading ? "Decrypting..." : "Decrypt"}
                        </button>
                        {errorMsg && <p className="text-sm text-red-500 mt-2">{errorMsg}</p>}
                    </>
                ) : (
                    <>
                    {noteData?.created_at && (
                        <div className="mb-1 text-xs text-gray-400">
                            Created: {dayjs(noteData.created_at).format("MMM D, YYYY h:mm A")}
                        </div>
                    )}
                    {noteData?.updated_at && (
                        <div className="mb-3 text-xs text-gray-400">
                            Updated: {dayjs(noteData.updated_at).format("MMM D, YYYY h:mm A")}
                        </div>
                    )}

                    {/* Display decrypted note content */}
                    {codeEntered && noteData && (
                        <>
                            <div className="text-gray-700 font-bold mb-1 text-sm">Private note:</div>
                            <div className="text-sm text-gray-900 bg-purple-50 border border-purple-200 rounded p-3 mb-4">
                                {noteData.is_vaulted ? decryptedNote : "⚠️ Decryption returned nothing."}
                            </div>
                        </>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-4 text-sm">
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1 text-purple-600 hover:underline"
                        >
                            <Copy size={16} />
                            Copy
                        </button>
                        <button
                            onClick={() => navigate(`/workspace/vaults/note-edit/${id}`)}
                            className="flex items-center gap-1 text-blue-600 hover:underline"
                        >
                            <Edit2 size={16} />
                            Edit
                        </button>
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="flex items-center gap-1 text-red-600 hover:underline"
                        >
                            <Trash2 size={16} />
                            Delete
                        </button>
                    </div>

                    <div className="mt-4 text-xs text-gray-400">
                        Last viewed just now · Private log only. Team audit history coming soon.
                    </div>
                    </>
                )}
                </div>

            </div>
        </Layout>
    );
}