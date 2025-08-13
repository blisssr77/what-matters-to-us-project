import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { decryptText, encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { X, Search } from "lucide-react";

export default function PrivateEditNote() {
  const { id } = useParams();
  const navigate = useNavigate();

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

  // Fetch note on mount
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("private_vault_items")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching note:", error);
        setErrorMsg("Failed to load note.");
        return;
      }

      setNoteData(data);
      setEditedTitle(data.title || "");
      setPublicNote(data.notes || "");
      setIsVaulted(!!data.is_vaulted);
      setTags(Array.isArray(data.tags) ? data.tags : []);

      // load tags (basic user-level private tag scope; adjust if you later space-scope)
      const { data: tagRows, error: tagErr } = await supabase
        .from("vault_tags")
        .select("name")
        .eq("section", "Private");

      if (!tagErr && Array.isArray(tagRows)) {
        setAvailableTags(tagRows.map((t) => t.name));
      }
    })();
  }, [id]);

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
        setVaultCode(stored);
      } catch (e) {
        console.warn("Auto-decrypt failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [noteData]);

  // Decrypt explicitly when user enters vault code
  const handleDecrypt = async () => {
    if (!noteData?.is_vaulted) return;

    const code = vaultCode.trim();
    if (!code) {
      setErrorMsg("Please enter your Vault Code.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
      p_code: code,
    });

    if (vErr) {
      setErrorMsg(vErr.message || "Failed to verify Vault Code.");
      setLoading(false);
      return;
    }
    if (!ok) {
      setErrorMsg("Incorrect Vault Code.");
      setLoading(false);
      return;
    }

    try {
      if (!noteData.encrypted_note || !noteData.note_iv) {
        setErrorMsg("Nothing to decrypt for this note.");
        setLoading(false);
        return;
      }

      const dec = await decryptText(noteData.encrypted_note, noteData.note_iv, code);
      setPrivateNote(dec);
      sessionStorage.setItem("vaultCode", code);
    } catch (err) {
      console.error("Decryption error:", err);
      setErrorMsg("Decryption failed.");
    } finally {
      setLoading(false);
    }
  };

  // Add tag
  const handleTagAdd = async () => {
    const t = newTag.trim();
    if (!t) return;

    const {
      data: { user },
      error: uErr,
    } = await supabase.auth.getUser();
    if (uErr || !user?.id) {
      console.error("Unable to get user.");
      return;
    }

    if (!availableTags.includes(t)) {
      const { error } = await supabase.from("vault_tags").insert({
        name: t,
        section: "Private",
        user_id: user.id,
      });
      if (!error) setAvailableTags((prev) => [...prev, t]);
    }

    if (!tags.includes(t)) setTags((prev) => [...prev, t]);
    setNewTag("");
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

        <h2 className="text-xl font-extrabold mb-5 text-gray-900">✏️ Edit Note</h2>

        {/* Title */}
        <label className="text-sm font-extrabold text-gray-800 mb-1 block">Note title:</label>
        <input
          value={editedTitle}
          onChange={(e) => {
            setEditedTitle(e.target.value);
            setHasUnsavedChanges(true);
          }}
          className="w-full p-2 border rounded mb-3 text-gray-800 font-extrabold text-sm bg-gray-50"
          placeholder="Title"
        />

        {/* Public / Private toggle */}
        <div className="mb-3 text-sm">
          <label className="mr-4 font-semibold text-gray-800">Note Type:</label>
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

        {/* Private Note (only when vaulted) */}
        {isVaulted && (
          <>
            <p className="text-sm text-red-400 mb-1 font-extrabold">
              🔐 <strong>Private note</strong> will be encrypted using your Vault Code:
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
                Re-enter <strong>Private</strong> vault code:
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={vaultCode}
                  onChange={(e) => setVaultCode(e.target.value)}
                  className="w-full p-2 border font-medium rounded text-gray-600 text-sm bg-gray-50"
                  placeholder="Vault code"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={handleDecrypt}
                  disabled={loading}
                  className="px-3 py-2 rounded border text-sm"
                >
                  {loading ? "Decrypting…" : "Use Code"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Tags */}
        <div className="mb-4">
          <label className="text-sm font-extrabold text-gray-800 mb-1 block">Edit tags:</label>
          <div className="relative flex items-center gap-2 mb-1 text-sm">
            <Search className="absolute left-3 text-gray-400" size={16} />
            <input
              type="text"
              value={newTag}
              onChange={(e) => {
                setNewTag(e.target.value);
                setHasUnsavedChanges(true);
              }}
              placeholder="Search existing tags or create new"
              className="w-full pl-8 border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400"
            />
            <button type="button" onClick={handleTagAdd} className="btn-secondary">
              Create
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
            {availableTags
              .filter(
                (t) =>
                  (!newTag || t.toLowerCase().includes(newTag.toLowerCase())) &&
                  !tags.includes(t)
              )
              .map((t) => (
                <div key={t} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={tags.includes(t)}
                    onChange={() => {
                      setTags((prev) =>
                        prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                      );
                      setHasUnsavedChanges(true);
                    }}
                  />
                  <span className="text-xs text-gray-700">{t}</span>
                </div>
              ))}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {tags.map((t) => (
                <span
                  key={t}
                  className="bg-yellow-50 text-gray-800 text-xs px-3 py-1 rounded-full font-medium flex items-center gap-1"
                >
                  {t}
                  <X
                    size={12}
                    className="cursor-pointer"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                  />
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex gap-4 mt-4">
          <button onClick={handleSave} className="btn-secondary w-full mt-3" disabled={saving}>
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
