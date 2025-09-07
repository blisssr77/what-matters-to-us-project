import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { X, Search } from "lucide-react";
import { encryptText } from "../../../lib/encryption";
import Layout from "../../Layout/Layout";
import { UnsavedChangesModal } from "../../common/UnsavedChangesModal";
import { usePrivateSpaceStore } from "@/store/usePrivateSpaceStore";
import DOMPurify from "dompurify";
import RichTextEditor from "@/components/Editors/RichTextEditor";
import FullscreenCard from "@/components/Layout/FullscreenCard";
import CardHeaderActions from "@/components/Layout/CardHeaderActions";
import { addPrivateTag } from "@/lib/tagsApi";

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

  // DEBUG: see which space this page is using
  const [publicJson, setPublicJson]   = useState()
  const [publicHtml, setPublicHtml]   = useState('')
  const [privateJson, setPrivateJson] = useState()

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

  // Fetch tags = UNION of (a) user-level Private tags (NULL space) + (b) space-scoped
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
    setSuccessMsg('');
    setErrorMsg('');

    try {
      // 0) auth + active space
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user?.id) { setErrorMsg('Missing user session.'); return; }
      if (!activeSpaceId) { setErrorMsg('No active private space selected.'); return; }

      // 1) derive public values from editor
      const cleanPublicHtml = publicHtml ? DOMPurify.sanitize(publicHtml) : '';
      const hasPublic  = !!cleanPublicHtml && cleanPublicHtml.trim().length > 0;
      const hasPrivate = !!privateJson && JSON.stringify(privateJson).length > 20;

      if (!hasPublic && !hasPrivate) {
        setErrorMsg('Nothing to save.');
        return;
      }

      // 2) verify account vault code only when saving private content
      let code = '';
      if (hasPrivate) {
        code = (vaultCode || '').trim();
        if (!code) { setErrorMsg('Please enter your Private vault code.'); return; }

        const { data: ok, error: vErr } = await supabase.rpc('verify_user_private_code', { p_code: code });
        if (vErr) { setErrorMsg(vErr.message || 'Failed to verify Vault Code.'); return; }
        if (!ok)  { setErrorMsg('Incorrect Vault Code.'); return; }
      }

      // 3) encrypt private TipTap JSON (if any)
      let private_note_ciphertext = null;
      let private_note_iv = null;
      if (hasPrivate) {
        const plaintext = JSON.stringify(privateJson);
        const { encryptedData, iv } = await encryptText(plaintext, code); // base64 strings
        private_note_ciphertext = encryptedData;
        private_note_iv = iv;
        sessionStorage.setItem('vaultCode', code); // remember for this tab
      }

      // 4) public plain text + summary (for search/back-compat)
      const stripHtmlToText = (html = '') => {
        const el = document.createElement('div');
        el.innerHTML = html;
        return (el.textContent || el.innerText || '').trim();
      };
      const publicText = hasPublic ? stripHtmlToText(cleanPublicHtml) : null;
      const summary    = publicText ? publicText.slice(0, 160) : null;

      // 5) ensure tags exist (your helper)
      await ensureTagsExist(user.id);

      // 6) attempt MODERN payload first (if your table has these columns)
      const modernPayload = {
        created_by: user.id,
        user_id: user.id,
        private_space_id: activeSpaceId,

        file_name: title || 'Untitled Note',
        title: title || 'Untitled Note',
        tags: Array.isArray(tags) && tags.length ? tags : null,

        // public
        public_note_html: hasPublic ? cleanPublicHtml : null,
        notes: hasPublic ? publicText : null,
        summary: hasPublic ? summary : null,

        // private
        is_vaulted: !!hasPrivate,
        private_note_ciphertext: hasPrivate ? private_note_ciphertext : null,
        private_note_iv: hasPrivate ? private_note_iv : null,
        private_note_format: hasPrivate ? 'tiptap_json' : null,

        // keep legacy empty to avoid duplication
        encrypted_note: null,
        note_iv: null,
        created_at: new Date().toISOString(),
      };

      let insertError = null;

      // try modern columns
      let res = await supabase.from('private_vault_items').insert(modernPayload);
      insertError = res.error;

      // 7) fallback to LEGACY schema if modern columns don’t exist
      if (insertError && /column .* does not exist|42703/i.test(insertError.message || '')) {
        const legacyPayload = {
          created_by: user.id,
          user_id: user.id,
          private_space_id: activeSpaceId,

          file_name: title || 'Untitled Note',
          title: title || 'Untitled Note',
          tags,

          // store public as plain text (legacy)
          notes: publicText,

          // store private in legacy columns
          is_vaulted: !!hasPrivate,
          encrypted_note: hasPrivate ? private_note_ciphertext : null,
          note_iv: hasPrivate ? private_note_iv : null,

          created_at: new Date().toISOString(),
        };
        res = await supabase.from('private_vault_items').insert(legacyPayload);
        insertError = res.error;
      }

      if (insertError) {
        console.error(insertError);
        setErrorMsg('Failed to create note.');
      } else {
        setSuccessMsg('✅ Note created successfully!');
        setHasUnsavedChanges(false);
        setTimeout(() => navigate('/privatespace/vaults'), 1200);
      }
    } catch (e) {
      console.error('❌ Create note failed:', e);
      setErrorMsg('Something went wrong.');
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

      <FullscreenCard className="max-w-3xl mx-auto p-6 bg-white rounded shadow border border-gray-200 mt-10 relative">
        <CardHeaderActions onClose={() => navigate('/privatespace/vaults')} />

        <h2 className="text-xl font-bold mb-4 text-gray-800">📝 Upload to {spaceName || "My Private Vault"}</h2>

        {/* Upload Type */}
        <div className="mb-4 text-sm">
          <label className="mr-4 font-bold text-gray-800">Upload Type:</label>
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
        <label className="block text-sm font-bold mb-1 text-gray-800">Note title:</label>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setHasUnsavedChanges(true); }}
          className="w-full p-2 mb-4 border rounded text-gray-800 text-sm bg-gray-50"
          placeholder="Enter note title"
        />

        {/* Public note */}
        <div className="text-sm mb-4 text-gray-800">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800 m-0">Public note:</h2>
          </div>

          <div className="bg-white border font-normal border-gray-200 rounded p-3 mb-4">
            <RichTextEditor
              key="ps-public"
              valueJSON={publicJson}
              onChangeJSON={(json, html) => {
                setPublicJson(json);
                setPublicHtml(html);
                setHasUnsavedChanges(true);
              }}
            />
          </div>
        </div>

        {/* Public Note (always available, saved in `notes`) */}
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

        {/* Private Note + Vault Code (only when vaulted) */}
        {isVaulted && (
          <>
            <div className="text-sm mb-4 text-gray-800">
              <p className="text-sm font-bold text-red-500 mb-1">
                🔐 This private note will be encrypted with your Private vault code.
              </p>

              <div className="bg-white border border-gray-200 rounded p-3 mb-4">
                <RichTextEditor
                  key="ps-private"
                  valueJSON={privateJson}
                  onChangeJSON={(json) => {
                    setPrivateJson(json);
                    setHasUnsavedChanges(true);
                  }}
                />
              </div>
            </div>

            <label className="block text-sm font-bold mb-1 text-gray-800">
              Enter Private vault code to encrypt note:
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
      </FullscreenCard>
    </Layout>
  );
};

