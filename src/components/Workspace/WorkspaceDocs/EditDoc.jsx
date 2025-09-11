import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import Layout from "../../Layout/Layout";
import { X, Search, Loader2 } from "lucide-react";
import { encryptFile, encryptText, decryptText, decryptFile } from "../../../lib/encryption";
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

export default function WorkspaceEditDoc() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [files, setFiles] = useState([]);
    const [existingFiles, setExistingFiles] = useState([]);
    const [dragging, setDragging] = useState(false);
    const [title, setTitle] = useState("");
    const [tags, setTags] = useState([]);
    const [availableTags, setAvailableTags] = useState([]);
    const [newTag, setNewTag] = useState("");
    const [notes, setNotes] = useState("");
    const [privateNote, setPrivateNote] = useState("");
    const [vaultCode, setVaultCode] = useState("");
    const [uploading, setUploading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [showConfirmPopup, setShowConfirmPopup] = useState(false);
    const [fileToDeleteIndex, setFileToDeleteIndex] = useState(null);
    const [filesToRemove, setFilesToRemove] = useState([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);
    const [isVaulted, setIsVaulted] = useState(false);
    const [initialIsVaulted, setInitialIsVaulted] = useState(null);

    const { activeWorkspaceId } = useWorkspaceStore();

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
        "image/png",
        "image/gif",
        "application/zip",
        "application/json",
    ];

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
    
    // Fetch document data and tags on mount
    useEffect(() => {
        let ignore = false;
        if (!id || !activeWorkspaceId) return;

        (async () => {
            // 1) Document
            const { data, error } = await supabase
                .from('workspace_vault_items')
                .select('*')
                .eq('id', id)
                .eq('workspace_id', activeWorkspaceId)
                .single();

            if (!ignore && !error && data) {
                setEditRow(data); // for future use if editing existing rows

                // hydrate other UI fields
                setTitle(data.title ?? '');
                setTags(Array.isArray(data.tags) ? data.tags : []);
                setNotes(typeof data.notes === 'string' ? data.notes : ''); // notes should be string
                setExistingFiles(Array.isArray(data.file_metas) ? data.file_metas : []);
                setIsVaulted(!!data.is_vaulted);
                setInitialIsVaulted(!!data.is_vaulted);

                // decrypt private note if we can
                const storedVaultCode = sessionStorage.getItem('vaultCode');
                if (data.encrypted_note && data.note_iv && storedVaultCode) {
                    try {
                        const decrypted = await decryptText(data.encrypted_note, data.note_iv, storedVaultCode);
                        if (!ignore) setPrivateNote(decrypted);
                    } catch (err) {
                        console.error('Failed to decrypt note:', err);
                        if (!ignore) setPrivateNote('🔐 Encrypted');
                    }
                } else {
                    if (!ignore) setPrivateNote('');
                }
            }

            // 2) Tags (workspace)
            const { data: tagRows } = await supabase
                .from('vault_tags')
                .select('name')
                .eq('workspace_id', activeWorkspaceId);

            if (!ignore) {
                setAvailableTags((tagRows || []).map(t => t.name));
            }
        })();

        return () => { ignore = true; };
        }, [id, activeWorkspaceId]);

    // Ensure selected tags are visible even if legacy/user-only
    const tagOptions = useMemo(
        () => Array.from(new Set([...(availableTags || []), ...(tags || [])])),
        [availableTags, tags]
    );

    // Handle file drop
    const handleFileDrop = (e) => {
        e.preventDefault();
        setDragging(false);

        const droppedFiles = Array.from(e.dataTransfer.files);
        setFiles((prevFiles) => {
            const newFiles = droppedFiles.filter(
                (file) => !prevFiles.some((f) => f.name === file.name && f.size === file.size)
            );
            return [...prevFiles, ...newFiles];
        });
    };

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

    // Parse storage path from any URL ------- HELPER function
    const parsePathFromAnyUrl = (url, bucket) => {
        try {
            const u = new URL(url);
            const p = decodeURIComponent(u.pathname);
            const pub = `/storage/v1/object/public/${bucket}/`;
            const pri = `/storage/v1/object/${bucket}/`; // signed URL style
            if (p.startsWith(pub)) return p.slice(pub.length);
            if (p.startsWith(pri)) return p.slice(pri.length);
            const i = p.indexOf(`/${bucket}/`);
            return i >= 0 ? p.slice(i + bucket.length + 2) : null;
        } catch {
            return null;
        }
    };
    const sanitizeName = (s) => (s || "file").replace(/[^\w.-]/g, "_");

    // Remove existing file from the list
    const handleRemoveExistingFile = (index) => {
        const meta = existingFiles[index];
        if (!meta) return;
        const token = meta.path || meta.url; // << path first, then url
        if (token) setFilesToRemove((prev) => [...prev, token]);
        setExistingFiles((prev) => prev.filter((_, i) => i !== index));
    };

    // Handle file upload and document update =============================================================
    const handleUpload = async (e) => {
        e.preventDefault();
        setUploading(true);
        setErrorMsg("");
        setSuccessMsg("");

        if (
            !files.length &&
            !privateNote &&
            !title &&
            !tags.length &&
            !notes &&
            filesToRemove.length === 0
        ) {
            setUploading(false);
            setErrorMsg("⚠️ Nothing to update.");
            return;
        }

        const invalidFiles = files.filter((f) => !allowedMimes.includes(f.type));
        if (invalidFiles.length > 0) {
            setUploading(false);
            setErrorMsg("One or more files have unsupported types.");
            return;
        }

        const { data: { user } = {} } = await supabase.auth.getUser();
        if (!user) {
            setUploading(false);
            setErrorMsg("User not authenticated.");
            return;
        }

        // Detect Vaulted → Public transition
        const wasVaulted   = !!initialIsVaulted;
        const goingPublic  = wasVaulted && !isVaulted;
        const goingVaulted = !wasVaulted && isVaulted;

        // You need a code when (a) staying vaulted (to encrypt new things) OR (b) going public (to decrypt old things)
        const code = String(vaultCode || sessionStorage.getItem("vaultCode") || "").trim();
        if (isVaulted || goingPublic) {
            if (!code) {
                setUploading(false);
                setErrorMsg(
                    goingPublic
                    ? "Please enter your Vault Code to migrate files to Public."
                    : "Please enter your Vault Code to encrypt the document."
                );
                return;
            }

            const { data: ok, error: vErr } = await supabase.rpc("verify_workspace_code", {
                p_workspace: activeWorkspaceId,
                p_code: code,
            });
            if (vErr || !ok) {
            setUploading(false);
            setErrorMsg(vErr?.message || "Verification failed. Check your Vault Code.");
            return;
        }

        sessionStorage.setItem("vaultCode", code);
        if (!vaultCode) setVaultCode(code);
        }

        // -------- Delete marked files from the correct bucket(s) --------
        // Build delete lists per bucket by inspecting meta (iv ⇒ vaulted) or URL prefix
        const byBucketToDelete = { "workspace.public": [], "workspace.vaulted": [] };

        for (const token of filesToRemove) {
        const meta = existingFiles.find(
            (f) => (f.path && f.path === token) || (f.url && f.url === token)
        );
        const wasVaulted = !!meta?.iv || (meta?.url || "").includes("workspace.vaulted");
        const bucket = wasVaulted ? "workspace.vaulted" : "workspace.public";

        let path = token;
        if (typeof token === "string" && token.includes("/storage/v1/object/")) {
            path = parsePathFromAnyUrl(token, bucket);
        }
        if (path) byBucketToDelete[bucket].push(path);
        }

        if (byBucketToDelete["workspace.public"].length) {
        const { error } = await supabase.storage
            .from("workspace.public")
            .remove(byBucketToDelete["workspace.public"]);
        if (error) console.warn("Delete public files:", error);
        }
        if (byBucketToDelete["workspace.vaulted"].length) {
        const { error } = await supabase.storage
            .from("workspace.vaulted")
            .remove(byBucketToDelete["workspace.vaulted"]);
        if (error) console.warn("Delete vaulted files:", error);
        }

        const deletedSet = new Set(Object.values(byBucketToDelete).flat());
        const normPath = (m) => m.path || (m.url ? (
        parsePathFromAnyUrl(m.url, m.iv ? "workspace.vaulted" : "workspace.public")
        ) : null);

        let updatedFileMetas = (existingFiles || []).filter((m) => {
            const p = normPath(m);
            return p ? !deletedSet.has(p) : true;
        });

        // -------- If going Public, migrate remaining vaulted files to public --------
        if (goingPublic) {
            const migrated = [];
            let migrationFailed = false;

            for (const meta of updatedFileMetas) {
                const wasVaulted = !!meta.iv || (meta.url || "").includes("workspace.vaulted");

                // Already public → keep, but clear iv defensively
                if (!wasVaulted) {
                migrated.push({ ...meta, iv: "" });
                continue;
                }

                // 1) download encrypted from vaulted
                const oldBucket = "workspace.vaulted";
                const encPath =
                meta.path || derivePathFromUrl(meta.url, oldBucket);
                if (!encPath) {
                    console.warn("Could not derive vaulted path for meta:", meta);
                    migrated.push(meta);           // keep original so we don't lose it
                    migrationFailed = true;
                    continue;
                }

                const { data: encFile, error: dlErr } = await supabase.storage
                .from(oldBucket)
                .download(encPath);
                if (dlErr) {
                    console.error("Download vaulted failed:", dlErr, encPath);
                    migrated.push(meta);           // keep original
                    migrationFailed = true;
                    continue;
                }

                // 2) decrypt
                let plainBlob;
                try {
                    const encBuf = await encFile.arrayBuffer();
                    const mime = meta.type || "application/octet-stream";
                    plainBlob = await decryptFile(encBuf, meta.iv, code, mime);
                } catch (e2) {
                    console.error("Decrypt vaulted file failed:", e2, meta);
                    migrated.push(meta);           // keep original
                    migrationFailed = true;
                    continue;
                }

                // 3) upload plaintext to public
                const newBucket = "workspace.public";
                const newPath = `${activeWorkspaceId}/${Date.now()}-${sanitizeName(meta.name)}`;
                const { error: upErr } = await supabase.storage
                .from(newBucket)
                .upload(newPath, plainBlob, { contentType: meta.type || "application/octet-stream", upsert: false });
                if (upErr) {
                    console.error("Upload public failed:", upErr, newPath);
                    migrated.push(meta);           // keep original
                    migrationFailed = true;
                    continue;
                }

                // 4) public URL + new meta (no iv)
                const { data: urlData } = await supabase.storage
                .from(newBucket)
                .getPublicUrl(newPath);
                migrated.push({
                    name: meta.name,
                    type: meta.type || "application/octet-stream",
                    url: urlData?.publicUrl || "",
                    path: newPath,
                    iv: "",        // cleared iv
                });

                // 5) remove old vaulted object (only after successful upload)
                await supabase.storage.from(oldBucket).remove([encPath]).catch(() => {});
            }

            // If anything failed, don’t write a broken state. Bail out gracefully.
            if (migrationFailed) {
                setUploading(false);
                setErrorMsg("Some files could not be migrated. Nothing was changed.");
                return;
            }

            updatedFileMetas = migrated;
        }
        // -------- If staying Vaulted, migrate any remaining public files to vaulted --------
        if (goingVaulted) {
            const migrated = [];
            const publicBucket = "workspace.public";
            for (const meta of updatedFileMetas) {
                // skip if already vaulted (has iv)
                const alreadyVaulted = !!meta.iv || (meta.url || "").includes("workspace.vaulted");
                if (alreadyVaulted) { migrated.push(meta); continue; }

                const srcPath = meta.path || parsePathFromAnyUrl(meta.url, publicBucket);
                if (!srcPath) { console.warn("No public path:", meta); continue; }

                const { data: srcObj, error: dlErr } = await supabase.storage
                .from(publicBucket).download(srcPath);
                if (dlErr) { console.error("DL public→vaulted failed", dlErr, srcPath); continue; }

                const buf = await srcObj.arrayBuffer();
                const ivBytes = crypto.getRandomValues(new Uint8Array(12));
                const { encryptedBlob, ivHex } = await encryptFile(
                    new Blob([buf], { type: meta.type || "application/octet-stream" }),
                    code,
                    ivBytes
                );

                const newPath = `${activeWorkspaceId}/${Date.now()}-${sanitizeName(meta.name)}`;
                const { error: upErr } = await supabase.storage
                .from("workspace.vaulted")
                .upload(newPath, encryptedBlob, { contentType: meta.type || "application/octet-stream" });
                if (upErr) { console.error("UP public→vaulted failed", upErr, meta); continue; }

                migrated.push({ name: meta.name, type: meta.type, path: newPath, iv: ivHex, url: null });
                // remove old public copy (best-effort)
                await supabase.storage.from(publicBucket).remove([srcPath]).catch(() => {});
            }
            updatedFileMetas = migrated;
            }

        // -------- Upload any newly added files --------
        let noteIv = "";
        for (const file of files) {
            const sanitized = sanitizeName(file.name);
            const filePath = `${activeWorkspaceId}/${Date.now()}-${sanitized}`;
            const bucket = isVaulted ? "workspace.vaulted" : "workspace.public";

            let ivHex = "";
            let uploadErr;

            if (isVaulted) {
                const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
                const { encryptedBlob, ivHex: hex } = await encryptFile(file, code, ivBytes);
                ivHex = hex;

                ({ error: uploadErr } = await supabase.storage
                    .from(bucket)
                    .upload(filePath, encryptedBlob, {
                    contentType: file.type,
                    upsert: false,
                    metadata: { user_id: user.id, workspace_id: activeWorkspaceId },
                }));
            } else {
                ({ error: uploadErr } = await supabase.storage
                    .from(bucket)
                    .upload(filePath, file, {
                    contentType: file.type,
                    upsert: false,
                    metadata: { user_id: user.id, workspace_id: activeWorkspaceId },
                }));
            }

            if (!uploadErr) {
                const { data: urlData } = await supabase.storage.from(bucket).getPublicUrl(filePath);
                if (urlData?.publicUrl) {
                    updatedFileMetas.push({
                    name: file.name,
                    url: urlData.publicUrl,
                    iv: isVaulted ? ivHex : "",
                    type: file.type,
                    path: filePath,
                    });
                }
            } else {
                console.error("Upload failed:", uploadErr);
            }
        }

        // -------- Encrypt private note if needed --------
        let encryptedNote = "";
        if (!goingPublic && isVaulted && privateNote && privateNote !== "🔐 Encrypted") {
            try {
                const result = await encryptText(privateNote, code);
                encryptedNote = result.encryptedData;
                noteIv = result.iv;
            } catch (err) {
                console.error(err);
                setUploading(false);
                setErrorMsg("Failed to encrypt private note.");
                return;
            }
        }

        // ---- Calendar handling (EDIT) ----
        const calErr = validateCalendarPayload(calendarPayload);
        if (calErr) {
        setUploading(false);
        setErrorMsg(calErr);
        return;
        }

        const calBlock = normalizeCalendarBlock(calendarPayload, isVaulted);

        // -------- Final DB update --------
        const safeMetas = Array.isArray(updatedFileMetas) ? updatedFileMetas : [];

        const updatePatch = {
            title,
            tags,
            notes,
            is_vaulted: isVaulted,
            encrypted_note: goingPublic ? null : (isVaulted ? (encryptedNote || undefined) : null),
            note_iv:        goingPublic ? null : (isVaulted ? (noteIv || undefined) : null),
            file_metas: safeMetas,
            ...(calBlock ?? {}),  // if null (untouched), we don't touch calendar columns
        };

        // Do the actual update BEFORE checking updateError:
        const { error: updateError } = await supabase
            .from('workspace_vault_items')
            .update(updatePatch)
            .eq('id', id)
            .eq('workspace_id', activeWorkspaceId);

        if (updateError) {
            console.error(updateError);
            setErrorMsg("Failed to update document.");
        } else {
            setSuccessMsg("Document updated successfully!");
            setFilesToRemove([]);
            setHasUnsavedChanges(false);
            setTimeout(() => navigate("/workspace/vaults"), 1300);
        }

        setUploading(false);
        setHasUnsavedChanges(false);
    };

    return (
        <Layout>
            {/* Confirmation popup for file deletion */}
            {showConfirmPopup && fileToDeleteIndex !== null && (
                <div className="fixed top-6 right-6  bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
                    <p className="mt-10 text-gray-800">
                    Are you sure you want to delete {existingFiles[fileToDeleteIndex]?.name}?
                    <br />
                    This action cannot be undone.
                    </p>
                    <div className="flex gap-3 justify-end">
                    <button
                        onClick={async () => {
                        await handleRemoveExistingFile(fileToDeleteIndex);
                        setShowConfirmPopup(false);
                        setFileToDeleteIndex(null);
                        }}
                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        Yes, Delete
                    </button>
                    <button
                        onClick={() => {
                        setShowConfirmPopup(false);
                        setFileToDeleteIndex(null);
                        }}
                        className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                    >
                        Cancel
                    </button>
                    </div>
                </div>
            )}
            {/* Unsaved changes confirmation popup */}
            <UnsavedChangesModal
                show={showUnsavedPopup}
                onCancel={() => setShowUnsavedPopup(false)}
                redirectPath="/workspace/vaults"
                message="You have unsaved changes. Are you sure you want to leave?"
            />

            <FullscreenCard className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
                <CardHeaderActions onClose={() => navigate('/workspace/vaults')} />

                <h2 className="text-xl font-semibold text-gray-900 mb-5">{title || "Untitled Document"}</h2>
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
                        <span className="text-sm">
                        Drag & Drop new file(s) here or browse below to upload replacements
                        </span>
                    )}
                    </div>

                    {/* File input */}
                    <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.json"
                        onChange={(e) => {
                            const selectedFiles = Array.from(e.target.files);
                            setFiles((prevFiles) => [...prevFiles, ...selectedFiles]);
                            setHasUnsavedChanges(true);
                        }}
                        className="w-full border border-gray-300 p-2 rounded text-gray-500 text-sm"
                    />

                    {/* Existing Files */}
                    {existingFiles.length > 0 && (
                        <div>
                            <h4 className="text-sm font-bold text-gray-800 mb-1">Previously uploaded files:</h4>
                            <ul className="space-y-1">
                            {existingFiles.map((file, index) => (
                                <li
                                key={index}
                                className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded text-sm text-gray-800 bg-gray-50"
                                >
                                {file.name}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFileToDeleteIndex(index);
                                        setShowConfirmPopup(true);
                                        setHasUnsavedChanges(true); 
                                    }}
                                    className="text-red-500 hover:text-red-700"
                                >
                                    <X size={16} />
                                </button>
                                </li>
                            ))}
                            </ul>
                        </div>
                        )}

                        {/* Current Selected Files */}
                        {files.length > 0 && (
                        <div>
                            <h4 className="text-sm font-bold text-gray-800 mb-1">Newly selected files:</h4>
                            <ul className="space-y-1">
                            {files.map((file, index) => (
                                <li
                                key={index}
                                className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded text-sm text-blue-800 bg-gray-50"
                                >
                                {file.name}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFiles((prev) => prev.filter((_, i) => i !== index));
                                        setHasUnsavedChanges(true); 
                                    }}
                                    className="text-red-500 hover:text-red-700"
                                >
                                    <X size={16} />
                                </button>
                                </li>
                            ))}
                            </ul>
                        </div>
                    )}

                    {/* Public / Private toggle */}
                    <div className="mb-3 text-sm">
                        <label className="mr-4 text-gray-800 font-bold">Document Type:</label>
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
                        <h2 className="text-xs text-purple-500 mt-1">Switching to Public will permanently delete the Private note.</h2>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-sm font-bold mb-1 text-gray-800 mt-4">Edit title:</label>
                        <input
                            value={title}
                            onChange={(e) => {
                                setTitle(e.target.value);
                                setHasUnsavedChanges(true);
                            }}
                            className="w-full p-2 mb-1 border rounded text-gray-800 text-sm bg-gray-50"
                            placeholder="Enter document title (Public)"
                        />
                    </div>

                    {/* Tag Input Section */}
                    <div className="mb-4">
                        <label className="block text-sm font-bold mb-1 text-gray-800">Tags:</label>
                        <div className="flex gap-2">
                            <input
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault(); 
                                        handleTagAdd();
                                    }
                                }}
                                className="border rounded px-2 py-1 text-sm flex-1 text-gray-800 bg-gray-50"
                                placeholder="Add a tag"
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

                    {/* Public Notes */}
                    <div>
                        <label className="text-sm font-bold text-gray-800 mb-1 block">Edit public note:</label>
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

                    {isVaulted && (
                        <>            
                            {/* Private Note Section */}
                            <div>
                                <p className="text-sm font-bold text-red-500 mb-1">
                                    🔐 Private note will be encrypted using your saved Vault Code:
                                </p>

                                {/* Private Notes */}
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

                            {/* Vault Code */}
                            <div>
                                <label className="block text-sm font-bold mb-1 text-gray-800">
                                    Re-enter Private vault code to encrypt:
                                </label>
                                <input
                                    type="password"
                                    value={vaultCode}
                                    onChange={(e) => {
                                        setVaultCode(e.target.value);
                                    }}
                                    className="w-full p-2 border font-medium rounded mb-3 text-gray-600 text-sm bg-gray-50"
                                    placeholder="Vault code"
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

                    {/* Upload Button */}
                    <button
                        type="submit"
                        disabled={uploading}
                        className="btn-secondary w-full text-sm"
                    >
                    {uploading ? (
                        <span className="flex justify-center items-center gap-2">
                        <Loader2 className="animate-spin" size={16} /> Updating...
                        </span>
                    ) : (
                        "Update Document"
                    )}
                    </button>

                    <br />
                    {successMsg && (
                        <p className="text-sm text-green-600 text-center">{successMsg}</p>
                    )}
                    {errorMsg && (
                        <p className="text-sm text-red-600 text-center">{errorMsg}</p>
                    )}
                </form>
            </FullscreenCard>
        </Layout>
    );
}
