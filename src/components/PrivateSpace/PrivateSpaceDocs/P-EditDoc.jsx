import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import Layout from "@/components/Layout/Layout";
import { X, Search, Loader2 } from "lucide-react";
import { encryptFile, encryptText, decryptText, decryptFile } from "@/lib/encryption";
import { UnsavedChangesModal } from "@/components/common/UnsavedChangesModal";
import { usePrivateSpaceStore } from "@/store/usePrivateSpaceStore";
import FullscreenCard from "@/components/Layout/FullscreenCard";
import CardHeaderActions from "@/components/Layout/CardHeaderActions";

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
function normalizePrivateCalendarBlock(payload, isVaulted) {
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
    calendar_visibility:
      payload.calendar_visibility ?? (isVaulted ? 'masked' : 'public'),

    // include these if you support them
    calendar_repeat: payload.calendar_repeat ?? null,
    calendar_repeat_until: payload.calendar_repeat_until ?? null,
    calendar_window_start: payload.calendar_window_start ?? null,
    calendar_window_end: payload.calendar_window_end ?? null,
  };
}

export default function PrivateEditDoc() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Private space store (single source of truth)
  const activeSpaceId = usePrivateSpaceStore((s) => s.activeSpaceId);
  const setActiveSpaceId = usePrivateSpaceStore((s) => s.setActiveSpaceId);

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
  const [filesToRemove, setFilesToRemove] = useState([]); // paths (preferred) or URLs (fallback)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);
  const [isVaulted, setIsVaulted] = useState(false);
  const [originalIsVaulted, setOriginalIsVaulted] = useState(false);

  // doc belongs-to space id (from DB)
  const [docSpaceId, setDocSpaceId] = useState(null);

  // Optional: for logging/heading
  const [spaceName, setSpaceName] = useState("");

  // Effective space (store wins; fallback to doc’s space id)
  const effectiveSpaceId = activeSpaceId || docSpaceId || null;

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

  // Allowed MIME types
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

  // Messages timeout
  useEffect(() => {
    if (successMsg || errorMsg) {
      const t = setTimeout(() => {
        setSuccessMsg("");
        setErrorMsg("");
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [successMsg, errorMsg]);

  // Load the document (and sync store space if empty)
  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (!id) return;

      const { data, error } = await supabase
        .from("private_vault_items")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!isMounted) return;

      if (error || !data) {
        setErrorMsg("Failed to load document.");
        console.error("❌ Failed to fetch doc:", error);
        return;
      }

      // ---------- Core fields ----------
      setTitle(data.title || "");
      setTags(Array.isArray(data.tags) ? data.tags : []);
      setNotes(data.notes || "");
      setExistingFiles(Array.isArray(data.file_metas) ? data.file_metas : []);
      setIsVaulted(!!data.is_vaulted);
      setOriginalIsVaulted(!!data.is_vaulted);
      setDocSpaceId(data.private_space_id || null);

      // If the store has no active space yet, align it with the doc’s space
      if (!activeSpaceId && data.private_space_id) {
        setActiveSpaceId(data.private_space_id);
      }

      // ---------- Calendar: normalize + hydrate AddToCalendar via editRow ----------
      // If the DB row is missing calendar_enabled but has dates, turn it "on" for UI.
      const normalizedForCalendar = {
        ...data,
        calendar_enabled:
          data.calendar_enabled ?? Boolean(data.start_at || data.end_at),
        all_day: !!data.all_day,
      };
      setEditRow(normalizedForCalendar);

      // Important: calendarPayload stays null so we don't overwrite DB unless user changes it
      setCalendarPayload(null);

      // ---------- Private note preview (optional) ----------
      const storedVaultCode = sessionStorage.getItem("vaultCode")?.trim();
      if (data.encrypted_note && data.note_iv && storedVaultCode) {
        try {
          const decrypted = await decryptText(
            data.encrypted_note,
            data.note_iv,
            storedVaultCode
          );
          if (!isMounted) return;
          setPrivateNote(decrypted);
        } catch (err) {
          console.error("Failed to decrypt note with session code:", err);
          setPrivateNote("🔐 Encrypted");
        }
      } else {
        setPrivateNote(""); // no encrypted note in DB or no session code
      }
    })();

    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load space name + debug: show which space we’re using
  useEffect(() => {
    (async () => {
      if (!effectiveSpaceId) {
        setSpaceName("");
        console.log("PrivateEditDoc — effectiveSpaceId:", null);
        return;
      }
      const { data, error } = await supabase
        .from("private_spaces")
        .select("name")
        .eq("id", effectiveSpaceId)
        .maybeSingle();
      setSpaceName(error ? "" : (data?.name || ""));
      console.log("PrivateEditDoc — effectiveSpaceId:", effectiveSpaceId, "name:", data?.name || "");
    })();
  }, [effectiveSpaceId]);

  // Tags: UNION of user-level Private and space-scoped Private tags
  useEffect(() => {
    (async () => {
      if (!effectiveSpaceId) {
        setAvailableTags([]);
        return;
      }

      const { data: { user } = {} } = await supabase.auth.getUser();
      const uid = user?.id;
      if (!uid) { setAvailableTags([]); return; }

      const { data, error } = await supabase
        .from("vault_tags")
        .select("name, private_space_id")
        .eq("user_id", uid)
        .eq("section", "Private")
        .or(`private_space_id.is.null,private_space_id.eq.${effectiveSpaceId}`);

      if (error) {
        console.error("❌ Failed to fetch private tags:", error);
        setAvailableTags([]);
        return;
      }

      const names = [...new Set((data || []).map((t) => t.name))];
      setAvailableTags(names);
    })();
  }, [effectiveSpaceId]);

  // Ensure selected tags remain visible even if they’re legacy/user-only
  const tagOptions = useMemo(
    () => Array.from(new Set([...(availableTags || []), ...(tags || [])])),
    [availableTags, tags]
  );

  // ✅ Add tag (Private scope, space-scoped, deduped server-side)
  const handleTagAdd = async () => {
    const raw = String(newTag || '').trim()
    if (!raw) return

    const { data: { user } = {} } = await supabase.auth.getUser()
    if (!user?.id) { console.error('Not signed in'); return }
    if (!effectiveSpaceId) { setErrorMsg('No active private space selected.'); return }

    const { data: row, error } = await addPrivateTag(supabase, {
      name: raw,
      privateSpaceId: effectiveSpaceId,
      userId: user.id,
    })
    if (error) { console.error(error); return }

    const existsCI = (arr, val) =>
      arr.some(t => String(t).toLowerCase() === String(val).toLowerCase())

    setAvailableTags(prev => existsCI(prev, row.name) ? prev : [...prev, row.name])
    setTags(prev => existsCI(prev, row.name) ? prev : [...prev, row.name])
    setNewTag('')
  }

  // DnD
  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => {
      const unique = dropped.filter(
        (f) => !prev.some((pf) => pf.name === f.name && pf.size === f.size)
      );
      return [...prev, ...unique];
    });
  };

  // Helper: pick the best deletion token (prefer storage path; else derive from URL)
  const tokenForMeta = (m) => {
    if (!m) return null;
    if (m.path) return m.path; // best: already a storage path

    if (m.url) {
      // infer bucket from presence of iv (vaulted) vs public
      const bucket = m.iv ? "private.vaulted" : "private.public";
      const p = parsePathFromAnyUrl(m.url, bucket); // the helper we added earlier
      return p || m.url; // fallback to URL if parsing fails
    }
    return null;
  };

  // Mark existing file for deletion (store a *path* if we can), and remove from UI list
  const handleRemoveExistingFile = (index) => {
    const meta = existingFiles[index];
    if (!meta) return;

    const token = tokenForMeta(meta);
    if (token) {
      setFilesToRemove((prev) => {
        const next = new Set(prev);
        next.add(token);              // dedupe
        return Array.from(next);
      });
    }

    // remove from visible list
    setExistingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Helpers: derive path from a public URL if needed
  const parsePathFromAnyUrl = (url, bucket) => {
    try {
      const u = new URL(url);
      const p = decodeURIComponent(u.pathname);
      const pub = `/storage/v1/object/public/${bucket}/`;
      const pri = `/storage/v1/object/${bucket}/`;
      if (p.startsWith(pub)) return p.slice(pub.length);
      if (p.startsWith(pri)) return p.slice(pri.length);
      const i = p.indexOf(`/${bucket}/`);
      return i >= 0 ? p.slice(i + bucket.length + 2) : null;
    } catch {
      return null;
    }
  };
  const sanitizeName = (s) => (s || "file").replace(/[^\w.-]/g, "_");

  // ======================================================= Submit update ========================================================
  const handleUpload = async (e) => {
  e.preventDefault();
  setUploading(true);
  setErrorMsg("");
  setSuccessMsg("");

  try {
    // ------------------- basic checks -------------------
    const privacyChanged = originalIsVaulted !== isVaulted;

    const nothingToUpdate =
      files.length === 0 &&
      filesToRemove.length === 0 &&
      !title &&
      !(tags?.length) &&
      !notes &&
      (!privateNote || privateNote === "🔐 Encrypted") &&
      !privacyChanged;

    if (nothingToUpdate) {
      setErrorMsg("⚠️ Nothing to update.");
      return;
    }

    const invalid = files.filter((f) => !allowedMimes.includes(f.type));
    if (invalid.length) {
      setErrorMsg("One or more files have unsupported types.");
      return;
    }

    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user) {
      setErrorMsg("User not authenticated.");
      return;
    }

    if (!activeSpaceId) {
      setErrorMsg("No private space selected.");
      return;
    }

    // ------------------- transitions -------------------
    const wasVaulted   = !!originalIsVaulted;
    const goingPublic  = wasVaulted && !isVaulted;
    const goingVaulted = !wasVaulted && isVaulted;

    // Need code when final is vaulted OR when going public (to decrypt)
    let code = String(vaultCode || sessionStorage.getItem("vaultCode") || "").trim();
    if (isVaulted || goingPublic) {
      if (!code) {
        setErrorMsg(
          goingPublic
            ? "Please enter your Vault Code to migrate files to Public."
            : "Please enter your Vault Code to encrypt the document."
        );
        return;
      }
      const { data: ok, error: vErr } = await supabase.rpc(
        "verify_user_private_code",
        { p_code: code }
      );
      if (vErr || !ok) {
        setErrorMsg(vErr?.message || "Failed to verify Vault Code.");
        return;
      }
      sessionStorage.setItem("vaultCode", code);
      if (!vaultCode) setVaultCode(code);
    }

    // ------------------- delete marked files -------------------
    const byBucketToDelete = { "private.public": [], "private.vaulted": [] };

    for (const token of filesToRemove) {
      const meta = existingFiles.find(
        (f) => (f.path && f.path === token) || (f.url && f.url === token)
      );
      const wasEnc = !!meta?.iv || (meta?.url || "").includes("private.vaulted");
      const bucket = wasEnc ? "private.vaulted" : "private.public";

      let path = token;
      if (typeof token === "string" && token.includes("/storage/v1/object/")) {
        path = parsePathFromAnyUrl(token, bucket);
      }
      if (path) byBucketToDelete[bucket].push(path);
    }

    if (byBucketToDelete["private.public"].length) {
      const { error } = await supabase.storage
        .from("private.public")
        .remove(byBucketToDelete["private.public"]);
      if (error) console.warn("Delete public files:", error);
    }
    if (byBucketToDelete["private.vaulted"].length) {
      const { error } = await supabase.storage
        .from("private.vaulted")
        .remove(byBucketToDelete["private.vaulted"]);
      if (error) console.warn("Delete vaulted files:", error);
    }

    // keep remaining metas
    const deletedSet = new Set(
      [...byBucketToDelete["private.public"], ...byBucketToDelete["private.vaulted"]]
    );
    const normPath = (m) => {
      if (m.path) return m.path;
      if (m.url) {
        const b = m.iv ? "private.vaulted" : "private.public";
        return parsePathFromAnyUrl(m.url, b);
      }
      return null;
    };
    let updatedFileMetas = (existingFiles || []).filter((m) => {
      const p = normPath(m);
      return p ? !deletedSet.has(p) : true;
    });

    // ------------------- privacy migrations -------------------
    // Vaulted ➜ Public
    if (goingPublic) {
      const migrated = [];
      let failed = false;

      for (const meta of updatedFileMetas) {
        const isEnc = !!meta.iv || (meta.url || "").includes("private.vaulted");
        if (!isEnc) { migrated.push({ ...meta, iv: "" }); continue; }

        const encPath = meta.path || parsePathFromAnyUrl(meta.url, "private.vaulted");
        if (!encPath) { migrated.push(meta); failed = true; continue; }

        const { data: encObj, error: dlErr } =
          await supabase.storage.from("private.vaulted").download(encPath);
        if (dlErr) { console.error("DL vaulted failed", dlErr, encPath); migrated.push(meta); failed = true; continue; }

        let plainBlob;
        try {
          const encBuf = await encObj.arrayBuffer();
          const mime = meta.type || "application/octet-stream";
          plainBlob = await decryptFile(encBuf, meta.iv, code, mime);
        } catch (e2) {
          console.error("Decrypt vaulted file failed:", e2, meta);
          migrated.push(meta); failed = true; continue;
        }

        const newPath = `${activeSpaceId}/${Date.now()}-${sanitizeName(meta.name)}`;
        const { error: upErr } = await supabase.storage
          .from("private.public")
          .upload(newPath, plainBlob, { contentType: meta.type || "application/octet-stream", upsert: false });
        if (upErr) { console.error("UP public failed", upErr, newPath); migrated.push(meta); failed = true; continue; }

        const { data: urlData } = await supabase.storage.from("private.public").getPublicUrl(newPath);
        migrated.push({
          name: meta.name,
          type: meta.type || "application/octet-stream",
          url: urlData?.publicUrl || "",
          path: newPath,
          iv: "",
        });

        await supabase.storage.from("private.vaulted").remove([encPath]).catch(() => {});
      }

      if (failed) {
        setErrorMsg("Some files could not be migrated. Nothing was changed.");
        return;
      }
      updatedFileMetas = migrated;
    }

    // Public ➜ Vaulted
    if (goingVaulted) {
      const migrated = [];

      for (const meta of updatedFileMetas) {
        const alreadyEnc = !!meta.iv || (meta.url || "").includes("private.vaulted");
        if (alreadyEnc) { migrated.push(meta); continue; }

        const srcPath = meta.path || parsePathFromAnyUrl(meta.url, "private.public");
        if (!srcPath) { console.warn("No public path", meta); continue; }

        const { data: srcObj, error: dlErr } =
          await supabase.storage.from("private.public").download(srcPath);
        if (dlErr) { console.error("DL public→vaulted failed", dlErr, srcPath); continue; }

        const buf = await srcObj.arrayBuffer();
        const ivBytes = crypto.getRandomValues(new Uint8Array(12));
        const { encryptedBlob, ivHex } = await encryptFile(
          new Blob([buf], { type: meta.type || "application/octet-stream" }),
          code,
          ivBytes
        );

        const newPath = `${activeSpaceId}/${Date.now()}-${sanitizeName(meta.name)}`;
        const { error: upErr } = await supabase.storage
          .from("private.vaulted")
          .upload(newPath, encryptedBlob, { contentType: meta.type || "application/octet-stream" });
        if (upErr) { console.error("UP public→vaulted failed", upErr, meta); continue; }

        migrated.push({
          name: meta.name,
          type: meta.type,
          path: newPath,
          iv: ivHex,
          url: null,
        });

        await supabase.storage.from("private.public").remove([srcPath]).catch(() => {});
      }

      updatedFileMetas = migrated;
    }

    // ------------------- upload any NEW files -------------------
    let noteIv = "";
    for (const file of files) {
      const sanitized = sanitizeName(file.name);
      const filePath = `${activeSpaceId}/${Date.now()}-${sanitized}`;
      const bucket = isVaulted ? "private.vaulted" : "private.public";

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
          }));
        if (!uploadErr) {
          updatedFileMetas.push({
            name: file.name,
            type: file.type,
            path: filePath,
            iv: ivHex,
            url: null,
            user_id: user.id,
            private_space_id: activeSpaceId,
          });
        }
      } else {
        ({ error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(filePath, file, {
            contentType: file.type,
            upsert: false,
            metadata: { user_id: user.id, private_space_id: activeSpaceId },
          }));
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
          updatedFileMetas.push({
            name: file.name,
            type: file.type,
            path: filePath,
            url: urlData?.publicUrl || "",
            iv: "",
            user_id: user.id,
            private_space_id: activeSpaceId,
          });
        }
      }

      if (uploadErr) console.error("Upload failed:", uploadErr);
    }

    // ------------------- private note encryption (small note) -------------------
    let encryptedNote = "";
    if (!goingPublic && isVaulted && privateNote && privateNote !== "🔐 Encrypted") {
      try {
        const res = await encryptText(privateNote, code);
        encryptedNote = res.encryptedData;
        noteIv = res.iv;
      } catch (err) {
        console.error(err);
        setErrorMsg("Failed to encrypt private note.");
        return;
      }
    }

    // ------------------- calendar (validate + normalize) -------------------
    const calErr = validateCalendarPayload(calendarPayload);
    if (calErr) {
      setErrorMsg(calErr);
      return;
    }
    const calBlock = normalizePrivateCalendarBlock(calendarPayload, isVaulted);
    // calBlock === null  -> untouched, don't include any calendar columns
    // calBlock !== null  -> include (enabled OR explicit clear)

    // ------------------- final DB update -------------------
    const safeMetas = Array.isArray(updatedFileMetas) ? updatedFileMetas : [];

    const updatePatch = {
      title,
      tags,
      notes,
      is_vaulted: isVaulted,
      encrypted_note: goingPublic ? null : (isVaulted ? (encryptedNote || undefined) : null),
      note_iv:        goingPublic ? null : (isVaulted ? (noteIv || undefined) : null),
      file_metas: safeMetas,
      ...(calBlock ?? {}), // only touch calendar if user touched the UI
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("private_vault_items")
      .update(updatePatch)
      .eq("id", id);

    if (updateError) {
      console.error(updateError);
      setErrorMsg("Failed to update document.");
    } else {
      setSuccessMsg("Document updated successfully!");
      setFilesToRemove([]);
      setHasUnsavedChanges(false);
      setTimeout(() => navigate("/privatespace/vaults"), 1300);
    }
  } catch (err) {
    console.error("❌ Private edit failed:", err);
    setErrorMsg("Something went wrong.");
  } finally {
    setUploading(false);
  }
};

  return (
    <Layout>
      {/* Confirm remove existing file */}
      {showConfirmPopup && fileToDeleteIndex !== null && (
        <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
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

      {/* Unsaved changes */}
      <UnsavedChangesModal
        show={showUnsavedPopup}
        onCancel={() => setShowUnsavedPopup(false)}
        redirectPath="/privatespace/vaults"
        message="You have unsaved changes. Are you sure you want to leave?"
      />

      <FullscreenCard className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
        <CardHeaderActions onClose={() => navigate('/privatespace/vaults')} />

        <h2 className="text-xl font-semibold mb-5 text-gray-900">
          Edit Document {spaceName ? `in “${spaceName}”` : ""}
        </h2>

        <p className="text-xs text-blue-700 mt-1">
          Supported: PDF, Word, Excel, PowerPoint, Text, CSV, JPG, PNG, GIF, ZIP, JSON
        </p>

        <form onSubmit={handleUpload} className="space-y-5">
          {/* Drag & Drop */}
          <div
            onDrop={handleFileDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            className={`w-full h-32 border-2 border-dashed rounded-lg flex items-center justify-center text-gray-500 cursor-pointer ${
              dragging ? "border-purple-500 bg-purple-50" : "border-gray-300"
            }`}
          >
            {files.length > 0 ? (
              <ul className="text-sm space-y-1">
                {files.map((file, idx) => <li key={idx}>{file.name}</li>)}
              </ul>
            ) : (
              <span className="text-sm">Drag & Drop new file(s) here or browse below</span>
            )}
          </div>

          {/* File input */}
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.json"
            onChange={(e) => {
              const selected = Array.from(e.target.files);
              setFiles((prev) => [...prev, ...selected]);
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

          {/* New Files */}
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
              {/* Vaulted warning */}
              {isVaulted && (
                  <h2 className="text-xs text-purple-500 mt-1">
                      Switching to Public will permanently delete the Private note.
                  </h2>
              )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-bold mb-1 text-gray-800 mt-4">Edit title:</label>
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setHasUnsavedChanges(true); }}
              className="w-full p-2 mb-1 border rounded text-gray-800 text-sm bg-gray-50 font-medium placeholder-gray-400"
              placeholder="Enter document title (Public)"
            />
          </div>

          {/* Public Notes */}
          <div>
            <label className="text-sm font-bold text-gray-800 mb-1 block">Edit public note:</label>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setHasUnsavedChanges(true); }}
              placeholder="Public notes (Visible to shared contacts)"
              rows={2}
              className="w-full border bg-gray-50 border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
            />
          </div>

          {/* Tags */}
          <div className="mb-4">
            <label className="block text-sm mb-1 font-bold text-gray-800">Tags:</label>
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

          {/* Private note + Vault code (only when vaulted) */}
          {isVaulted && (
            <>
              <div>
                <p className="text-sm font-bold text-red-500 mb-1">
                  🔐 Private note will be encrypted using your Private vault code:
                </p>
                <textarea
                  value={privateNote}
                  onChange={(e) => { setPrivateNote(e.target.value); setHasUnsavedChanges(true); }}
                  placeholder="Private notes (For your eyes only)"
                  rows={2}
                  className="bg-gray-50 w-full border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1 text-gray-800">
                  Re-enter Private vault code to encrypt:
                </label>
                <input
                  type="password"
                  value={vaultCode}
                  onChange={(e) => setVaultCode(e.target.value)}
                  className="w-full p-2 border font-medium rounded mb-3 text-gray-600 text-sm bg-gray-50"
                  placeholder="Vault code"
                  autoComplete="current-password"
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

          {/* Submit */}
          <button type="submit" disabled={uploading} className="btn-secondary w-full">
            {uploading ? (
              <span className="flex justify-center items-center gap-2">
                <Loader2 className="animate-spin" size={16} /> Updating...
              </span>
            ) : (
              "Update Document"
            )}
          </button>

          <br />
          {successMsg && <p className="text-sm text-green-600 text-center">{successMsg}</p>}
          {errorMsg && <p className="text-sm text-red-600 text-center">{errorMsg}</p>}
        </form>
      </FullscreenCard>
    </Layout>
  );
}
