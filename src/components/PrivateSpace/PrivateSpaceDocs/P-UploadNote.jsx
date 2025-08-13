import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { X, Search } from "lucide-react";
import { encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";

const PrivateUploadNote = () => {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");            // public note
  const [privateNote, setPrivateNote] = useState(""); // encrypted note (when vaulted)
  const [isVaulted, setIsVaulted] = useState(true);   // toggle
  const [vaultCode, setVaultCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [tags, setTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);

  // Active private space
  const [activeSpaceId, setActiveSpaceId] = useState(null);
  const [spaceName, setSpaceName] = useState("");

  const navigate = useNavigate();

  // 1) Pick an active private space (first one) for this user
  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from("private_spaces")
        .select("id, name")
        .eq("created_by", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Failed to fetch private spaces:", error);
        return;
      }

      const first = data?.[0];
      setActiveSpaceId(first?.id ?? null);
      setSpaceName(first?.name ?? "");
    })();
  }, []);

  // 2) Load available tags for this space (space-scoped first, fallback to user private tags)
  useEffect(() => {
    if (!activeSpaceId) {
      setAvailableTags([]);
      return;
    }

    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      // Try space-scoped tags
      let tagsRes = await supabase
        .from("vault_tags")
        .select("name")
        .eq("section", "Private")
        .eq("private_space_id", activeSpaceId);

      // Fallback (older schema): user-level Private tags
      if (tagsRes.error) {
        tagsRes = await supabase
          .from("vault_tags")
          .select("name")
          .eq("section", "Private")
          .eq("user_id", userId);
      }

      if (!tagsRes.error && Array.isArray(tagsRes.data)) {
        setAvailableTags(tagsRes.data.map((t) => t.name));
      } else {
        setAvailableTags([]);
      }
    })();
  }, [activeSpaceId]);

  // Auto-clear messages
  useEffect(() => {
    if (successMsg || errorMsg) {
      const t = setTimeout(() => {
        setSuccessMsg("");
        setErrorMsg("");
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [successMsg, errorMsg]);

  // Add / create tag (space-scoped if column exists; fallback to user-scoped)
  const handleTagAdd = async () => {
    if (!newTag.trim() || !activeSpaceId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return;

    // If already known locally, just add to selection
    if (availableTags.includes(newTag)) {
      if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
      setNewTag("");
      return;
    }

    // Try insert with private_space_id
    let ins = await supabase.from("vault_tags").insert({
      name: newTag.trim(),
      section: "Private",
      user_id: user.id,
      private_space_id: activeSpaceId,
    });

    // Fallback: schema without private_space_id
    if (ins.error && /column .*private_space_id/i.test(ins.error.message)) {
      ins = await supabase.from("vault_tags").insert({
        name: newTag.trim(),
        section: "Private",
        user_id: user.id,
      });
    }

    if (!ins.error) {
      setAvailableTags((prev) => [...prev, newTag.trim()]);
      if (!tags.includes(newTag.trim())) setTags((prev) => [...prev, newTag.trim()]);
      setNewTag("");
    }
  };

  // Ensure any brand-new tags exist (best-effort) before insert
  const ensureTagsExist = async (userId) => {
    for (const t of tags) {
      if (!availableTags.includes(t)) {
        try {
          await supabase.from("vault_tags").insert({
            name: t,
            section: "Private",
            user_id: userId,
            private_space_id: activeSpaceId,
          });
          setAvailableTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
        } catch (err) {
          const msg = String(err?.message || "");
          if (/column .*private_space_id/i.test(msg)) {
            const { error: e2 } = await supabase.from("vault_tags").insert({
              name: t,
              section: "Private",
              user_id: userId,
            });
            if (!e2) setAvailableTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
          }
        }
      }
    }
  };

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
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-800 mb-1 block">Public note:</label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setHasUnsavedChanges(true); }}
            rows={2}
            className="w-full p-2 border bg-gray-50 rounded text-gray-700 text-sm"
            placeholder="Public notes (Visible to shared contacts)"
          />
        </div>

        {/* Private Note + Vault Code (only when vaulted) */}
        {isVaulted && (
          <>
            <p className="text-sm text-red-400 mb-1">
              🔐 <strong>Private note</strong> will be encrypted using your Private vault code:
            </p>
            <textarea
              value={privateNote}
              onChange={(e) => { setPrivateNote(e.target.value); setHasUnsavedChanges(true); }}
              rows="6"
              className="w-full p-2 border bg-gray-50 rounded mb-3 text-gray-700 text-sm"
              placeholder="Write your private note here.."
            />

            <label className="block text-sm font-medium mb-1 text-gray-700">
              Enter <strong>Private</strong> vault code:
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

        {/* Tag Section */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Add tags:</label>

          <div className="relative flex items-center gap-2 mb-2">
            <Search className="absolute left-3 text-gray-400" size={16} />
            <input
              type="text"
              value={newTag}
              onChange={(e) => { setNewTag(e.target.value); setHasUnsavedChanges(true); }}
              placeholder="Search existing tags or create new"
              className="w-full pl-8 border border-gray-300 p-2 rounded text-gray-800 placeholder-gray-400 text-sm"
            />
            <button type="button" onClick={handleTagAdd} className="btn-secondary text-sm">
              Create
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
            {availableTags
              .filter((t) => t.toLowerCase().includes(newTag.toLowerCase()) && !tags.includes(t))
              .map((t) => (
                <div key={t} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={tags.includes(t)}
                    onChange={() => {
                      setHasUnsavedChanges(true);
                      setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
                    }}
                  />
                  <span className="text-xs text-gray-700">{t}</span>
                </div>
              ))}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {tags.map((t) => (
                <span key={t} className="bg-yellow-50 text-gray-800 text-xs px-3 py-1 rounded-full flex items-center gap-1">
                  {t}
                  <X size={12} className="cursor-pointer" onClick={() => setTags(tags.filter((x) => x !== t))} />
                </span>
              ))}
            </div>
          )}
        </div>

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

export default PrivateUploadNote;
