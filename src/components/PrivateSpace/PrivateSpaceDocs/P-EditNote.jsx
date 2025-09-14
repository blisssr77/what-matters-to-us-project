import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText, encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { X, Search } from "lucide-react";
import { usePrivateSpaceStore } from "@/store/usePrivateSpaceStore";
import RichTextEditor from "@/components/Editors/RichTextEditor";
import DOMPurify from "dompurify";
import { generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
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

export default function PrivateEditNote() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Private space store
  const activeSpaceId = usePrivateSpaceStore((s) => s.activeSpaceId);
  const setActiveSpaceId = usePrivateSpaceStore((s) => s.setActiveSpaceId);

  // Core state
  const [noteData, setNoteData] = useState(null);
  const [editedTitle, setEditedTitle] = useState("");
  const [publicNote, setPublicNote] = useState("");     // ← public note
  const [privateNote, setPrivateNote] = useState("");   // ← decrypted (editable) private note
  const [isVaulted, setIsVaulted] = useState(false);    // ← toggle encrypted vs public

  // Vault / UX state
  const [vaultCode, setVaultCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Tags
  const [availableTags, setAvailableTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [tags, setTags] = useState([]);
  const tagBoxRef = useRef(null);

  // For logging / optional header
  const [spaceName, setSpaceName] = useState("");

  // Effective space this note belongs to (store wins; fallback to note’s space)
  const effectiveSpaceId = activeSpaceId || noteData?.private_space_id || null;

  // TipTap editor state (public & private)
  const [publicJson, setPublicJson] = useState();
  const [publicHtml, setPublicHtml] = useState("");
  const [privateJson, setPrivateJson] = useState();
  const autoDecryptTriedRef = useRef(false);

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
gi
  // Fetch note on mount (PRIVATE)
  useEffect(() => {
    (async () => {
      if (!id) return;

      const { data, error } = await supabase
        .from("private_vault_items")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        console.error("❌ Failed to load note:", error);
        setErrorMsg("Failed to load note.");
        return;
      }

      setNoteData(data);
      setEditedTitle(data.title || "");
      setIsVaulted(!!data.is_vaulted);
      setTags(Array.isArray(data.tags) ? data.tags : []);

      // Hydrate PUBLIC TipTap editor (prefer HTML column)
      if (data.public_note_html) {
        setPublicHtml(data.public_note_html);
        try {
          const json = generateJSON(data.public_note_html, [
            StarterKit,
            TextAlign.configure({ types: ["heading", "paragraph"] }),
          ]);
          setPublicJson(json);
        } catch {
          // If conversion fails, fallback to minimal doc
          setPublicJson({ type: "doc", content: [{ type: "paragraph" }] });
        }
      } else if (data.notes) {
        // Legacy plain text → minimal TipTap JSON
        const paragraphs = String(data.notes)
          .split("\n")
          .map((line) =>
            line
              ? { type: "paragraph", content: [{ type: "text", text: line }] }
              : { type: "paragraph" }
          );
        setPublicJson({ type: "doc", content: paragraphs });
        setPublicHtml(DOMPurify.sanitize(data.notes.replace(/\n/g, "<br/>")));
      } else {
        setPublicJson({ type: "doc", content: [{ type: "paragraph" }] });
        setPublicHtml("");
      }

      // If store has no active space yet, sync it to this note's space id
      if (!activeSpaceId && data.private_space_id) {
        setActiveSpaceId(data.private_space_id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load space name + debug log
  useEffect(() => {
    (async () => {
      if (!effectiveSpaceId) {
        setSpaceName("");
        console.log("PrivateEditNote — effectiveSpaceId:", null);
        return;
      }
      const { data, error } = await supabase
        .from("private_spaces")
        .select("name")
        .eq("id", effectiveSpaceId)
        .maybeSingle();
      setSpaceName(error ? "" : (data?.name || ""));
      console.log("PrivateEditNote — effectiveSpaceId:", effectiveSpaceId, "name:", data?.name || "");
    })();
  }, [effectiveSpaceId]);

  // Fetch tags (union: user-level Private + space-scoped Private for effectiveSpaceId)
  useEffect(() => {
    (async () => {
      if (!effectiveSpaceId) { setAvailableTags([]); return; }

      const { data: { user } = {} } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) { setAvailableTags([]); return; }

      const { data, error } = await supabase
        .from("vault_tags")
        .select("name, private_space_id")
        .eq("user_id", userId)
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

  // Try auto-decrypt with stored vault code (only if vaulted + encrypted fields present)
  useEffect(() => {
    (async () => {
      if (!noteData || !noteData.is_vaulted) return;
      if (!noteData.encrypted_note || !noteData.note_iv) return;

      const stored = sessionStorage.getItem("vaultCode");
      if (!stored) return;

      setLoading(true);

      // Verify stored code via RPC
      const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
        p_code: stored,
      });

      if (vErr || !ok) {
        setLoading(false);
        return; // silent fail; user will enter code manually
      }

      try {
        const dec = await decryptText(noteData.encrypted_note, noteData.note_iv, stored);
        // optional: make it available to this tab only
        // setVaultCode(stored);
      } catch (e) {
        console.warn("Auto-decrypt failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [noteData]);

  //  ------------------------------------- Explicit decrypt on user action (no autofill) -------------------------------------
  const handleDecrypt = async (codeParam) => {
    if (!noteData?.is_vaulted) return;

    const code = String(codeParam ?? vaultCode ?? "").trim();
    if (!code) {
      setErrorMsg("Please enter your Vault Code.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      // Verify the *private* (account-level) code
      const { data: ok, error: vErr } = await supabase.rpc(
        "verify_user_private_code",
        { p_code: code }
      );
      if (vErr) throw new Error(vErr.message || "Failed to verify Vault Code.");
      if (!ok) {
        setErrorMsg("Incorrect Vault Code.");
        return;
      }

      // Choose ciphertext/iv/format (modern first, legacy fallback)
      const ciphertext =
        noteData?.private_note_ciphertext || noteData?.encrypted_note || null;
      const ivToUse =
        noteData?.private_note_iv ||
        noteData?.note_iv ||
        noteData?.iv ||
        null;
      const fmt = noteData?.private_note_format || "tiptap_json";

      if (!ciphertext || !ivToUse) {
        setErrorMsg("Nothing to decrypt for this note.");
        return;
      }

      // Try both common decrypt signatures (match your util)
      const tryDecryptBoth = async () => {
        try {
          return await decryptText(ciphertext, code, ivToUse);
        } catch {
          return await decryptText(ciphertext, ivToUse, code);
        }
      };

      const plaintext = await tryDecryptBoth(); // UTF-8

      // Parse into TipTap JSON for private editor
      if (fmt === "tiptap_json") {
        try {
          const parsed = JSON.parse(plaintext);
          setPrivateJson(parsed);
        } catch {
          const json = generateJSON(plaintext, [
            StarterKit,
            TextAlign.configure({ types: ["heading", "paragraph"] }),
          ]);
          setPrivateJson(json);
        }
      } else if (fmt === "html") {
        const json = generateJSON(plaintext, [
          StarterKit,
          TextAlign.configure({ types: ["heading", "paragraph"] }),
        ]);
        setPrivateJson(json);
      } else {
        // Unknown format → try JSON else wrap as text
        try {
          const parsed = JSON.parse(plaintext);
          setPrivateJson(parsed);
        } catch {
          setPrivateJson({
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: plaintext }] },
            ],
          });
        }
      }

      // Keep for this tab so Save can reuse without retyping
      sessionStorage.setItem("vaultCode", code);
    } catch (err) {
      console.error("Decryption error:", err);
      setErrorMsg("Decryption failed.");
    } finally {
      setLoading(false);
    }
  };

  // Prevent double auto-decrypt in StrictMode
  useEffect(() => {
    if (!noteData?.id) return;
    if (autoDecryptTriedRef.current) return;          // prevent double-run in StrictMode
    if (!noteData?.is_vaulted) return;

    const storedCode = sessionStorage.getItem('vaultCode') || '';

    const hasNew = !!(noteData?.private_note_ciphertext && noteData?.private_note_iv);
    const hasLegacy = !!(noteData?.encrypted_note && (noteData?.note_iv || noteData?.iv));

    if (storedCode && (hasNew || hasLegacy)) {
      autoDecryptTriedRef.current = true;

      // setVaultCode(storedCode);
      handleDecrypt(storedCode);
    }
  }, [noteData?.id]); // depend on id only to avoid loops

  // ----------------------------------------------- Save updates -----------------------------------------------
  const handleSave = async () => {
    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const {
        data: { user } = {},
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setErrorMsg("User not authenticated.");
        setSaving(false);
        return;
      }

      // PUBLIC — sanitize HTML + derive plain text & summary
      const cleanPublicHtml = publicHtml ? DOMPurify.sanitize(publicHtml) : "";
      const publicText = cleanPublicHtml
        ? (() => {
            const el = document.createElement("div");
            el.innerHTML = cleanPublicHtml;
            return (el.textContent || el.innerText || "").trim();
          })()
        : "";
      const summary = publicText ? publicText.slice(0, 160) : null;

      // PRIVATE — if saving vaulted, require a code & encrypt TipTap JSON
      let private_note_ciphertext = null;
      let private_note_iv = null;

      if (isVaulted && privateJson) {
        const sessionCode = sessionStorage.getItem("vaultCode") || "";
        const code = String(vaultCode || sessionCode || "").trim();
        if (!code) {
          setErrorMsg("Vault Code is required to save the private note.");
          setSaving(false);
          return;
        }

        // verify private code
        const { data: ok, error: vErr } = await supabase.rpc(
          "verify_user_private_code",
          { p_code: code }
        );
        if (vErr) {
          setErrorMsg(vErr.message || "Verification failed.");
          setSaving(false);
          return;
        }
        if (!ok) {
          setErrorMsg("Incorrect Vault Code.");
          setSaving(false);
          return;
        }

        // encrypt TipTap JSON
        const plaintext = JSON.stringify(privateJson);
        const { encryptedData, iv } = await encryptText(plaintext, code); // base64 strings
        private_note_ciphertext = encryptedData;
        private_note_iv = iv;

        // remember for this tab
        sessionStorage.setItem("vaultCode", code);
      }

      // Build payload (modern columns)
      const payload = {
        title: editedTitle || null,
        tags: (tags || []).map((t) => t.trim()).filter(Boolean),

        // PUBLIC
        public_note_html: cleanPublicHtml || null,
        notes: publicText || null, // plain text for search/back-compat
        summary,

        // PRIVATE
        is_vaulted: !!(isVaulted && privateJson),
        private_note_ciphertext:
          isVaulted && privateJson ? private_note_ciphertext : null,
        private_note_iv: isVaulted && privateJson ? private_note_iv : null,
        private_note_format: isVaulted && privateJson ? "tiptap_json" : null,

        // clear legacy fields to avoid duplication
        encrypted_note: null,
        note_iv: null,

        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase
        .from("private_vault_items")
        .update(payload)
        .eq("id", id);

      if (upErr) {
        console.error(upErr);
        setErrorMsg("Failed to update note.");
      } else {
        setSuccessMsg("✅ Note updated successfully!");
        setHasUnsavedChanges(false);
        setTimeout(() => navigate("/privatespace/vaults"), 1100);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("Unexpected error while saving.");
    } finally {
      setSaving(false);
    }
  };

  // Toast auto-clear
  useEffect(() => {
    if (!toastMessage && !successMsg && !errorMsg) return;
    const t = setTimeout(() => {
      setToastMessage("");
      setSuccessMsg("");
      setErrorMsg("");
    }, 3500);
    return () => clearTimeout(t);
  }, [toastMessage, successMsg, errorMsg]);

  // Simple loading guard
  if (!noteData) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto p-6 mt-10">Loading…</div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Unsaved changes popup */}
      {showUnsavedPopup && (
        <div className="fixed top-6 right-6 bg-gray-500/20 opacity-90 backdrop-blur-md shadow-md rounded-lg p-4 z-50 text-sm">
          <p className="mt-10 text-gray-800">You have unsaved changes. Are you sure you want to leave?</p>
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => navigate("/privatespace/vaults")}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Leave Anyway
            </button>
            <button
              onClick={() => setShowUnsavedPopup(false)}
              className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <FullscreenCard className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
        <CardHeaderActions onClose={() => navigate('/privatespace/vaults')} />

        <h2 className="text-xl font-semibold mb-5 text-gray-900">
          Edit Note {spaceName ? `in “${spaceName}”` : ""}
        </h2>

        {/* Title */}
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

        {/* Public note */}
        <div className="text-sm mb-4 text-gray-800 wm-content max-w-full break-words overflow-x-hidden">
          <label className="text-sm font-bold text-gray-800 mb-1 block">
            Edit public note:
          </label>
          <div className="bg-white border border-gray-200 rounded p-3 mb-4">
            <RichTextEditor
              key={`ps-pub-${id}`}
              valueJSON={publicJson}
              onChangeJSON={(json, html) => {
                setPublicJson(json);
                setPublicHtml(html);        // we sanitize at save time
                setHasUnsavedChanges(true);
              }}
            />
          </div>

        </div>

        {/* Private (encrypted) note section */}
        {isVaulted && (
          <div className="text-sm mb-4 text-gray-800 wm-content max-w-full break-words overflow-x-hidden">
            <p className="text-sm text-red-500 mb-1 font-bold">
              🔐 Private note: will be encrypted using your Private Vault Code.
            </p>

            <div className="bg-white border border-gray-200 rounded p-3 mb-4">
              <RichTextEditor
                key={`ps-priv-${id}-${privateJson ? 'ready' : 'locked'}`}
                valueJSON={privateJson}
                onChangeJSON={(json) => {
                  setPrivateJson(json);
                  setHasUnsavedChanges(true);
                }}
              />
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="mb-5">
          <label className="block text-sm font-bold mb-1 text-gray-800">Tags:</label>
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

        {/* Private Note (only when vaulted) */}
        {isVaulted && (
          <>
            <div className="mb-3">
              <label className="block text-sm font-bold mb-1 text-gray-800">
                Re-enter Private vault code:
              </label>
              <div className="flex gap-2">
                <input
                  name="private_vault_code"
                  type="password"
                  value={vaultCode}
                  onChange={(e) => setVaultCode(e.target.value)}
                  className="w-full p-2 border font-medium rounded text-gray-600 text-sm bg-gray-50"
                  placeholder="Vault code"
                  autoComplete="new-password"
                />
                {/* <button
                  type="button"
                  onClick={handleDecrypt}
                  disabled={loading}
                  className="px-3 py-2 rounded border text-sm"
                >
                  {loading ? "Decrypting…" : "Use Code"}
                </button> */}
              </div>
            </div>
          </>
        )}

        {/* Save */}
        <div className="flex gap-4 mt-4">
          <button onClick={() => { handleSave(); handleDecrypt(); }} className="btn-secondary w-full mt-3" disabled={saving || loading}>
            {saving ? "Saving…" : "Save Note"}
          </button>
        </div>

        <br />
        {successMsg && <p className="text-sm text-green-600 text-center">{successMsg}</p>}
        {errorMsg && <p className="text-sm text-red-600 text-center">{errorMsg}</p>}
      </FullscreenCard>
    </Layout>
  );
}
