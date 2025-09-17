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

import AddToCalendar from "@/components/Calendar/AddToCalendar";
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import tzPlugin from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(tzPlugin)

// Derive storage path from a full URL (for signed URLs)
const CAL_DEFAULTS = {
  calendar_enabled: false,
  start_at: null,
  end_at: null,
  all_day: false,
  calendar_color: null,
  calendar_status: null,
  assignee_id: null,
  calendar_visibility: null,
  // include these if you support recurrence/windows
  calendar_repeat: null,
  calendar_repeat_until: null,
  calendar_window_start: null,
  calendar_window_end: null,
};

// Validate calendar payload; returns error string or null if valid
function validateCalendarPayload(payload) {
  if (payload == null) return null; // untouched = no validation needed
  const enabled = !!payload.calendar_enabled;
  if (!enabled) return null;        // disabled = ok
  const startISO = payload.start_at || null;
  const endISO   = payload.end_at   || null;

  if (!startISO) {
    return payload.all_day
      ? 'Please pick a date for the calendar entry.'
      : 'Please pick a start date/time for the calendar entry.';
  }
  if (startISO && endISO && new Date(endISO) < new Date(startISO)) {
    return 'End time must be after the start time.';
  }
  return null;
}

// Normalize calendar payload for DB storage
function normalizeCalendarBlock(payload, isVaulted) {
  if (payload == null) return null;               // untouched → don't include any calendar fields
  const enabled = !!payload.calendar_enabled;
  if (!enabled) return { ...CAL_DEFAULTS };       // explicitly turned OFF → clear all fields

  const startISO = payload.start_at || null;
  const endISO   = payload.end_at   || null;

  return {
    calendar_enabled: true,
    start_at: startISO,
    end_at: endISO || null,
    all_day: !!payload.all_day,
    calendar_color: payload.calendar_color || null,
    calendar_status: payload.calendar_status || null,
    assignee_id: payload.assignee_id || null,
    calendar_visibility:
      payload.calendar_visibility ?? (isVaulted ? 'masked' : 'public'),

    // include these if you support them
    calendar_repeat: payload.calendar_repeat ?? null,
    calendar_repeat_until: payload.calendar_repeat_until ?? null,
    calendar_window_start: payload.calendar_window_start ?? null,
    calendar_window_end: payload.calendar_window_end ?? null,
  };
}

