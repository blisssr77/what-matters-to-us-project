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
                .from("vaulted_notes")
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
        
        const {
            data: { user },
        } = await supabase.auth.getUser();

        // Check if user is authenticated
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

        // Compare entered vault code with stored hash
        const isMatch = await bcrypt.compare(vaultCode, vaultCodeRow.private_code);
        if (!isMatch) {
            setErrorMsg("Incorrect Vault Code.");
            setLoading(false);
            return;
        }

        sessionStorage.setItem("vaultCode", vaultCode);

        try {
            const { decrypted } = await decryptText(
                noteData.encrypted_note,
                noteData.iv,
                vaultCode
            );
            console.log("Decrypted note:", decrypted);
            setDecryptedNote(decrypted);
            setCodeEntered(true);
        } catch (err) {
            console.error("Decryption failed:", err);
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
        await supabase.from("vaulted_notes").delete().eq("id", id);
        navigate("/private/vaults");
    };

    return (
        <Layout>
            <div className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
                <button
                    onClick={() => navigate("/private/vaults")}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
                    aria-label="Close"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold mb-4 text-purple-700">🔓 View Note</h2>

                {!codeEntered ? (
                    <>
                        <label className="block text-sm font-medium mb-1 text-gray-500">
                            Enter <strong>Private</strong> Vault Code to Decrypt Note
                        </label>
                        <input
                            type="password"
                            value={vaultCode}
                            onChange={(e) => {
                                const newCode = e.target.value;
                                setVaultCode(newCode);
                                sessionStorage.setItem("vaultCode", newCode); // ✅ persist vault code immediately
                            }}
                            className="w-full p-2 border rounded mb-3 text-gray-600"
                            placeholder="Vault Code"
                        />
                        <button
                            onClick={handleDecrypt}
                            disabled={loading}
                            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                        >
                            {loading ? "Decrypting..." : "Decrypt"}
                        </button>
                        {errorMsg && <p className="text-sm text-red-500 mt-2">{errorMsg}</p>}
                    </>
                ) : (
                    <>
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                            {noteData.title || "Untitled Note"}
                        </h3>

                        {noteData.tags?.length > 0 && (
                            <div className="mb-2 text-sm text-gray-600">
                                <strong>Tags:</strong> {noteData.tags.join(", ")}
                            </div>
                        )}

                        <div className="mb-3 text-xs text-gray-400">
                            Created: {dayjs(noteData.created_at).format("MMM D, YYYY h:mm A")}
                        </div>

                        <div className="whitespace-pre-wrap border border-gray-100 p-4 rounded bg-gray-50 text-sm text-gray-800 leading-relaxed mb-4">
                            {decryptedNote ? decryptedNote : "⚠️ Decryption returned nothing."}
                        </div>

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
                            Last viewed just now (personal log). Audit trail for teams coming soon.
                        </div>
                    </>
                )}

                {showDeleteConfirm && (
                    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
                        <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full">
                            <h4 className="text-lg font-semibold mb-2 text-gray-800">Delete Note?</h4>
                            <p className="text-sm text-gray-600 mb-4">
                                This action cannot be undone. Are you sure you want to delete this note?
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="px-3 py-1 text-gray-700 border border-gray-300 rounded hover:bg-gray-100"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}