import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { Loader2, X, Search } from "lucide-react";
import Layout from "../../Layout/Layout";
import { encryptText, encryptFile } from "../../../lib/encryption";
import bcrypt from "bcryptjs";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";
import { usePrivateSpaceStore } from "@/store/usePrivateSpaceStore";
import FullscreenCard from "@/components/Layout/FullscreenCard";
import CardHeaderActions from "@/components/Layout/CardHeaderActions";
import { addPrivateTag } from "@/lib/tagsApi";

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

export default function PrivateSpaceUploadDoc() {
  const navigate = useNavigate();

  // files / notes / UI
  const [files, setFiles] = useState([]);
  const [notes, setNotes] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [vaultCode, setVaultCode] = useState("");
  const [isVaulted, setIsVaulted] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);

  // tags
  const [tags, setTags] = useState([]);                // selected tags (strings)
  const [availableTags, setAvailableTags] = useState([]); // options list (strings)
  const [newTag, setNewTag] = useState("");

  // Use the STORE for the active space
  const activeSpaceId = usePrivateSpaceStore((s) => s.activeSpaceId);
  const setactiveSpaceId = usePrivateSpaceStore((s) => s.setActiveSpaceId);
  const [psName, setPsName] = useState("");

  // Calendar states
  const [calendarPayload, setCalendarPayload] = useState(null);
  const [editRow, setEditRow] = useState(null); // for future use if editing existing rows

  // Allowed MIME types (same as workspace version)
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
  ];

    // Pick the first space if none selected in store
  useEffect(() => {
    (async () => {
      if (activeSpaceId) return;

      const { data: { user } = {} } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from("private_spaces")
        .select("id, name")
        .eq("created_by", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(1);

      if (!error && data?.length) {
        setActiveSpaceId(data[0].id);
        setPsName(data[0].name || "");
      }
    })();
  }, [activeSpaceId, setactiveSpaceId]);

  // Keep psName in sync (optional)
  useEffect(() => {
    if (!activeSpaceId) { setPsName(""); return; }
    (async () => {
      const { data, error } = await supabase
        .from("private_spaces")
        .select("name")
        .eq("id", activeSpaceId)
        .maybeSingle();
      setPsName(error ? "" : (data?.name || ""));
    })();
  }, [activeSpaceId]);

  // Log current space for debugging
  useEffect(() => {
    console.log("Private Upload — activeSpaceId:", activeSpaceId, "name:", psName);
  }, [activeSpaceId, psName]);

  // Canonical tag fetch for Private pages
  // Show union: (a) user-level global private tags (NULL private_space_id) + (b) space-scoped tags
  useEffect(() => {
    (async () => {
      if (!activeSpaceId) return;

      const { data: { user } = {} } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from("vault_tags")
        .select("name, private_space_id")
        .eq("user_id", userId)
        .eq("section", "Private")
        .or(`private_space_id.is.null,private_space_id.eq.${activeSpaceId}`);

      if (error) {
        console.error("❌ Failed to fetch private tags:", error);
        return;
      }

      // de-dupe by name
      const names = [...new Set((data || []).map((t) => t.name))];
      setAvailableTags(names);
    })();
  }, [activeSpaceId]);

  // Ensure selected tags are visible even if legacy/user-only
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
    if (!activeSpaceId) { setErrorMsg('No active private space selected.'); return }

    const { data: row, error } = await addPrivateTag(supabase, {
      name: raw,
      privateSpaceId: activeSpaceId,
      userId: user.id,
    })
    if (error) { console.error(error); return }

    const existsCI = (arr, val) =>
      arr.some(t => String(t).toLowerCase() === String(val).toLowerCase())

    setAvailableTags(prev => existsCI(prev, row.name) ? prev : [...prev, row.name])
    setTags(prev => existsCI(prev, row.name) ? prev : [...prev, row.name])
    setNewTag('')
  }

  // File DnD
  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(droppedFiles);
  };

  // Auto clear messages
  useEffect(() => {
    if (successMsg || errorMsg) {
      const timer = setTimeout(() => {
        setSuccessMsg("");
        setErrorMsg("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg, errorMsg]);

  // ==================================== Upload handler (same logic, swapped to private) ==============================
  const handleUpload = async (e) => {
    e.preventDefault();
    setUploading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      // 0) basic checks
      if (!files.length) {
        setErrorMsg("⚠️ Please attach file(s) before uploading.");
        return;
      }

      const invalidFiles = files.filter((f) => !allowedMimes.includes(f.type));
      if (invalidFiles.length > 0) {
        setErrorMsg("One or more files have unsupported types.");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        setErrorMsg("User not authenticated.");
        return;
      }

      if (!activeSpaceId) {
        setErrorMsg("Private space not selected. Please refresh or select a private space.");
        return;
      }

      // 1) Vault code (private) — verify via RPC when vaulted
      if (isVaulted) {
        const code = String(vaultCode || "").trim();
        if (!code) {
          setErrorMsg("Please enter your Vault Code.");
          return;
        }
        const { data: ok, error: vErr } = await supabase.rpc(
          "verify_user_private_code",
          { p_code: code }
        );
        if (vErr) {
          setErrorMsg(vErr.message || "Failed to verify Vault Code.");
          return;
        }
        if (!ok) {
          setErrorMsg("Incorrect Vault Code.");
          return;
        }
        // remember for this tab
        sessionStorage.setItem("vaultCode", code);
      }

      // 2) upload files
      const fileMetas = [];
      let uploadedCount = 0;

      for (const file of files) {
        try {
          const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
          const filePath = `${activeSpaceId}/${Date.now()}-${sanitizedName}`;

          let ivHex = "";
          let uploadError, urlData;

          if (isVaulted) {
            const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
            const { encryptedBlob, ivHex: hex } = await encryptFile(file, vaultCode, ivBytes);
            ivHex = hex;

            ({ error: uploadError } = await supabase.storage
              .from("private.vaulted")
              .upload(filePath, encryptedBlob, {
                contentType: file.type,
                upsert: false,
                metadata: { user_id: userId, private_space_id: activeSpaceId },
              }));

            ({ data: urlData } = supabase.storage
              .from("private.vaulted")
              .getPublicUrl(filePath));
          } else {
            ({ error: uploadError } = await supabase.storage
              .from("private.public")
              .upload(filePath, file, {
                contentType: file.type,
                upsert: false,
                metadata: { user_id: userId, private_space_id: activeSpaceId },
              }));

            ({ data: urlData } = supabase.storage
              .from("private.public")
              .getPublicUrl(filePath));
          }

          if (uploadError || !urlData?.publicUrl) {
            console.error("Upload failed:", uploadError);
            continue;
          }

          fileMetas.push({
            name: file.name,
            url: urlData.publicUrl,
            iv: isVaulted ? ivHex : "",
            type: file.type,
            path: filePath,
            user_id: userId,
            private_space_id: activeSpaceId,
          });

          uploadedCount++;
        } catch (err) {
          console.error("Unexpected upload error:", err);
        }
      }

      if (!fileMetas.length) {
        setErrorMsg("Upload failed for all files.");
        return;
      } else if (uploadedCount < files.length) {
        setErrorMsg(`⚠️ Only ${uploadedCount} of ${files.length} files uploaded successfully.`);
      }

      // 3) encrypt private note (optional small note field)
      let encryptedNote = "";
      let noteIv = "";
      if (isVaulted && privateNote) {
        try {
          const result = await encryptText(privateNote, vaultCode);
          encryptedNote = result.encryptedData;
          noteIv = result.iv;
        } catch (err) {
          console.error("Note encryption failed:", err);
          setErrorMsg("Failed to encrypt private note.");
          return;
        }
      }

      // 4) ensure tags exist (Private scope)
      for (const tag of tags) {
        if (!availableTags.includes(tag)) {
          const { error } = await supabase.from("vault_tags").insert({
            name: tag,
            section: "Private",
            user_id: userId,
            private_space_id: activeSpaceId,
          });
          if (!error) {
            setAvailableTags((prev) => [...prev, tag]);
          } else {
            console.error("❌ Failed to insert tag:", tag, error?.message);
          }
        }
      }

      // 5) Calendar — validate + normalize (private-safe: NO assignee_id)
      const calErr = validateCalendarPayload(calendarPayload);
      if (calErr) {
        setErrorMsg(calErr);
        return;
      }
      const calBlock = normalizePrivateCalendarBlock(calendarPayload, isVaulted);
      // calBlock === null → untouched (don’t include any calendar columns)
      // calBlock === defaults → explicitly disabled (clear fields)
      // calBlock enabled → write normalized values

      // 6) insert into private_vault_items
      const row = {
        user_id: userId,
        private_space_id: activeSpaceId,
        created_by: userId,

        file_name: files.map((f) => f.name).join(", "),
        file_metas: fileMetas,
        title,
        tags,
        notes,
        encrypted_note: encryptedNote || null,
        note_iv: noteIv || null,
        is_vaulted: !!isVaulted,
        created_at: new Date().toISOString(),

        ...(calBlock ?? {}), // only include calendar if user touched it
      };

      const { error: insertError } = await supabase
        .from("private_vault_items")
        .insert(row);

      if (insertError) {
        console.error(insertError);
        setErrorMsg("Failed to save document.");
      } else {
        setSuccessMsg("✅ Files uploaded successfully!");
        setHasUnsavedChanges(false);
        setTimeout(() => navigate("/privatespace/vaults"), 1300);
      }
    } catch (e) {
      console.error("❌ Private upload failed:", e);
      setErrorMsg("Something went wrong.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Layout>
      {/* Unsaved changes confirmation popup */}
      <UnsavedChangesModal
        show={showUnsavedPopup}
        onCancel={() => setShowUnsavedPopup(false)}
        redirectPath="/privatespace/vaults"
        message="You have unsaved changes. Are you sure you want to leave?"
      />

      <FullscreenCard className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
        <CardHeaderActions onClose={() => navigate('/privatespace/vaults')} />

        <h2 className="text-xl font-semibold text-gray-800 mb-4">📤 Upload to {psName}</h2>
        <p className="text-xs text-blue-700 mt-1">
          Supported: PDF, Word, Excel, PowerPoint, Text, CSV, JPG, PNG
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
                Drag & Drop your file(s) here or use browse below <br />
                <br />
                Format not exeeding 10 MB each
              </span>
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
                className="border rounded px-2 py-1 text-sm flex-1 text-gray-800 bg-gray-50"
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

          {/* Upload */}
          <button type="submit" disabled={uploading} className="btn-secondary w-full mt-4">
            {uploading ? (
              <span className="flex justify-center items-center gap-2">
                <Loader2 className="animate-spin" size={16} /> Uploading...
              </span>
            ) : (
              "Upload Document(s)"
            )}
          </button>

          <br />
          {successMsg && <p className="text-sm text-green-600 text-center">{successMsg}</p>}
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
