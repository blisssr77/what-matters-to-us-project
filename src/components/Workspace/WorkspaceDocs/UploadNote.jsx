import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { X, Search } from "lucide-react";
import { encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import bcrypt from "bcryptjs"; 
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";
import RichTextEditor from "../../Editors/RichTextEditor";
import DOMPurify from "dompurify";
import FullscreenCard from "@/components/Layout/FullscreenCard";
import CardHeaderActions from "@/components/Layout/CardHeaderActions";
import { addWorkspaceTag } from "@/lib/tagsApi";

const WorkspaceUploadNote = () => {
    const [title, setTitle] = useState("");
    const [privateNote, setPrivateNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [newTag, setNewTag] = useState("");
    const [tags, setTags] = useState([]);
    const [notes, setNotes] = useState("");
    const [availableTags, setAvailableTags] = useState([]);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [vaultCode, setVaultCode] = useState("");
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);
    const [isVaulted, setIsVaulted] = useState(true);

    const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();
    const [wsName, setWsName] = useState("");
    const navigate = useNavigate();

    // Rich text editor states
    const [publicJson, setPublicJson] = useState()
    const [publicHtml, setPublicHtml] = useState('')
    const [privateJson, setPrivateJson] = useState()
    const [privateHtml, setPrivateHtml] = useState('')

    // ✅ Fetch and set active workspace on mount
    // 1) On mount, pick an active workspace ID for this user
    useEffect(() => {
        (async () => {
            const { data: { user } = {} } = await supabase.auth.getUser();
            if (!user?.id) return;

            const { data, error } = await supabase
            .from('workspace_members')
            .select('workspace_id, created_at, is_admin, sort_order')
            .eq('user_id', user.id)                         // profiles.id == auth.users.id
            .order('sort_order', { ascending: true, nullsLast: true })
            .order('is_admin', { ascending: false, nullsLast: true })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

            if (error) {
                console.error('membership check error:', error);
                return;
            }
            if (data?.workspace_id) {
                setActiveWorkspaceId(data.workspace_id);
                console.log('Active Workspace ID:', data.workspace_id);
            } else {
                console.warn('⚠️ No workspace found for user.');
            }
        })();
    }, [setActiveWorkspaceId]);

    // 2) Whenever the active ID changes, fetch its name
    useEffect(() => {
        if (!activeWorkspaceId) {
            setWsName("");
            return;
        }
        (async () => {
            const { data, error } = await supabase
            .from("workspaces")
            .select("name")
            .eq("id", activeWorkspaceId)
            .single();

            setWsName(error ? "" : data?.name ?? "");
        })();
    }, [activeWorkspaceId]);

    // 3) On mount, also fetch the user's default workspace (if any)
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase.rpc('get_default_workspace');
            if (error) {
                console.error('get_default_workspace error:', error);
                return;
            }
                const row = data?.[0];
            if (row?.workspace_id) {
                setActiveWorkspaceId(row.workspace_id);
                setWsName(row.name || '');
            } else {
                console.warn('⚠️ No workspace found for user.');
            }
        })();
    }, [setActiveWorkspaceId]);

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

    // ✅ Fetch tags for this workspace
    useEffect(() => {
        if (!activeWorkspaceId) return;
        const fetchTags = async () => {
            const { data, error } = await supabase
            .from("vault_tags")
            .select("*")
            .eq("workspace_id", activeWorkspaceId);
            if (!error) setAvailableTags(data.map((tag) => tag.name));
        };
        fetchTags();
    }, [activeWorkspaceId]);

    // Ensure selected tags are visible even if legacy/user-only
    const tagOptions = useMemo(
        () => Array.from(new Set([...(availableTags || []), ...(tags || [])])),
        [availableTags, tags]
    );

    // ✅ Add tag (Workspace scope, deduped server-side)
    const handleTagAdd = async () => {
        const raw = String(newTag || '').trim()
        if (!raw) return

        const { data: { user } = {} } = await supabase.auth.getUser()
        if (!user?.id) { console.error('Not signed in'); return }
        if (!activeWorkspaceId) { console.error('No activeWorkspaceId'); return }

        const { data: row, error } = await addWorkspaceTag(supabase, {
            name: raw,
            workspaceId: activeWorkspaceId,
            userId: user.id,
        })
        if (error) { console.error(error); return }

        const existsCI = (arr, val) =>
            arr.some(t => String(t).toLowerCase() === String(val).toLowerCase())

        setAvailableTags(prev => existsCI(prev, row.name) ? prev : [...prev, row.name])
        setTags(prev => existsCI(prev, row.name) ? prev : [...prev, row.name])
        setNewTag('')
    }

    // Handle note upload-------------------------------------------
    const handleCreate = async () => {
        setLoading(true)
        setSuccessMsg('')
        setErrorMsg('')

        // auth
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user
        if (!user?.id) {
            setLoading(false)
            setErrorMsg('User not authenticated.')
            return
        }

        // helpers
        const stripHtmlToText = (html = '') => {
            const el = document.createElement('div')
            el.innerHTML = html
            return (el.textContent || el.innerText || '').trim()
        }

        // collect editor values
        const cleanPublicHtml = publicHtml ? DOMPurify.sanitize(publicHtml) : ''
        const hasPublic = cleanPublicHtml && cleanPublicHtml.trim().length > 0

        const hasPrivate = !!privateJson && JSON.stringify(privateJson).length > 20

        if (!hasPublic && !(isVaulted && hasPrivate)) {
            setLoading(false)
            setErrorMsg('Nothing to save.')
            return
        }

        // verify workspace code only if saving vaulted content
        if (isVaulted && hasPrivate) {
            const code = (vaultCode || '').trim()
            if (!code) {
                setLoading(false)
                setErrorMsg('Please enter your Vault Code.')
                return
            }
            const { data: ok, error } = await supabase.rpc('verify_workspace_code', {
                p_workspace: activeWorkspaceId,
                p_code: code,
            })
            if (error) {
                setLoading(false)
                setErrorMsg(error.message || 'Verification failed.')
                return
            }
            if (!ok) {
                setLoading(false)
                setErrorMsg('Incorrect Vault Code.')
                return
            }
        }

        // encrypt private TipTap JSON if present
        let private_note_ciphertext = null
        let private_note_iv = null
        try {
            if (isVaulted && hasPrivate) {
                const plaintext = JSON.stringify(privateJson) // TipTap JSON
                const { encryptedData, iv } = await encryptText(plaintext, vaultCode) // base64 strings
                private_note_ciphertext = encryptedData
                private_note_iv = iv
            }
        } catch (e) {
            console.error('Encryption failed:', e)
            setLoading(false)
            setErrorMsg('Encryption error.')
            return
        }

        // derive plain text + optional summary from public note (for search)
        const publicText = hasPublic ? stripHtmlToText(cleanPublicHtml) : null
        const summary = hasPublic ? publicText.slice(0, 160) : null

        // build payload to match your schema
        const payload = {
            user_id: user.id,
            workspace_id: activeWorkspaceId,
            created_by: user.id,

            file_name: title || 'Untitled Note',
            title: title || null,
            tags: Array.isArray(tags) && tags.length ? tags : null,

            // public fields
            public_note_html: hasPublic ? cleanPublicHtml : null,
            notes: hasPublic ? publicText : null,          // plain text for search/back-compat
            summary: hasPublic ? summary : null,

            // private fields
            is_vaulted: !!(isVaulted && hasPrivate),
            private_note_ciphertext: isVaulted && hasPrivate ? private_note_ciphertext : null,
            private_note_iv: isVaulted && hasPrivate ? private_note_iv : null,
            private_note_format: isVaulted && hasPrivate ? 'tiptap_json' : null,

            // keep legacy encrypted_note/note_iv empty to avoid duplication
            encrypted_note: null,
            note_iv: null,
        }

        const { error: insertError } = await supabase
            .from('workspace_vault_items')
            .insert(payload)

        if (insertError) {
            console.error(insertError)
            setErrorMsg('Failed to create note.')
        } else {
            setSuccessMsg('✅ Note created successfully!')
            setHasUnsavedChanges(false)
            setTimeout(() => navigate('/workspace/vaults'), 900)
        }

        setLoading(false)
    }

    return (
        <Layout>
            {/* Unsaved changes confirmation popup */}
            <UnsavedChangesModal
                show={showUnsavedPopup}
                onCancel={() => setShowUnsavedPopup(false)}
                redirectPath="/workspace/vaults"
                message="You have unsaved changes. Are you sure you want to leave?"
            />

            <FullscreenCard className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
                <CardHeaderActions onClose={() => navigate('/workspace/vaults')} />

                <h2 className="text-xl font-bold mb-4 text-gray-800">📝 Upload to {wsName}</h2>

                {/* Privacy Section */}
                <div className="mb-4">
                    <label className="mr-4 font-bold text-gray-800 text-sm">Upload Type:</label>
                    <label className="mr-4 text-gray-800 text-sm">
                        <input
                        type="radio"
                        name="privacy"
                        value="vaulted"
                        checked={isVaulted}
                        onChange={() => setIsVaulted(true)}
                        />
                        Vaulted (Encrypted)
                    </label>
                    <label className="text-gray-800 text-sm">
                        <input
                        type="radio"
                        name="privacy"
                        value="public"
                        checked={!isVaulted}
                        onChange={() => setIsVaulted(false)}
                        />
                        Public
                    </label>
                </div>

                <label className="block text-sm font-bold mb-1 text-gray-800">Note title:</label>
                <input
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value);
                        setHasUnsavedChanges(true);
                    }}
                    className="w-full p-2 mb-4 border rounded text-gray-800 text-sm bg-gray-50"
                    placeholder="Enter note title (Public)"
                />

                {/* Notes */}
                <div className="text-sm mb-4 text-gray-800">
                    <div className="mb-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-baseline gap-2">
                            <h2 className="text-sm font-bold m-0">Public note:</h2>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3 mb-4">
                        <RichTextEditor
                            valueJSON={publicJson}
                            onChangeJSON={(json, html) => { setPublicJson(json); setPublicHtml(html); }}
                        />
                    </div>
                </div>

                {/* Tag Input Section */}
                <div className="mb-5">
                    <label className="block text-sm mb-1 font-bold text-gray-800">Tags:</label>
                    <div className="flex gap-2">
                        <input
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            className="border rounded px-2 py-1 text-sm flex-1 text-gray-800"
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
                                : "bg-white border-gray-300 text-gray-800"
                            }`}
                        >
                            {t}
                        </button>
                        );
                    })}
                    </div>
                </div>

                {isVaulted && (
                    <>
                    {/* Private Note Section */}
                    <div className="text-sm font-medium mb-4 text-gray-800">
                        <p className="text-sm font-bold text-red-500 mb-1">
                            🔐 Private note: will be encrypted using your saved Vault Code
                        </p>
                        <div className="bg-white border border-gray-200 rounded p-3 mb-4">
                            <RichTextEditor
                            valueJSON={privateJson}
                            onChangeJSON={(json, html) => { setPrivateJson(json); setPrivateHtml(html); }}
                            />
                        </div>
                    </div>
                    {/* Vault Code Section */}
                    <label className="block text-sm font-bold mb-1 text-gray-800">
                        Enter Workspace vault code to encrypt note:
                    </label>
                    <input
                        type="password"
                        value={vaultCode}
                        onChange={(e) => setVaultCode(e.target.value)}
                        className="w-full p-2 border rounded mb-3 text-gray-600 text-sm bg-gray-50"
                        placeholder="Vault code"
                    />
                    </>
                )}

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
            </FullscreenCard>
        </Layout>
    );
};

export default WorkspaceUploadNote;
