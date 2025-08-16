import React from "react";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText } from "../../../lib/encryption";
import { useWorkspaceStore } from "../../../hooks/useWorkspaceStore";
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
    const [isVaulted, setIsVaulted] = useState(false);
    // remember-opt-in
    const [rememberCode, setRememberCode] = useState(false);
    // per-user namespacing (safer if multiple accounts use same browser)
    const [storageKey, setStorageKey] = useState("pv_vault_code:anon");

    // 15-minute TTL in ms
    const FIFTEEN_MIN = 15 * 60 * 1000;

    // --- expiring storage helpers ---
    const setExpiringItem = (key, value, ttlMs) => {
        const payload = { v: value, e: Date.now() + ttlMs };
    localStorage.setItem(key, JSON.stringify(payload));
    };
    const getExpiringItem = (key) => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const { v, e } = JSON.parse(raw);
            if (Date.now() > e) {
            localStorage.removeItem(key);
            return null;
            }
            return v;
        } catch {
            return null;
        }
    };
    const removeExpiringItem = (key) => localStorage.removeItem(key);

    // --- end expiring storage helpers ---
    useEffect(() => {
        (async () => {
            const { data: { user } = {} } = await supabase.auth.getUser();
            if (user?.id) setStorageKey(`pv_vault_code:${user.id}:note:${id}`);
        })();
    }, []);

    // Auto-fill vault code if previously remembered
    useEffect(() => {
        (async () => {
            if (!noteData?.is_vaulted) return;
            const remembered = getExpiringItem(storageKey);
            if (!remembered || codeEntered) return;

            // auto-fill + auto-decrypt only if the user previously opted in
            setVaultCode(remembered);
            await handleDecrypt(remembered); // pass code directly (see next change)
        })();
    }, [noteData, storageKey]); // eslint-disable-line

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
                setIsVaulted(!!data.is_vaulted);
                if (!data.is_vaulted) {
                    setCodeEntered(true); // Auto-show content if not vaulted
                }
            }
        };

        fetchNote();
    }, [id, activeWorkspaceId]);

    // Handle decryption when vault code is entered
    const handleDecrypt = async (explicitCode) => {
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

            // accept code from input or from auto-fill (explicitCode)
            const candidate = (explicitCode ?? vaultCode);
            const code = String(candidate || "").trim();
            if (!code) {
                setErrorMsg("Vault Code is required.");
                setLoading(false);
                return;
            }

            // ✅ verify via RPC (safer than selecting the vault_codes table)
            const { data: ok, error: verifyError } = await supabase.rpc(
                "verify_user_private_code",
                { p_code: code }
            );
            if (verifyError) {
                setErrorMsg(verifyError.message || "Failed to verify Vault Code.");
                setLoading(false);
                return;
            }
            if (!ok) {
                setErrorMsg("Incorrect Vault Code.");
                setLoading(false);
                return;
            }

            // nothing to decrypt?
            if (!noteData?.encrypted_note || !noteData?.note_iv) {
                setErrorMsg("Nothing to decrypt for this note.");
                setLoading(false);
                return;
            }

            // 🔒 remember-for-15-min logic (per your storageKey + checkbox)
            if (rememberCode) {
                setExpiringItem(storageKey, code, FIFTEEN_MIN);
            } else {
                removeExpiringItem(storageKey);
            }

            // also keep a session copy for this tab
            sessionStorage.setItem("vaultCode", code);

            // decrypt
            const decrypted = await decryptText(
                noteData.encrypted_note,
                noteData.note_iv,
                code
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
                    Are you sure you want to delete {noteData?.title || "this note"}?
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

                {noteData?.title && <h2 className="text-xl text-gray-800 font-bold mb-4">{noteData.title}</h2>}
                <h2 className="text-sm mb-1 text-gray-700">Notes:</h2>
                {noteData?.notes && <p className="text-sm text-gray-800 mb-4">{noteData.notes}</p>}
                {/* Display tags content */}
                {Array.isArray(noteData?.tags) && noteData.tags.length > 0 && (
                    <div className="mb-3 text-sm text-gray-700 font-medium">
                        Tags:{" "}
                        {noteData.tags.map((tag, index) => (
                        <React.Fragment key={tag}>
                            <span className="bg-yellow-50 px-1 rounded font-extralight">{tag}</span>
                            {index < noteData.tags.length - 1 && ", "}
                        </React.Fragment>
                        ))}
                    </div>
                )}

                <div>
                {noteData?.is_vaulted && !codeEntered ? (
                    <>
                        <label className="block text-sm font-medium mb-1 mt-6 text-gray-600">
                        Enter Private Vault Code to Decrypt Note:
                        </label>
                        {/* Vault code input */}
                        <div className="mt-2 flex items-center gap-3">
                            <input
                                type="password"
                                value={vaultCode}
                                onChange={(e) => setVaultCode(e.target.value)}
                                className="w-full p-2 border rounded text-sm text-gray-700"
                                placeholder="Vault Code"
                                autoComplete="current-password"
                            />
                            {/* Remember option for 15 minutes */}
                            <label className="flex items-center gap-2 text-xs text-gray-600">
                                <input
                                type="checkbox"
                                checked={rememberCode}
                                onChange={(e) => setRememberCode(e.target.checked)}
                                />
                                Remember code for 15 min
                            </label>
                            <button onClick={() => handleDecrypt()} disabled={loading} className="btn-secondary text-sm">
                                {loading ? "Decrypting..." : "Decrypt"}
                            </button>
                        </div>

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

                    {isVaulted && (
                        <>
                        {/* Display decrypted note content */}
                        {codeEntered && noteData && (
                            <>
                                <div className="text-gray-900 mb-1 text-sm font-medium">Private note:</div>
                                <div className="text-sm text-gray-900 bg-purple-50 border border-purple-200 rounded p-3 mb-4">
                                    {noteData.is_vaulted ? decryptedNote : "⚠️ Decryption returned nothing."}
                                </div>
                            </>
                        )}
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