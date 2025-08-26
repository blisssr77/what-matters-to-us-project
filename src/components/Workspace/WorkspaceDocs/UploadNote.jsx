import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { X, Search } from "lucide-react";
import { encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import bcrypt from "bcryptjs"; 
import { useWorkspaceStore } from "../../../hooks/useWorkspaceStore";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";
import RichTextEditor from "../../Editors/RichTextEditor";
import DOMPurify from "dompurify";
import SaveTemplateModal from "../../common/SaveTemplateModal";

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
    const [availableTemplates, setAvailableTemplates] = useState([])
    const [publicTemplates, setPublicTemplates] = useState([])
    const [loadingTemplates, setLoadingTemplates] = useState(false)
    const [templateModalOpen, setTemplateModalOpen] = useState(false)
    const [templateSource, setTemplateSource] = useState('public') 
    const [savingTemplate, setSavingTemplate] = useState(false)

    // Open the Save Template modal
    const openSaveTemplateModal = (source = 'public') => {
        setTemplateSource(source)
        setTemplateModalOpen(true)
    }

    // Save template handler
    const handleSubmitTemplate = async ({ name, visibility, source }) => {
        try {
            setSavingTemplate(true)

            const { data: userData } = await supabase.auth.getUser()
            const uid = userData?.user?.id
            if (!uid || !activeWorkspaceId) {
            setErrorMsg('Not signed in or no workspace.')
            return
            }

            // choose which editor content to save
            const content = source === 'private'
            ? (privateJson || { type: 'doc', content: [{ type: 'paragraph' }] })
            : (publicJson || { type: 'doc', content: [{ type: 'paragraph' }] })

            const { error } = await supabase.from('note_templates').insert({
            name,
            content_json: content,     // TipTap JSON
            visibility,                // 'private' | 'workspace'
            owner_id: uid,
            workspace_id: activeWorkspaceId,
            })

            if (error) {
            console.error(error)
            setErrorMsg('Failed to save template.')
            } else {
            setSuccessMsg('✅ Template saved')
            // refresh the dropdown if you’re showing templates
            if (typeof loadTemplates === 'function') await loadTemplates()
            setTemplateModalOpen(false)
            }
        } finally {
            setSavingTemplate(false)
        }
    }

    // ✅ Fetch and set active workspace on mount
    // 1) On mount, pick an active workspace ID for this user
    useEffect(() => {
        (async () => {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) return;

        const { data: membership } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (membership?.workspace_id) {
            setActiveWorkspaceId(membership.workspace_id);
            console.log("Active Workspace ID:", membership.workspace_id);
        } else {
            console.warn("⚠️ No workspace found for user.");
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

    // ✅ Handle tag addition
    const handleTagAdd = async () => {
        if (!newTag.trim()) return;

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user?.id) {
        console.error("Unable to get user.");
        return;
        }

        if (!availableTags.includes(newTag)) {
        await supabase.from("vault_tags").insert({
            name: newTag,
            section: "Workspace",
            user_id: user.id,
            workspace_id: activeWorkspaceId,
        });
        setAvailableTags((prev) => [...prev, newTag]);
        }

        if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
        setNewTag("");
    };

    // Load both workspace-shared and my private templates
    const loadTemplates = useCallback(async () => {
        if (!activeWorkspaceId) return
        setLoadingTemplates(true)

        const { data: userData } = await supabase.auth.getUser()
        const uid = userData?.user?.id
        if (!uid) { setLoadingTemplates(false); return }

        const { data, error } = await supabase
            .from('note_templates')
            .select('id, name, content_json, visibility, owner_id, workspace_id')
            .eq('workspace_id', activeWorkspaceId)
            .or(`visibility.eq.workspace,owner_id.eq.${uid}`)
            .order('name', { ascending: true })

        if (!error) setPublicTemplates(data || [])
        setLoadingTemplates(false)
        }, [activeWorkspaceId])

        useEffect(() => {
        let mounted = true
        ;(async () => { if (mounted) await loadTemplates() })()
        return () => { mounted = false }
    }, [loadTemplates])

    async function saveCurrentAsTemplate({ source = 'public' } = {}) {
        const { data: userData } = await supabase.auth.getUser()
        const uid = userData?.user?.id
        if (!uid || !activeWorkspaceId) { setErrorMsg('Not signed in.'); return }

        // choose which editor’s JSON to save
        const content = source === 'private'
            ? (privateJson || { type: 'doc', content: [{ type: 'paragraph' }] })
            : (publicJson  || { type: 'doc', content: [{ type: 'paragraph' }] })

        const name = window.prompt('Template name?', 'New template')
        if (!name) return

        const share = window.confirm('Share with workspace? (OK = Yes, Cancel = Private)')
        const visibility = share ? 'workspace' : 'private'

        const { error } = await supabase.from('note_templates').insert({
            name,
            content_json: content,        // TipTap JSON
            visibility,                   // 'workspace' | 'private'
            owner_id: uid,
            workspace_id: activeWorkspaceId,
        })

        if (error) {
            setErrorMsg('Failed to save template.')
        } else {
            setSuccessMsg('✅ Template saved')
            loadTemplates() // refresh dropdown
        }
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

            <div className="relative max-w-xl mx-auto mt-10 p-6 bg-white rounded shadow border border-gray-200">
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

                <h2 className="text-xl font-bold mb-4 text-gray-800">📝 Upload to {wsName}</h2>

                {/* Privacy Section */}
                <div className="mb-4">
                    <label className="mr-4 font-semibold text-gray-800 text-sm">Upload Type:</label>
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

                <label className="block text-sm font-medium mb-1 text-gray-700">Note title:</label>
                <input
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value);
                        setHasUnsavedChanges(true);
                    }}
                    className="w-full p-2 mb-4 border rounded text-gray-700 text-sm bg-gray-50"
                    placeholder="Enter note title (Public)"
                />

                {/* Notes */}
                <div className="text-sm font-medium mb-4 text-gray-800">
                    <div className="mb-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-baseline gap-2">
                            <h2 className="text-sm font-medium text-gray-800 m-0">Public note:</h2>
                            {/* {loadingTemplates && (
                                <span className="text-xs text-gray-500">Loading templates…</span>
                            )} */}
                            </div>

                            {/* <button
                            type="button"
                            onClick={() => openSaveTemplateModal('public')}
                            className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                            >
                                Save current as template
                            </button> */}
                        </div>
                    </div>
                    <RichTextEditor
                        valueJSON={publicJson}
                        onChangeJSON={(json, html) => { setPublicJson(json); setPublicHtml(html); }}
                        templates={publicTemplates}
                    />
                </div>

                {/* Tag Input Section */}
                <div className="mb-5">
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

                {isVaulted && (
                    <>
                    {/* Private Note Section */}
                    <p className="text-sm text-red-500 mb-1">
                        🔐 Private note: will be encrypted using your saved Vault Code
                    </p>
                    <div className="text-sm font-medium mb-4 text-gray-800">
                        <RichTextEditor
                        valueJSON={privateJson}
                        onChangeJSON={(json, html) => { setPrivateJson(json); setPrivateHtml(html); }}
                        />
                    </div>
                    {/* Vault Code Section */}
                    <label className="block text-sm font-medium mb-1 text-gray-700">
                        Enter Private vault code to encrypt note:
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
            </div>

            {/* Save Template Modal */}
            <SaveTemplateModal
            open={templateModalOpen}
            onClose={() => setTemplateModalOpen(false)}
            onSubmit={handleSubmitTemplate}
            source={templateSource}
            defaultVisibility="private"
            submitting={savingTemplate}
            />
        </Layout>
    );
};

export default WorkspaceUploadNote;
