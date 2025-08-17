import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { X, Copy, Edit2, Trash2 } from "lucide-react";
import dayjs from "dayjs";

export default function PrivateViewNote() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [vaultCode, setVaultCode] = useState("");
    const [noteData, setNoteData] = useState(null);
    const [decryptedNote, setDecryptedNote] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [loading, setLoading] = useState(false);
    const [codeEntered, setCodeEntered] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    // remember-opt-in
    const [rememberCode, setRememberCode] = useState(false);
    // per-user namespacing (safer if multiple accounts use same browser)
    const [storageKey, setStorageKey] = useState("pv_vault_code:anon");
    const autoFillTriedRef = useRef(false);
  
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
            const userId = user?.id ?? "anon";
            setStorageKey(`pv_vault_code:${userId}:note:${id}`);
        })();
    }, [id]);

    // Auto-fill vault code if previously remembered
    useEffect(() => {
        (async () => {
            if (!noteData?.is_vaulted) return;
            if (autoFillTriedRef.current) return; // only once per mount
            const remembered = getExpiringItem(storageKey);
            if (!remembered || codeEntered) return;

            // auto-fill + auto-decrypt only if the user previously opted in
            setVaultCode(remembered);
            autoFillTriedRef.current = true;
            await handleDecrypt(remembered, true); // true = from remembered storage
        })();
    }, [noteData, storageKey]); // eslint-disable-line

    // Load note
    useEffect(() => {
        (async () => {
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
        })();
    }, [id]);

    // Handle decryption
    const handleDecrypt = async (maybeCode, isFromRememberedStorage = false) => {
        const code = String(maybeCode ?? vaultCode ?? "").trim();
        if (!noteData?.is_vaulted) { setDecryptedNote(""); setCodeEntered(true); return; }
        if (!code) { setErrorMsg("Please enter your Vault Code."); return; }

        setLoading(true); setErrorMsg("");

        const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", { p_code: code });
        if (vErr) { setErrorMsg(vErr.message || "Failed to verify Vault Code."); setLoading(false); return; }
        if (!ok)  { setErrorMsg("Incorrect Vault Code."); setLoading(false); return; }

        if (!noteData.note_iv || !noteData.encrypted_note) {
            setErrorMsg("This note has no encrypted content to decrypt.");
            setCodeEntered(true); setLoading(false); return;
        }

        try {
            const dec = await decryptText(noteData.encrypted_note, noteData.note_iv, code);
            setDecryptedNote(dec || "");
            setCodeEntered(true);
            // refresh/save TTL without accidentally deleting an existing memory
            const alreadyRemembered = !!getExpiringItem(storageKey);
            if (isFromRememberedStorage) {
                // came from storage → refresh TTL
                setExpiringItem(storageKey, code, FIFTEEN_MIN);
            } else if (rememberCode) {
                // user opted in → save/refresh
                setExpiringItem(storageKey, code, FIFTEEN_MIN);
            } else if (alreadyRemembered) {
                // keep existing memory alive even if box is unchecked
                setExpiringItem(storageKey, code, FIFTEEN_MIN);
            }
            // if you want a real “Forget” action, add a dedicated button that calls removeExpiringItem(storageKey)
            sessionStorage.setItem("vaultCode", code);
        } catch (e) {
            console.error("Decryption failed:", e);
            setErrorMsg("Decryption failed. Please confirm your code and try again.");
        } finally {
            setLoading(false);
        }
    };

    // Handle remembering the vault code
    const handleCopy = async () => {
        if (decryptedNote) {
        await navigator.clipboard.writeText(decryptedNote);
        }
    };

    // Handle delete confirmation
    const handleDelete = async () => {
        setShowDeleteConfirm(false);
        await supabase.from("private_vault_items").delete().eq("id", id);
        navigate("/privatespace/vaults");
    };

    // If the note is not vaulted, we can show the content directly
    const isVaulted = !!noteData?.is_vaulted;

    return (
        <Layout>
        {/* Delete confirmation */}
        {showDeleteConfirm && (
            <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
            <p className="mt-10 text-gray-800">
                Are you sure you want to delete {noteData?.title || "this note"}?
            </p>
            <div className="flex gap-3 justify-end mt-4">
                <button
                onClick={handleDelete}
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
            onClick={() => navigate("/privatespace/vaults")}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
            aria-label="Close"
            >
                <X size={20} />
            </button>

            {noteData?.title && <h2 className="text-xl text-gray-800 font-bold mb-4">{noteData.title}</h2>}
            <h2 className="text-sm mb-1 text-gray-700">Notes:</h2>
            {noteData?.notes && <p className="text-sm text-gray-800 mb-4">{noteData.notes}</p>}

            {/* If not vaulted, show content without requiring code */}
            {!isVaulted ? (
            <>
                {/* Tags */}
                {noteData?.tags?.length > 0 && (
                <div className="mb-3 text-sm text-gray-700 font-medium">
                    Tags:{" "}
                    {noteData.tags.map((tag, index) => (
                    <React.Fragment key={tag}>
                        <span className="bg-yellow-50 px-1 rounded">{tag}</span>
                        {index < noteData.tags.length - 1 && ", "}
                    </React.Fragment>
                    ))}
                </div>
                )}

                <div className="mb-1 text-xs text-gray-400">
                    Created: {noteData?.created_at ? dayjs(noteData.created_at).format("MMM D, YYYY h:mm A") : "—"}
                </div>
                <div className="mb-3 text-xs text-gray-400">
                    Updated: {noteData?.updated_at ? dayjs(noteData.updated_at).format("MMM D, YYYY h:mm A") : "—"}
                </div>

                <div className="flex gap-4 text-sm">
                <button
                    onClick={() => navigate(`/privatespace/vaults/note-edit/${id}`)}
                    className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                    <Edit2 size={16} /> Edit
                </button>
                <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1 text-red-600 hover:underline"
                >
                    <Trash2 size={16} /> Delete
                </button>
                </div>

                <div className="mt-4 text-xs text-gray-400">
                Last viewed just now · Private log only. Team audit history coming soon.
                </div>
            </>
            ) : (
            // Vaulted flow (needs code to decrypt)
            <>
                {!codeEntered ? (
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
                    {/* Tags */}
                    {noteData?.tags?.length > 0 && (
                        <div className="mb-3 text-sm text-gray-900 font-medium">
                            Tags:{" "}
                            {noteData.tags.map((tag, index) => (
                            <React.Fragment key={tag}>
                                <span className="bg-yellow-50 px-1 rounded">{tag}</span>
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

                    <div className="text-gray-900 mb-1 text-sm font-medium">Private note:</div>
                    <div className="text-sm text-gray-900 bg-purple-50 border border-purple-200 rounded p-3 mb-4">
                        {decryptedNote !== "" ? decryptedNote : "⚠️ Decryption returned nothing."}
                    </div>

                    <div className="flex gap-4 text-sm">
                        <button onClick={async () => { if (decryptedNote) await navigator.clipboard.writeText(decryptedNote); }} className="flex items-center gap-1 text-purple-600 hover:underline">
                            <Copy size={16} /> Copy
                        </button>
                        <button onClick={() => navigate(`/privatespace/vaults/note-edit/${id}`)} className="flex items-center gap-1 text-blue-600 hover:underline">
                            <Edit2 size={16} /> Edit
                        </button>
                        <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-1 text-red-600 hover:underline">
                            <Trash2 size={16} /> Delete
                        </button>
                    </div>

                    <div className="mt-4 text-xs text-gray-400">
                        Last viewed just now · Private log only. Team audit history coming soon.
                    </div>
                </>
                )}
            </>
            )}
        </div>
        </Layout>
    );
}
