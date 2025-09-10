import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { Loader2, X, Search } from "lucide-react";
import Layout from "../../Layout/Layout";
import { encryptText, encryptFile } from "../../../lib/encryption"; 
import bcrypt from "bcryptjs";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";
import FullscreenCard from "@/components/Layout/FullscreenCard";
import CardHeaderActions from "@/components/Layout/CardHeaderActions";
import { addWorkspaceTag } from "@/lib/tagsApi";

import AddToCalendar from "@/components/Calendar/AddToCalendar";
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import tzPlugin from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(tzPlugin)


export default function WorkspaceUploadDoc() {
    const [files, setFiles] = useState([]);
    const [tags, setTags] = useState([]);
    const [availableTags, setAvailableTags] = useState([]);
    const [newTag, setNewTag] = useState("");
    const [notes, setNotes] = useState("");
    const [privateNote, setPrivateNote] = useState("");
    const [uploading, setUploading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [dragging, setDragging] = useState(false);
    const [title, setTitle] = useState("");
    const [vaultCode, setVaultCode] = useState("");
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);
    const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();
    const [isVaulted, setIsVaulted] = useState(true);
    const [wsName, setWsName] = useState("");

    // New calendar-related states
    const [calendarPayload, setCalendarPayload] = useState(null);
    const [editRow, setEditRow] = useState(null); // for future use if editing existing rows
    const enabled = !!calendarPayload?.calendar_enabled;
    const startISO = calendarPayload?.start_at || null;
    const allDay   = !!calendarPayload?.all_day;

    const navigate = useNavigate();

    // Allowed MIME types for file uploads
    const allowedMimes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv",
        "image/jpeg",
        "image/png"
    ];

    // Fetch active workspace ID on mount
    // 1) On mount, pick an active workspace ID for this user
    useEffect(() => {
        (async () => {
            const { data: userData } = await supabase.auth.getUser();
            const userId = userData?.user?.id;
            if (!userId) return;

            const { data, error } = await supabase
            .from('workspace_members')
            .select('workspace_id, created_at')  // minimal columns
            .eq('user_id', userId)
            .order('created_at', { ascending: false }) // newest membership first
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

    // On mount, fetch default workspace if none set
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


    // Fetch available tags on component mount
    useEffect(() => {
        if (!activeWorkspaceId) return;
        const fetchTags = async () => {
            const { data, error } = await supabase.from("vault_tags").select("*").eq("workspace_id", activeWorkspaceId);
            if (!error) setAvailableTags(data.map((tag) => tag.name));
        };
        fetchTags();
    }, [activeWorkspaceId]);

    // Handle file drop
    const handleFileDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const droppedFiles = Array.from(e.dataTransfer.files);
        setFiles(droppedFiles);
    };

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

    // ==================================== Handle file upload ====================================
    const handleUpload = async (e) => {
        e.preventDefault();
        setUploading(true);
        setErrorMsg("");
        setSuccessMsg("");

        // Validate files
        if (!files.length) {
            setUploading(false);
            setErrorMsg("⚠️ Please attach file(s) before uploading.");
            return;
        }

        const invalidFiles = files.filter((f) => !allowedMimes.includes(f.type));
        if (invalidFiles.length > 0) {
            setUploading(false);
            setErrorMsg("One or more files have unsupported types.");
            return;
        }

        // Authenticate user
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) {
            setUploading(false);
            setErrorMsg("User not authenticated.");
            return;
        }

        // Check Vault Code if needed (Model A: per-user workspace code)
        if (isVaulted) {
            const code = (vaultCode || "").trim();
            if (!code) {
                setUploading(false);
                setErrorMsg("Please enter your Vault Code.");
                return;
            }

            const { data: ok, error } = await supabase.rpc("verify_workspace_code", {
                p_workspace: activeWorkspaceId,
                p_code: code,
            });

            if (error) {
                setUploading(false);
                setErrorMsg(error.message || "Verification failed.");
                return;
            }
            if (!ok) {
                setUploading(false);
                setErrorMsg("Incorrect Vault Code.");
                return;
            }
        }

        if (!activeWorkspaceId) {
            setUploading(false);
            setErrorMsg("Workspace not selected. Please refresh or select a workspace.");
            return;
        }

        const fileMetas = [];
        let uploadedCount = 0;
        let noteIv = "";

        for (const file of files) {
            try {
                const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
                const filePath = `${activeWorkspaceId}/${Date.now()}-${sanitizedName}`;

                let ivHex = "";
                let uploadError, urlData;

                if (isVaulted) {
                    const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
                    const { encryptedBlob, ivHex: hex } = await encryptFile(file, vaultCode, ivBytes);
                    ivHex = hex;

                    ({ error: uploadError } = await supabase.storage
                        .from("workspace.vaulted")
                        .upload(filePath, encryptedBlob, {
                            contentType: file.type,
                            upsert: false,
                            metadata: { user_id: userId, workspace_id: activeWorkspaceId },
                        }));

                    ({ data: urlData } = supabase.storage
                        .from("workspace.vaulted")
                        .getPublicUrl(filePath));
                } else {
                    ({ error: uploadError } = await supabase.storage
                        .from("workspace.public")
                        .upload(filePath, file, {
                            contentType: file.type,
                            upsert: false,
                            metadata: { user_id: userId, workspace_id: activeWorkspaceId },
                        }));

                    ({ data: urlData } = supabase.storage
                        .from("workspace.public")
                        .getPublicUrl(filePath));
                }

                if (uploadError || !urlData?.publicUrl) {
                    console.error("Upload failed:", uploadError);
                    continue;
                }

                fileMetas.push({
                    name: file.name,
                    url: urlData.publicUrl,
                    iv: ivHex,
                    type: file.type,
                    path: filePath,
                    user_id: userId,
                    workspace_id: activeWorkspaceId,
                });

                uploadedCount++;
            } catch (err) {
                console.error("Unexpected upload error:", err);
            }
        }

        if (!fileMetas.length) {
            setUploading(false);
            setErrorMsg("Upload failed for all files.");
            return;
        } else if (uploadedCount < files.length) {
            setErrorMsg(`⚠️ Only ${uploadedCount} of ${files.length} files uploaded successfully.`);
        }

        // Encrypt private note if provided
        let encryptedNote = "";
        if (isVaulted && privateNote) {
            try {
                const result = await encryptText(privateNote, vaultCode);
                encryptedNote = result.encryptedData;
                noteIv = result.iv;
            } catch (err) {
                console.error("Note encryption failed:", err);
                setUploading(false);
                setErrorMsg("Failed to encrypt private note.");
                return;
            }
        }

        // Ensure tags exist
        for (const tag of tags) {
            if (!availableTags.includes(tag)) {
                const { error } = await supabase.from("vault_tags").insert({
                    name: tag,
                    section: "Workspace",
                    user_id: userId,
                    workspace_id: activeWorkspaceId,
                });

                if (!error) {
                    setAvailableTags((prev) => [...prev, tag]);
                } else {
                    console.error("❌ Failed to insert tag:", tag, error.message);
                }
            }
        }

        // ---- Calendar defaults (when disabled) ----
        const CAL_DEFAULTS = {
            calendar_enabled: false,
            start_at: null,
            end_at: null,
            all_day: false,
            calendar_color: null,
            calendar_status: null,
            assignee_id: null,
            calendar_visibility: null,
        };

        // ---- Validate payload from <AddToCalendar /> ----
        const enabled = !!calendarPayload?.calendar_enabled;
        const startISO = calendarPayload?.start_at || null;
        let   endISO   = calendarPayload?.end_at || null;

        // required start when enabled
        if (enabled && !startISO) {
            setErrorMsg(allDay
                ? 'Please pick a date for the calendar entry.'
                : 'Please pick a start date/time for the calendar entry.'
            );
            setUploading(false);
            return;
        }

        // normalize empties
        const norm = (v) => (v === '' ? null : v);

        // ensure end >= start (if both provided)
        if (enabled && startISO && endISO && new Date(endISO) < new Date(startISO)) {
            // you can also auto-fix: endISO = startISO;
            setErrorMsg('End time must be after the start time.');
            setUploading(false);
            return;
        }

        // build the calendar block we’ll write
        const calBlock = enabled
        ? {
            ...calendarPayload,
            start_at: startISO,
            end_at: norm(endISO),
            // if you want to force visibility by vaulted-ness, override only when missing:
            calendar_visibility:
                calendarPayload.calendar_visibility ??
                (isVaulted ? 'masked' : 'public'),
            }
        : { ...CAL_DEFAULTS };

        // ---- Final row ----
        const row = {
            user_id: userId,
            file_name: files.map(f => f.name).join(', '),
            file_metas: fileMetas,
            title,
            tags,
            notes,
            encrypted_note: encryptedNote,
            note_iv: noteIv,
            created_at: new Date().toISOString(),      // (optional; DB default can handle)
            workspace_id: activeWorkspaceId,
            created_by: userId,
            is_vaulted: isVaulted,
            ...calBlock,
        };

        const { error: insertError } = await supabase
        .from('workspace_vault_items')
        .insert(row);

        if (insertError) {
            console.error(insertError);
            setErrorMsg('Failed to save document.');
        } else {
            setSuccessMsg('✅ Files uploaded successfully!');
            setTimeout(() => navigate('/workspace/vaults'), 1300);
        }

        setUploading(false);
        setHasUnsavedChanges(false);
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

            <FullscreenCard className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
                <CardHeaderActions onClose={() => navigate('/workspace/vaults')} />

                <h2 className="text-xl font-semibold text-gray-800 mb-4">📤 Upload to {wsName}</h2>
                <p className="text-xs text-blue-700 mt-1">
                    Supported: PDF, Word, Excel, PowerPoint, Text, CSV, JPG, PNG, GIF, ZIP, JSON
                </p>

                <form onSubmit={handleUpload} className="space-y-5">
                    {/* Drag & Drop */}
                    <div
                        onDrop={handleFileDrop}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        className={`w-full h-32 border-2 border-dashed rounded-lg flex items-center justify-center text-gray-500 cursor-pointer ${
                            dragging ? "border-purple-500 bg-purple-50" : "border-gray-300"
                        }`}
                    >
                    {files.length > 0 ? (
                        <ul className="text-sm space-y-1">
                            {files.map((file, idx) => (
                            <li key={idx}>{file.name}</li>
                            ))}
                        </ul>
                        ) : (
                        <span className="text-sm">Drag & Drop your file(s) here or use browse below <br /><br />Format not exeeding 10 MB each</span>
                    )}
                    </div>
                    
                    {/* File input */}
                    <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png"
                        onChange={(e) => {
                            setFiles(Array.from(e.target.files));
                            setHasUnsavedChanges(true);
                        }}
                        className="w-full border border-gray-300 p-2 rounded text-gray-500 text-sm"
                    />

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

                    {/* Document title input */}
                    <div>
                        <label className="block text-sm font-bold mb-1 text-gray-800 mt-4">Document title:</label>
                        <input
                            value={title}
                            onChange={(e) => {
                                setTitle(e.target.value);
                                setHasUnsavedChanges(true);
                            }}
                            className="w-full p-2 border rounded text-gray-800 text-sm bg-gray-50"
                            placeholder="Enter document title (Public)"
                        />
                    </div>

                    {/* Tag Input Section */}
                    <div className="mb-4">
                        <label className="block font-bold text-sm mb-1 text-gray-800">Tags:</label>
                        <div className="flex gap-2">
                            <input
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                className="border bg-gray-50 rounded px-2 py-1 text-sm flex-1 text-gray-800"
                                placeholder="Add a tag"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleTagAdd();
                                    }
                                }}
                            />
                            <button type="button" onClick={handleTagAdd} className="btn-secondary">Add</button>
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

                    {/* Notes */}
                    <div>
                        <h className="text-sm font-bold mb-1 text-gray-800">Public note:</h>
                        <textarea
                            value={notes}
                            onChange={(e) => {
                                setNotes(e.target.value);
                                setHasUnsavedChanges(true);
                            }}
                            placeholder="Public notes (Visible to shared contacts)"
                            rows={2}
                            className="w-full border bg-gray-50 border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
                        />
                    </div>

                    {/* Private Note Section */}
                    {isVaulted && (
                        <>
                            <div>
                                <p className="text-sm font-bold text-red-500 mb-1">
                                🔐 Private note will be encrypted using your saved Vault Code:
                                </p>
                                <textarea
                                    value={privateNote}
                                    onChange={(e) => {
                                        setPrivateNote(e.target.value);
                                        setHasUnsavedChanges(true);
                                    }}
                                    placeholder="Private notes (For your eyes only)"
                                    rows={2}
                                    className="bg-gray-50 w-full border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
                                />
                            </div>

                            {/* Vault Code Section */}
                            <div>
                                <label className="block text-sm font-bold mb-1 text-gray-800">
                                    Enter Private vault code to encrypt document:
                                </label>
                                <input
                                    type="password"
                                    value={vaultCode}
                                    onChange={(e) => {
                                        setVaultCode(e.target.value);
                                    }}
                                    className="w-full p-2 border rounded mb-3 text-gray-600 text-sm bg-gray-50"
                                    placeholder="Vault code"
                                />
                            </div>
                        </>
                    )}
                    
                    {/* Calendar Integration Section */}
                    <AddToCalendar
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

                    {/* Validation message if calendar enabled but no start */}
                    {enabled && !startISO && (
                        <p className="mt-2 text-xs text-amber-600">
                            {allDay ? 'Please pick a date for the calendar entry.' 
                                    : 'Please pick a start date/time for the calendar entry.'}
                        </p>
                    )}

                    {/* Upload */}
                    <button
                        type="submit"
                        disabled={uploading}
                        className="btn-secondary w-full mt-4"
                        >
                        {uploading ? (
                            <span className="flex justify-center items-center gap-2">
                            <Loader2 className="animate-spin" size={16} /> Uploading...
                            </span>
                        ) : (
                            "Upload Document(s)"
                        )}
                    </button>

                    <br />
                    {successMsg && (
                        <p className="text-sm text-green-600 text-center">{successMsg}</p>
                    )}
                    {errorMsg && (
                        <div
                            className="text-sm text-red-500 mt-2 text-center"
                            dangerouslySetInnerHTML={{ __html: errorMsg }}
                        />
                    )}
                </form>
            </FullscreenCard>
        </Layout>
    );
}

