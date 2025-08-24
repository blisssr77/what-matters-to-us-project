import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { X, Search } from "lucide-react";
import { encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";
import { usePrivateSpaceStore } from "@/hooks/usePrivateSpaceStore";

export default function PrivateUploadNote() {
  const navigate = useNavigate();

  // form
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");           // public note
  const [privateNote, setPrivateNote] = useState(""); // encrypted note
  const [isVaulted, setIsVaulted] = useState(true);
  const [vaultCode, setVaultCode] = useState("");

  // ui
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);

  // tags
  const [tags, setTags] = useState([]);                // selected tags
  const [availableTags, setAvailableTags] = useState([]); // options list
  const [newTag, setNewTag] = useState("");

  // 🔹 Use the PRIVATE SPACE STORE (single source of truth)
  const activeSpaceId = usePrivateSpaceStore((s) => s.activeSpaceId);
  const setActiveSpaceId = usePrivateSpaceStore((s) => s.setActiveSpaceId);

  // optional (for logging/heading)
  const [spaceName, setSpaceName] = useState("");

  // If no active space is set in the store, pick the first one for this user
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
        setSpaceName(data[0].name || "");
      }
    })();
  }, [activeSpaceId, setActiveSpaceId]);

  // keep space name in sync (optional)
  useEffect(() => {
    if (!activeSpaceId) { setSpaceName(""); return; }
    (async () => {
      const { data, error } = await supabase
        .from("private_spaces")
        .select("name")
        .eq("id", activeSpaceId)
        .maybeSingle();
      setSpaceName(error ? "" : (data?.name || ""));
    })();
  }, [activeSpaceId]);

  // DEBUG: see which space this page is using
  useEffect(() => {
    console.log("Private UploadNote — activeSpaceId:", activeSpaceId, "name:", spaceName);
  }, [activeSpaceId, spaceName]);

  // 🚩 Fetch tags = UNION of (a) user-level Private tags (NULL space) + (b) space-scoped
  useEffect(() => {
    (async () => {
      if (!activeSpaceId) { setAvailableTags([]); return; }

      const { data: { user } = {} } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) { setAvailableTags([]); return; }

      const { data, error } = await supabase
        .from("vault_tags")
        .select("name, private_space_id")
        .eq("user_id", userId)
        .eq("section", "Private")
        .or(`private_space_id.is.null,private_space_id.eq.${activeSpaceId}`);

      if (error) {
        console.error("❌ Failed to fetch private tags:", error);
        setAvailableTags([]);
        return;
      }

      const names = [...new Set((data || []).map((t) => t.name))];
      setAvailableTags(names);
    })();
  }, [activeSpaceId]);

  // Ensure selected tags are visible even if legacy/user-only
  const tagOptions = useMemo(
    () => Array.from(new Set([...(availableTags || []), ...(tags || [])])),
    [availableTags, tags]
  );

  // ➕ Add tag (insert if missing) — space-scoped going forward
  const handleTagAdd = useCallback(async () => {
    const t = newTag.trim();
    if (!t) return;

    const { data: { user } = {}, error: uErr } = await supabase.auth.getUser();
    if (uErr || !user?.id) return;
    if (!activeSpaceId) { setErrorMsg("No active private space selected."); return; }

    if (!availableTags.includes(t)) {
      const { error } = await supabase.from("vault_tags").insert({
        name: t,
        section: "Private",
        user_id: user.id,
        private_space_id: activeSpaceId, // 🔹 scope to this space
      });
      if (!error) setAvailableTags((prev) => [...prev, t]);
    }

    if (!tags.includes(t)) setTags((prev) => [...prev, t]);
    setNewTag("");
  }, [newTag, availableTags, tags, activeSpaceId]);

  // (optional) ensure any selected tag exists before saving (best-effort)
  const ensureTagsExist = useCallback(async () => {
    const { data: { user } = {} } = await supabase.auth.getUser();
    const userId = user?.id;
    if (!userId || !activeSpaceId) return;

    for (const t of tags) {
      if (!availableTags.includes(t)) {
        const { error } = await supabase.from("vault_tags").insert({
          name: t,
          section: "Private",
          user_id: userId,
          private_space_id: activeSpaceId,
        });
        if (!error) setAvailableTags((prev) => prev.includes(t) ? prev : [...prev, t]);
      }
    }
  }, [tags, availableTags, activeSpaceId]);

  // Create note (public or vaulted)
  const handleCreate = async () => {
    setLoading(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMsg("Missing user session.");
        return;
      }
      if (!activeSpaceId) {
        setErrorMsg("No active private space selected.");
        return;
      }

      // Public vs Vaulted flow
      let encrypted_note = null;
      let note_iv = null;

      if (isVaulted) {
        if (!vaultCode.trim()) {
          setErrorMsg("Please enter your Private vault code.");
          return;
        }
        // Verify vault code via RPC (server-side hash check)
        const { data: ok, error: vErr } = await supabase.rpc("verify_user_private_code", {
          p_code: vaultCode.trim(),
        });
        if (vErr) {
          setErrorMsg(vErr.message || "Failed to verify Vault Code.");
          return;
        }
        if (!ok) {
          setErrorMsg("Incorrect Vault Code.");
          return;
        }

        // Encrypt the private note
        const enc = await encryptText(privateNote || "", vaultCode.trim());
        encrypted_note = enc.encryptedData;
        note_iv = enc.iv;
      }

      // Make sure tags exist
      await ensureTagsExist(user.id);

      // Insert row
      const { error } = await supabase.from("private_vault_items").insert({
        created_by: user.id,
        user_id: user.id, // legacy/compat
        private_space_id: activeSpaceId,
        file_name: title || "Untitled Note",
        title: title || "Untitled Note",
        tags,
        notes: notes || null,          // public note (for both; up to you)
        encrypted_note,                // only set when vaulted
        note_iv,                       // only set when vaulted
        is_vaulted: !!isVaulted,
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error(error);
        setErrorMsg("Failed to create note.");
      } else {
        setSuccessMsg("✅ Note created successfully!");
        setHasUnsavedChanges(false);
        setTimeout(() => navigate("/privatespace/vaults"), 1200);
      }
    } catch (e) {
      console.error("❌ Create note failed:", e);
      setErrorMsg("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      {/* Unsaved Changes Popup */}
      <UnsavedChangesModal
        show={showUnsavedPopup}
        onCancel={() => setShowUnsavedPopup(false)}
        redirectPath="/privatespace/vaults"
        message="You have unsaved changes. Are you sure you want to leave?"
      />

      <div className="relative max-w-xl mx-auto mt-10 p-6 bg-white rounded shadow border border-gray-200">
        <button
          onClick={() => {
            if (hasUnsavedChanges) setShowUnsavedPopup(true);
            else navigate("/privatespace/vaults");
          }}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold mb-4 text-gray-800">📝 Upload to {spaceName || "My Private Vault"}</h2>

        {/* Upload Type */}
        <div className="mb-4 text-sm">
          <label className="mr-4 font-semibold text-gray-800">Upload Type:</label>
          <label className="mr-4 text-gray-800">
            <input
              type="radio"
              name="privacy"
              value="vaulted"
              checked={isVaulted}
              onChange={() => { setIsVaulted(true); setHasUnsavedChanges(true); }}
            />{" "}
            Vaulted (Encrypted)
          </label>
          <label className="text-gray-800">
            <input
              type="radio"
              name="privacy"
              value="public"
              checked={!isVaulted}
              onChange={() => { setIsVaulted(false); setHasUnsavedChanges(true); }}
            />{" "}
            Public
          </label>
        </div>

        {/* Title */}
        <label className="block text-sm font-medium mb-1 text-gray-700">Note title:</label>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setHasUnsavedChanges(true); }}
          className="w-full p-2 mb-4 border rounded text-gray-700 text-sm bg-gray-50"
          placeholder="Enter note title"
        />

        {/* Public Note (always available, saved in `notes`) */}
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

        {/* Private Note + Vault Code (only when vaulted) */}
        {isVaulted && (
          <>
            <p className="text-sm text-red-400 mb-1">
              🔐 Private note will be encrypted using your Private vault code:
            </p>
            <textarea
              value={privateNote}
              onChange={(e) => { setPrivateNote(e.target.value); setHasUnsavedChanges(true); }}
              rows="6"
              className="w-full p-2 border bg-gray-50 rounded mb-3 text-gray-700 text-sm"
              placeholder="Write your private note here.."
            />

            <label className="block text-sm font-medium mb-1 text-gray-700">
              Enter Private vault code:
            </label>
            <input
              type="password"
              value={vaultCode}
              onChange={(e) => setVaultCode(e.target.value)}
              className="w-full p-2 border rounded mb-3 text-gray-600 text-sm bg-gray-50"
              placeholder="Vault code"
              autoComplete="current-password"
            />
          </>
        )}

        <button onClick={handleCreate} disabled={loading} className="btn-secondary w-full mt-2">
          {loading ? "Creating..." : "Upload Note"}
        </button>

        <br />
        {successMsg && <p className="text-sm text-center mt-3 text-green-600">{successMsg}</p>}
        {errorMsg && <p className="text-sm text-center mt-3 text-red-600">{errorMsg}</p>}
      </div>
    </Layout>
  );
};