const WorkspaceUploadNote = () => {
    const [title, setTitle] = useState("");
    const [uploading, setUploading] = useState(false);
    const [newTag, setNewTag] = useState("");
    const [tags, setTags] = useState([]);
    const [pendingTags, setPendingTags] = useState([]); // New state for tags to be added
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

    // Calendar states
    const [calendarPayload, setCalendarPayload] = useState(null);
    const [editRow, setEditRow] = useState(null); // for future use if editing existing rows

    // Fetch and set active workspace on mount
    // Keep name in sync for header/debug
    useEffect(() => {
        if (!activeWorkspaceId) { setWsName(''); return; }
        (async () => {
        const { data, error } = await supabase
            .from('workspaces')
            .select('name')
            .eq('id', activeWorkspaceId)
            .maybeSingle();
        setWsName(error ? '' : (data?.name || ''));
        })();
    }, [activeWorkspaceId]);

    // Debug
    useEffect(() => {
        console.log('W-UploadNote — activeWorkspaceId:', activeWorkspaceId, 'name:', wsName);
    }, [activeWorkspaceId, wsName]);

    // Fetch tags for this workspace (optionally filter by section='Workspace')
    useEffect(() => {
        (async () => {
        if (!activeWorkspaceId) { setAvailableTags([]); return; }
        const { data, error } = await supabase
            .from('vault_tags')
            .select('name')
            .eq('workspace_id', activeWorkspaceId);
            // .eq('section', 'Workspace') // uncomment if you scope by section
        if (error) { console.error('tag fetch failed:', error); setAvailableTags([]); return; }
        setAvailableTags([...new Set((data || []).map(t => t.name))]);
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

    // Fetch tags for this workspace
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

    // Helper. Warn about unsaved changes if navigating away
    const existsCI = (arr, val) =>
        arr.some(t => String(t).toLowerCase() === String(val).toLowerCase());

    //  Add tag (Workspace scope, deduped server-side)
    const handleTagAdd = () => {
        const raw = String(newTag || "").trim();
        if (!raw) return;

        // add to selected tags
        setTags(prev => (existsCI(prev, raw) ? prev : [...prev, raw]));

        // show in dropdown immediately (local-only)
        setAvailableTags(prev => (existsCI(prev, raw) ? prev : [...prev, raw]));

        // mark as “pending persist” only if not already known by backend list
        if (!existsCI(availableTags, raw)) {
            setPendingTags(prev => (existsCI(prev, raw) ? prev : [...prev, raw]));
        }

        setNewTag("");
    };

    // ------------------------------------------- Handle note upload -------------------------------------------
    const handleCreate = async () => {
        setUploading(true)
        setSuccessMsg('')
        setErrorMsg('')

        // basic validation
        if (!activeWorkspaceId) {
            setUploading(false);
            setErrorMsg('No active workspace selected yet. Please wait a moment and try again.');
            return;
        }

        // auth
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user
        if (!user?.id) {
            setUploading(false)
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
            setUploading(false)
            setErrorMsg('Nothing to save.')
            return
        }

        // verify workspace code only if saving vaulted content
        if (isVaulted && hasPrivate) {
            const code = (vaultCode || '').trim()
            if (!code) {
                setUploading(false)
                setErrorMsg('Please enter your Vault Code.')
                return
            }
            const { data: ok, error } = await supabase.rpc('verify_workspace_code', {
                p_workspace: activeWorkspaceId,
                p_code: code,
            })
            if (error) {
                setUploading(false)
                setErrorMsg(error.message || 'Verification failed.')
                return
            }
            if (!ok) {
                setUploading(false)
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
            setUploading(false)
            setErrorMsg('Encryption error.')
            return
        }

        // ---- Calendar handling (EDIT) ----
        const calErr = validateCalendarPayload(calendarPayload);
        if (calErr) {
            setUploading(false);
            setErrorMsg(calErr);
            return;
        }

        const calBlock = normalizeCalendarBlock(calendarPayload, isVaulted);

        // derive plain text + optional summary from public note (for search)
        const publicText = hasPublic ? stripHtmlToText(cleanPublicHtml) : null
        const summary = hasPublic ? publicText.slice(0, 160) : null

        // build payload to match your schema
        const row = {
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

            created_at: new Date().toISOString(),
            ...calBlock
        }

        const { error: insertError } = await supabase
            .from('workspace_vault_items')
            .insert(row)

        if (insertError) {
            console.error(insertError);
            setErrorMsg('Failed to create note.');
            } else {
                // 🔽 persist brand-new tags *after* the note is created
                try {
                    const { data: { user } = {} } = await supabase.auth.getUser();
                    if (user?.id && activeWorkspaceId && pendingTags.length) {
                        // persist each pending tag; ignore failures so create flow isn’t blocked
                        await Promise.allSettled(
                            pendingTags.map((name) =>
                            addWorkspaceTag(supabase, {
                                name,                        // preserve the original casing
                                workspaceId: activeWorkspaceId,
                                userId: user.id,
                            })
                        )
                    );
                }
            } catch (e) {
                console.warn('Tag persist (post-create) failed:', e);
                // optional toast only; don't block success flow
            } finally {
                setPendingTags([]); // clear either way
            }

            setSuccessMsg(' Note created successfully!');
            setHasUnsavedChanges(false);
            setTimeout(() => navigate('/workspace/vaults'), 900);
        }

        setUploading(false)
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

                <AddToCalendar
                    key={editRow?.id || 'new'}
                    isVaulted={isVaulted}
                    initial={editRow ? {
                        calendar_enabled: !!editRow.calendar_enabled,
                        start_at: editRow.start_at,
                        end_at: editRow.end_at,
                        all_day: !!editRow.all_day,
                        calendar_color: editRow.calendar_color,
                        calendar_status: editRow.calendar_status,
                        calendar_visibility: editRow.calendar_visibility,
                    } : {}}
                    onChange={setCalendarPayload}
                />

                <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!activeWorkspaceId || uploading}
                    className="btn-secondary w-full mt-4"
                >
                    {uploading ? "Creating..." : "Upload Note"}
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
