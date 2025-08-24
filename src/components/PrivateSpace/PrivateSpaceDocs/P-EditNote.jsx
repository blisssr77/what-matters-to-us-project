import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText, encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { X, Search } from "lucide-react";
import { usePrivateSpaceStore } from "@/hooks/usePrivateSpaceStore";

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

  // Fetch note on mount
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
      setPublicNote(data.notes || "");
      setIsVaulted(!!data.is_vaulted);
      setTags(Array.isArray(data.tags) ? data.tags : []);

      // If store has no active space yet, sync it to this note's space id
      if (!activeSpaceId && data.private_space_id) {
        setActiveSpaceId(data.private_space_id);
      }
    })();
    // NOTE: we do not depend on activeSpaceId here; we sync it from the note when missing
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

  // Add tag (insert if missing) — space-scoped going forward
  const handleTagAdd = useCallback(async () => {
    const t = newTag.trim();
    if (!t) return;

    const { data: { user } = {}, error: uErr } = await supabase.auth.getUser();
    if (uErr || !user?.id) {
      console.error("Unable to get user.");
      return;
    }
    if (!effectiveSpaceId) {
      setErrorMsg("No active private space selected.");
      return;
    }

    if (!availableTags.includes(t)) {
      const { error } = await supabase.from("vault_tags").insert({
        name: t,
        section: "Private",
        user_id: user.id,
        private_space_id: effectiveSpaceId, // ← scope to this space
      });
      if (!error) setAvailableTags((prev) => [...prev, t]);
    }

    if (!tags.includes(t)) setTags((prev) => [...prev, t]);
    setNewTag("");
  }, [newTag, availableTags, tags, effectiveSpaceId]);

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
        setPrivateNote(dec);
        // optional: make it available to this tab only
        // setVaultCode(stored);
      } catch (e) {
        console.warn("Auto-decrypt failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [noteData]);

  // Private EditNote: explicit decrypt on user action (no autofill)
  const handleDecrypt = async () => {
    if (!noteData?.is_vaulted) return;

    const code = String(vaultCode || "").trim();
    if (!code) {
      setErrorMsg("Please enter your Vault Code.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      // Verify the *private* code (user-level)
      const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
        p_code: code,
      });
      if (vErr) throw new Error(vErr.message || "Failed to verify Vault Code.");
      if (!ok) {
        setErrorMsg("Incorrect Vault Code.");
        return;
      }

      // Decrypt note
      const ivToUse = noteData?.note_iv || noteData?.iv;
      if (!ivToUse || !noteData?.encrypted_note) {
        setErrorMsg("Nothing to decrypt for this note.");
        return;
      }

      const dec = await decryptText(noteData.encrypted_note, ivToUse, code);
      setPrivateNote(dec);

      // optional: make it available to this tab only
      // sessionStorage.setItem("vaultCode", code);

    } catch (err) {
      console.error("Decryption error:", err);
      setErrorMsg("Decryption failed.");
    } finally {
      setLoading(false);
    }
  };

  // Save updates
  const handleSave = async () => {
    setSaving(true);
    setErrorMsg("");
    try {
      // Prepare fields
      let updatePatch = {
        title: editedTitle,
        tags: tags.map((s) => s.trim()).filter(Boolean),
        notes: publicNote,
        is_vaulted: isVaulted,
        updated_at: new Date().toISOString(),
      };

      // If switching to public (non-vaulted): clear encrypted fields
      if (!isVaulted) {
        updatePatch.encrypted_note = null;
        updatePatch.note_iv = null;
      } else {
        // Vaulted: need code + encrypt private note
        const code = vaultCode.trim();
        if (!code) {
          setSaving(false);
          setErrorMsg("Please enter your Vault Code to save a private note.");
          return;
        }

        // verify code
        const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
          p_code: code,
        });
        if (vErr) {
          setSaving(false);
          setErrorMsg(vErr.message || "Failed to verify Vault Code.");
          return;
        }
        if (!ok) {
          setSaving(false);
          setErrorMsg("Incorrect Vault Code.");
          return;
        }

        // if privateNote provided, (re)encrypt
        const { encryptedData, iv } = await encryptText(privateNote || "", code);
        updatePatch.encrypted_note = encryptedData;
        updatePatch.note_iv = iv;
      }

      const { error: upErr } = await supabase
        .from("private_vault_items")
        .update(updatePatch)
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

      <div className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
        {/* Close */}
        <button
          onClick={() => {
            if (hasUnsavedChanges) setShowUnsavedPopup(true);
            else navigate("/privatespace/vaults");
          }}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-semibold mb-1 text-gray-900">
          Edit Note {spaceName ? `in “${spaceName}”` : ""}
        </h2>

        {/* Title */}
        <label className="text-sm text-gray-800 mb-1 block">Note title:</label>
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
          <label className="mr-4 text-gray-800">Note Type:</label>
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
        </div>

        {/* Public Note */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-800 mb-1 block">Public note:</label>
          <textarea
            value={publicNote}
            onChange={(e) => {
              setPublicNote(e.target.value);
              setHasUnsavedChanges(true);
            }}
            rows={3}
            className="w-full p-2 border rounded bg-gray-50 text-sm text-gray-800"
            placeholder="Visible to you in PrivateSpace; not encrypted"
          />
        </div>

        {/* Tags */}
        <div className="mb-4">
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

        {/* Private Note (only when vaulted) */}
        {isVaulted && (
          <>
            <p className="text-sm text-red-400 mb-1">
              🔐 Private note will be encrypted using your Vault Code:
            </p>
            <textarea
              value={privateNote}
              onChange={(e) => {
                setPrivateNote(e.target.value);
                setHasUnsavedChanges(true);
              }}
              rows={6}
              className="w-full p-3 border rounded bg-gray-50 text-sm font-medium text-gray-800 leading-relaxed mb-3"
              placeholder="Private (encrypted) content"
            />

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1 text-gray-800">
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
      </div>
    </Layout>
  );
}
