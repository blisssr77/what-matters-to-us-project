import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText, encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { X } from "lucide-react";
import bcrypt from "bcryptjs";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";
import DOMPurify from 'dompurify'
import { generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import RichTextEditor from '@/components/Editors/RichTextEditor'
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

    // For TipTap editor
    const [publicJson, setPublicJson] = useState()
    const [publicHtml, setPublicHtml] = useState('')
    const [privateJson, setPrivateJson] = useState()

    // Tag-related
    const [availableTags, setAvailableTags] = useState([]);
    const [newTag, setNewTag] = useState("");
    const [tags, setTags] = useState([]);

    // New calendar-related states
    const [calendarPayload, setCalendarPayload] = useState(null);
    const [editRow, setEditRow] = useState(null); // for future use if editing existing rows

    // Prepare initial calendar payload when editRow is set (for future use)
    const calendarInitial = useMemo(() => (
        editRow ? {
            calendar_enabled: !!editRow.calendar_enabled,
            start_at: editRow.start_at,
            end_at: editRow.end_at,
            all_day: !!editRow.all_day,
            calendar_color: editRow.calendar_color,
            calendar_status: editRow.calendar_status,
            calendar_visibility: editRow.calendar_visibility,
            calendar_repeat: editRow.calendar_repeat,
            calendar_repeat_until: editRow.calendar_repeat_until,
            calendar_window_start: editRow.calendar_window_start,
            calendar_window_end: editRow.calendar_window_end,
        } : {}
    ), [editRow]);

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
        let ignore = false;
        if (!id || !activeWorkspaceId) return;

        (async () => {
            // 1) Fetch the note row
            const { data: note, error } = await supabase
                .from('workspace_vault_items')
                .select('*')
                .eq('id', id)
                .eq('workspace_id', activeWorkspaceId)
                .single();

            if (error) {
                if (!ignore) setErrorMsg('Failed to load note.');
                console.error('Error fetching note:', error);
                return;
            }
            if (!note) return;

            if (!ignore) {
                // Keep the whole row for calendarInitial + other fields
                setEditRow(note);

                // Core fields
                setNoteData(note);
                setEditedTitle(note.title || '');
                setTags(Array.isArray(note.tags) ? note.tags : []);
                setIsVaulted(!!note.is_vaulted);

                // Public editor hydration
                if (note.public_note_html && typeof note.public_note_html === 'string') {
                    setPublicHtml(note.public_note_html);
                    const json = generateJSON(note.public_note_html, [
                    StarterKit,
                    TextAlign.configure({ types: ['heading', 'paragraph'] }),
                    ]);
                    setPublicJson(json);
                } else if (note.notes) {
                    // Fallback: plain notes string → simple doc JSON
                    const paragraphs = String(note.notes).split('\n').map(line =>
                    line ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
                        : { type: 'paragraph' }
                    );
                    setPublicJson({ type: 'doc', content: paragraphs });
                    setPublicHtml(DOMPurify.sanitize(String(note.notes).replace(/\n/g, '<br/>')));
                } else {
                    setPublicJson({ type: 'doc', content: [{ type: 'paragraph' }] });
                    setPublicHtml('');
                }

                // Private editor: only hydrate if user has already unlocked (optional)
                const storedVaultCode = sessionStorage.getItem('vaultCode');
                if (note.encrypted_note && note.note_iv && storedVaultCode) {
                    try {
                    const decrypted = await decryptText(note.encrypted_note, note.note_iv, storedVaultCode);
                    if (!ignore) setPrivateJson(decrypted);
                    } catch (err) {
                    console.error('Failed to decrypt private note:', err);
                    if (!ignore) setPrivateJson('🔐 Encrypted');
                    }
                } else {
                    setPrivateJson('');
                }
            }

            // 2) Workspace tag list
            const { data: tagRows, error: tagErr } = await supabase
            .from('vault_tags')
            .select('name')
            .eq('workspace_id', activeWorkspaceId);

            if (!ignore && !tagErr) {
            setAvailableTags((tagRows || []).map(t => t.name));
            }
        })();

        return () => { ignore = true; };
    }, [id, activeWorkspaceId]);

    // Update publicJson and publicHtml when noteData changes
    useEffect(() => {
        if (!noteData) return

        // PUBLIC — prefer HTML column; fallback to legacy plain text
        if (noteData.public_note_html) {
            setPublicHtml(noteData.public_note_html)
            const json = generateJSON(noteData.public_note_html, [
            StarterKit,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            ])
            setPublicJson(json)
        } else if (noteData.notes) {
            // build a minimal JSON doc from plain text (legacy)
            const paragraphs = String(noteData.notes).split('\n').map(line => (
            line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }
            ))
            const json = { type: 'doc', content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] }
            setPublicJson(json)
            setPublicHtml(DOMPurify.sanitize(noteData.notes.replace(/\n/g, '<br/>')))
        }

        // PRIVATE — if already decrypted earlier, setPrivateJson(parsed)
        // Otherwise keep it undefined until user unlocks & call decrypt flow on this page.
    }, [noteData])

    // Ensure selected tags are visible even if legacy/user-only
    const tagOptions = useMemo(
        () => Array.from(new Set([...(availableTags || []), ...(tags || [])])),
        [availableTags, tags]
    );

    // Handle decryption
    const handleDecrypt = async (codeParam = vaultCode) => {
        // Only decrypt if vaulted
        if (!noteData?.is_vaulted) {
            console.warn('Note is not vaulted. Skipping decryption.')
            return
        }

        // prefer explicit param, else session, else state
        const sessionCode = sessionStorage.getItem('vaultCode') || ''
        const code = String(codeParam || sessionCode || '').trim()
        if (!code) {
            setErrorMsg('Please enter your Vault Code.')
            return
        }

        setLoading(true)
        setErrorMsg('')

        // 1) Verify workspace code
        const { data: ok, error: vErr } = await supabase.rpc('verify_workspace_code', {
            p_workspace: activeWorkspaceId,
            p_code: code,
        })
        if (vErr) {
            setLoading(false)
            setErrorMsg(vErr.message || 'Verification failed.')
            return
        }
        if (!ok) {
            setLoading(false)
            setErrorMsg('Incorrect Vault Code.')
            return
        }

        // 2) Pick ciphertext/iv (new cols first, then legacy)
        const ciphertext =
            noteData?.private_note_ciphertext ||
            noteData?.encrypted_note ||
            null

        const ivToUse =
            noteData?.private_note_iv ||
            noteData?.note_iv ||
            noteData?.iv ||
            null

        const fmt = noteData?.private_note_format || 'tiptap_json'

        if (!ciphertext || !ivToUse) {
            setLoading(false)
            setErrorMsg('This note has no encrypted content to decrypt.')
            return
        }

        // Try both common decryptText signatures to match your util
        const tryDecrypt = async () => {
            try {
            // (cipher, code, iv)
            return await decryptText(ciphertext, code, ivToUse)
            } catch {
            // (cipher, iv, code) legacy
            return await decryptText(ciphertext, ivToUse, code)
            }
        }

        try {
            const plaintext = await tryDecrypt() // UTF-8 string

            // 3) Parse into TipTap JSON for the editor
            if (fmt === 'tiptap_json') {
            try {
                const parsed = JSON.parse(plaintext)
                setPrivateJson(parsed)
            } catch {
                // Fallback: treat as HTML if JSON parse fails
                const json = generateJSON(plaintext, [
                StarterKit,
                TextAlign.configure({ types: ['heading', 'paragraph'] }),
                ])
                setPrivateJson(json)
            }
            } else if (fmt === 'html') {
                const json = generateJSON(plaintext, [
                    StarterKit,
                    TextAlign.configure({ types: ['heading', 'paragraph'] }),
                ])
                setPrivateJson(json)
            } else {
            // Unknown format → try JSON, else wrap as plain paragraph
            try {
                const parsed = JSON.parse(plaintext)
                setPrivateJson(parsed)
            } catch {
                setPrivateJson({
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: plaintext }] }],
                })
            }
            }
            console.log('Decrypting with:', {
                hasNew: !!(noteData?.private_note_ciphertext && noteData?.private_note_iv),
                hasLegacy: !!(noteData?.encrypted_note && (noteData?.note_iv || noteData?.iv)),
                fmt: noteData?.private_note_format,
            })
            setEditedTitle(noteData?.title || '')
            sessionStorage.setItem('vaultCode', code)
        } catch (err) {
            console.error('Decryption error:', err)
            setErrorMsg('Failed to decrypt note.')
        } finally {
            setLoading(false)
        }
    }
    // 🔐 Auto-decrypt if we have a remembered code and encrypted content
    useEffect(() => {
        if (!noteData?.is_vaulted) return
        const storedCode = sessionStorage.getItem('vaultCode') || ''

        const hasNew = !!(noteData?.private_note_ciphertext && noteData?.private_note_iv)
        const hasLegacy = !!(noteData?.encrypted_note && (noteData?.note_iv || noteData?.iv))

        if (storedCode && (hasNew || hasLegacy)) {
            handleDecrypt(storedCode)
        }
    }, [noteData?.id]) // depend on id only to avoid loops

    // ================================ Handle saving the edited note ================================
    // Validate and save both public and private parts
    const handleSave = async () => {
        setSaving(true)
        setErrorMsg('')
        setSuccessMsg('')

        const { data: { user } = {} } = await supabase.auth.getUser()
        if (!user?.id) {
            setErrorMsg('User not authenticated.')
            setSaving(false)
            return
        }

        // Prepare PUBLIC fields
        const cleanPublicHtml = publicHtml ? DOMPurify.sanitize(publicHtml) : ''
        const publicText = cleanPublicHtml
            ? (() => {
                const el = document.createElement('div')
                el.innerHTML = cleanPublicHtml
                return (el.textContent || el.innerText || '').trim()
            })()
            : ''

        // Prepare PRIVATE if saving vaulted
        let private_note_ciphertext = null
        let private_note_iv = null
        if (isVaulted && privateJson) {
            const sessionCode = sessionStorage.getItem('vaultCode') || ''
            const code = String(vaultCode || sessionCode || '').trim()
            if (!code) {
                setErrorMsg('Vault Code is required to save the private note.')
                setSaving(false)
                return
            }

            // verify workspace code
            const { data: ok, error: vErr } = await supabase.rpc('verify_workspace_code', {
                p_workspace: activeWorkspaceId,
                p_code: code,
            })
            if (vErr) {
                setErrorMsg(vErr.message || 'Verification failed.')
                setSaving(false)
                return
            }
            if (!ok) {
                setErrorMsg('Incorrect Vault Code.')
                setSaving(false)
                return
            }

            // encrypt TipTap JSON
            const plaintext = JSON.stringify(privateJson)
            const { encryptedData, iv } = await encryptText(plaintext, code) // returns base64 strings
            private_note_ciphertext = encryptedData
            private_note_iv = iv

            // remember for this tab
            sessionStorage.setItem('vaultCode', code)
        }

        // ---- Calendar handling (EDIT) ----
        const calErr = validateCalendarPayload(calendarPayload);
        if (calErr) {
            setSaving(false);
            setErrorMsg(calErr);
            return;
        }

        const calBlock = normalizeCalendarBlock(calendarPayload, isVaulted);

        // Build payload to match your schema
        const updatePatch = {
            title: editedTitle || null,
            tags: (tags || []).map(t => t.trim()).filter(Boolean),

            // PUBLIC
            public_note_html: cleanPublicHtml || null,
            notes: publicText || null,                         // plain text (search/back-compat)
            summary: publicText ? publicText.slice(0, 160) : null,

            // PRIVATE
            is_vaulted: !!(isVaulted && privateJson),
            private_note_ciphertext: isVaulted && privateJson ? private_note_ciphertext : null,
            private_note_iv: isVaulted && privateJson ? private_note_iv : null,
            private_note_format: isVaulted && privateJson ? 'tiptap_json' : null,

            // clear legacy to avoid duplication
            encrypted_note: null,
            note_iv: null,

            updated_at: new Date().toISOString(),
            ...(calBlock ?? {}),  // if null (untouched), we don't touch calendar columns
        }

        const { error: updateError } = await supabase
            .from('workspace_vault_items')
            .update(updatePatch)
            .eq('id', id)
            .eq('workspace_id', activeWorkspaceId)

        if (updateError) {
            console.error('Update error:', updateError)
            setErrorMsg('Failed to update note.')
        } else {
            setSuccessMsg('✅ Note updated successfully!')
            setHasUnsavedChanges(false)
            setTimeout(() => navigate('/workspace/vaults/'), 1200)
        }

        setSaving(false)
    }

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

           <FullscreenCard className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
                <CardHeaderActions onClose={() => navigate('/workspace/vaults')} />

                <h2 className="text-xl font-bold mb-5 text-gray-900">{editedTitle}</h2>

                {/* Public / Private toggle */}
                <div className="mb-3 text-sm">
                    <label className="mr-4 font-bold text-gray-800">Note Type:</label>
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
                    {/* Vaulted warning */}
                    {isVaulted && (
                        <h2 className="text-xs text-purple-500 mt-1">
                            Switching to Public will permanently delete the Private note.
                        </h2>
                    )}
                </div>

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

                {/* Public Notes */}
                <div className="text-sm mb-4 text-gray-800">
                    <label className="text-sm font-bold text-gray-800 mb-1 block">Edit public note:</label>
                    <div className="bg-white border border-gray-200 rounded p-3 mb-4">
                        <RichTextEditor
                        key={`pub-${id}`}
                        valueJSON={publicJson}
                        onChangeJSON={(json, html) => {
                            setPublicJson(json)
                            setPublicHtml(html)              // sanitized on save
                            setHasUnsavedChanges(true)
                        }}
                        />
                    </div>
                </div>

                {/* Vaulted Note Section */}
                {isVaulted && (
                    <>
                    <div className="text-sm font-medium mb-4 text-gray-800">
                        {/* Private Note Input */}
                        <p className="text-sm text-red-500 mb-1 font-bold">
                            🔐 Private note: will be encrypted using your Workspace Vault Code.
                        </p>
                        <div className="bg-white border border-gray-200 rounded p-3 mb-4">
                            <RichTextEditor
                            key={`priv-${id}`}
                            valueJSON={privateJson}
                            onChangeJSON={(json) => {
                                setPrivateJson(json)
                                setHasUnsavedChanges(true)
                            }}
                            />
                        </div>
                    </div>
                    </>
                )}

                {/* Tag Input Section */}
                <div className="mb-5">
                    <label className="block text-sm font-bold mb-1 text-gray-800">Tags:</label>
                    <div className="flex gap-2">
                        <input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        className="border bg-gray-50 rounded px-2 py-1 text-sm flex-1 text-gray-800"
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

                {/* Vault Code */}
                {isVaulted && (
                <>
                    <div>
                        <label className="block text-sm font-bold mb-1 text-gray-800">
                            Re-enter Workspace vault code to encrypt:
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

                {/* Calendar Integration */}
                <AddToCalendar
                    isVaulted={isVaulted}
                    initial={calendarInitial}
                    defaultColor="#f59e0b"
                    onChange={setCalendarPayload}
                />

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
            </FullscreenCard>
        </Layout>
    );
}