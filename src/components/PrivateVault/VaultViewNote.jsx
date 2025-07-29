import React from "react";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { decryptText } from "../../utils/encryption";
import Layout from "../Layout/Layout";
import { X, Copy, Edit2, Trash2 } from "lucide-react";
import dayjs from "dayjs";
import bcrypt from "bcryptjs";

export default function VaultViewNote() {
    const { id } = useParams();
    const navigate = useNavigate();

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
            const { data, error } = await supabase
                .from("private_vault_items")
                .select("*")
                .eq("id", id)
                .single();

            if (error) {
                console.error("Error fetching note:", error);
            } else {
                setNoteData(data);
            }
        };
        fetchNote();
    }, [id]);

    // Handle decryption when vault code is entered
    const handleDecrypt = async () => {
        setLoading(true);
        setErrorMsg("");

        // If we reach here, the vault code is correct
        console.log("✅ Vault code verified successfully");
        if (!noteData.note_iv || !noteData.encrypted_note) {
            setErrorMsg("❌ Nothing to decrypt for this document.");
            setLoading(false);
            return;
        }

        const {
            data: { user },
        } = await supabase.auth.getUser();

        // 1. Fetch vault code hash
        const { data: vaultCodeRow, error: codeError } = await supabase
            .from("vault_codes")
            .select("private_code")
            .eq("id", user.id)
            .single();

        if (codeError || !vaultCodeRow?.private_code) {
            setErrorMsg("❌ Vault code not set. Please try again later.");
            setLoading(false);
            return;
        }

        // 2. Compare hash with user input
        const isMatch = await bcrypt.compare(vaultCode, vaultCodeRow.private_code);
        if (!isMatch) {
            setErrorMsg("Incorrect Vault Code.");
            setLoading(false);
            return;
        }

        sessionStorage.setItem("vaultCode", vaultCode);

        // 3. Decrypt the note
        try {
            const ivToUse = noteData.note_iv || noteData.iv; // ✅ fallback if note_iv is missing

            const decrypted = await decryptText(
            noteData.encrypted_note,
            ivToUse,
            vaultCode
            );
            console.log("✅ Decrypted note:", decrypted);
            setDecryptedNote(decrypted);
            setCodeEntered(true);
        } catch (err) {
            console.error("❌ Decryption failed:", err);
            setErrorMsg("Failed to decrypt note.");
        }

        setLoading(false);
    };

    // Handle copy to clipboard
    const handleCopy = () => {
        navigator.clipboard.writeText(decryptedNote);
    };

    // Handle delete confirmation
    const handleDelete = async () => {
        setShowDeleteConfirm(false);
        await supabase.from("private_vault_items").delete().eq("id", id);
        navigate("/private/vaults");
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
                    onClick={() => navigate("/private/vaults")}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
                    aria-label="Close"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold mb-5 text-gray-900">🔓 View Note</h2>
                {noteData?.title && <h3 className="text-lg text-gray-800 font-semibold mb-3">{noteData.title}</h3>}
                {noteData?.notes && <p className="text-s text-gray-700 mb-4">{noteData.notes}</p>}

                {!codeEntered ? (
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
                                sessionStorage.setItem("vaultCode", newCode); // ✅ persist vault code immediately
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
                        {noteData.tags?.length > 0 && (
                            <div className="mb-3 text-sm text-gray-700">
                                <strong>Tags:</strong>{" "}
                                {/* Map over each tag to apply individual styling */}
                                {noteData.tags.map((tag, index) => (
                                <React.Fragment key={tag}> {/* Use React.Fragment for grouping without extra DOM node */}
                                    <span className="bg-yellow-50 px-1 rounded"> {/* Apply highlight classes to each tag */}
                                    {tag}
                                    </span>
                                    {/* Add a comma and space after each tag, except the last one */}
                                    {index < noteData.tags.length - 1 && ", "}
                                </React.Fragment>
                                ))}
                            </div>
                        )}

                        <div className="mb-1 text-xs text-gray-400">
                            Created: {dayjs(noteData.created_at).format("MMM D, YYYY h:mm A")}
                        </div>
                        <div className="mb-3 text-xs text-gray-400">
                            Updated: {dayjs(noteData.updated_at).format("MMM D, YYYY h:mm A")}
                        </div>

                        <div className="text-gray-900 mb-1 text-sm">Private note:</div>
                        <div className="text-sm text-gray-900 bg-purple-50 border border-purple-200 rounded p-3 mb-4">
                            {decryptedNote ? decryptedNote : "⚠️ Decryption returned nothing."}
                        </div>

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
                                onClick={() => navigate(`/private/vaults/note-edit/${id}`)}
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
        </Layout>
    );
}