import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { X, Plus, Lock, Users, Loader2, Tag as TagIcon, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import AddToCalendar from "@/components/Calendar/AddToCalendar.jsx";

// slugify for tag names (simple, no dependencies)
const slugify = (s = "") =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");

async function ensureTagsForScope({ names = [], scope, workspaceId, privateSpaceId, uid }) {
  if (!names?.length) return [];
  const section = scope === "workspace" ? "Workspace" : "Private";
  const slugs = names.map(slugify);

  // 1) existing
  let q = supabase.from("vault_tags")
    .select("id,name,slug")
    .eq("section", section);
  if (scope === "workspace") q = q.eq("workspace_id", workspaceId);
  else q = q.eq("user_id", uid).eq("private_space_id", privateSpaceId);

  const { data: existing = [], error: selErr } = await q.in("slug", slugs);
  if (selErr) throw selErr;

  const existingSet = new Set(existing.map(t => t.slug));
  const toInsert = names
    .map(name => ({ name, slug: slugify(name) }))
    .filter(t => !existingSet.has(t.slug));

  // 2) insert missing (no on_conflict)
  let inserted = [];
  if (toInsert.length) {
    const rows = toInsert.map(({ name, slug }) => ({
      name, slug, section,
      created_by: uid,
      workspace_id: scope === "workspace" ? workspaceId : null,
      private_space_id: scope === "private" ? privateSpaceId : null,
      user_id: scope === "private" ? uid : null,
    }));
    const { data, error } = await supabase
      .from("vault_tags")
      .insert(rows)
      .select("id,name,slug");
    if (error) throw error;
    inserted = data || [];
  }
  // return union if need it
  return [...existing, ...inserted];
}

export default function QuickAddModal({
  open,
  onClose,
  onCreated,                    // (newRow) => void
  defaultScope = "workspace",   // 'workspace' | 'private'
}) {
  const [scope, setScope] = useState(defaultScope); // workspace | private
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // basic fields
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  // selections
  const [workspaces, setWorkspaces] = useState([]);       // [{id, name}]
  const [privateSpaces, setPrivateSpaces] = useState([]); // [{id, name}]
  const [workspaceId, setWorkspaceId] = useState("");
  const [privateSpaceId, setPrivateSpaceId] = useState("");

  // tags in the currently selected space (clickable suggestions)
  const [spaceTags, setSpaceTags] = useState([]);         // string[]

  // calendar payload from child (or null)
  const [calPayload, setCalPayload] = useState(null);

  // vault options
  const [isVaulted, setIsVaulted] = useState(defaultScope === "private"); // toggle
  const [hasWSCode, setHasWSCode] = useState(null);       // null=loading, true/false
  const [hasPVCode, setHasPVCode] = useState(null);

  const [uid, setUid] = useState(null); // current user id
  const firstFieldRef = useRef(null);

  // reset when opened
  useEffect(() => {
    if (!open) return;
    setErr("");
    setLoading(false);
    setTitle("");
    setNotes("");
    setTagsInput("");
    setCalPayload(null);
    setScope(defaultScope);
    setIsVaulted(defaultScope === "private");
    setSpaceTags([]);

    (async () => {
      // current user
      const { data: { user } = {} } = await supabase.auth.getUser();
      setUid(user?.id ?? null);

      // workspaces current user is a member of
      const { data: wsRows } = await supabase
        .from("workspace_members")
        .select(`
          workspace_id,
          workspaces:workspaces!workspace_members_workspace_id_fkey (id, name)
        `)
        .eq("user_id", user?.id ?? "");

      const wsList = (wsRows || [])
        .filter((r) => r.workspaces)
        .map((r) => ({ id: r.workspaces.id, name: r.workspaces.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setWorkspaces(wsList);
      if (!workspaceId && wsList[0]?.id) setWorkspaceId(wsList[0].id);

      // private spaces (yours)
      const { data: psRows } = await supabase
        .from("private_spaces")
        .select("id, name")
        .eq("created_by", user?.id ?? "")
        .order("sort_order", { ascending: true });

      const psList = (psRows || []).map((r) => ({ id: r.id, name: r.name || "Untitled" }));
      setPrivateSpaces(psList);
      if (!privateSpaceId && psList[0]?.id) setPrivateSpaceId(psList[0].id);

      // vault code presence for user
      const { data: vc } = await supabase
        .from("vault_codes")
        .select("workspace_code_hash, private_code_hash")
        .eq("id", user?.id ?? "")
        .maybeSingle();

      setHasWSCode(!!vc?.workspace_code_hash);
      setHasPVCode(!!vc?.private_code_hash);

      // focus
      setTimeout(() => firstFieldRef.current?.focus(), 50);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultScope]);

  // fetch existing tags for the chosen space
  useEffect(() => {
    if (!open) return;
    (async () => {
        try {
        if (scope === "workspace" && workspaceId) {
            const { data } = await supabase
            .from("vault_tags")
            .select("name")
            .eq("section", "Workspace")
            .eq("workspace_id", workspaceId);
            setSpaceTags([...(new Set((data || []).map(r => r.name)))].sort((a,b)=>a.localeCompare(b)));
        } else if (scope === "private" && privateSpaceId && uid) {
            const { data } = await supabase
            .from("vault_tags")
            .select("name")
            .eq("section", "Private")
            .eq("private_space_id", privateSpaceId)
            .eq("user_id", uid);
            setSpaceTags([...(new Set((data || []).map(r => r.name)))].sort((a,b)=>a.localeCompare(b)));
        } else {
            setSpaceTags([]);
        }
        } catch {
        setSpaceTags([]);
        }
    })();
    }, [open, scope, workspaceId, privateSpaceId, uid]);

  const tags = useMemo(
    () =>
      tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsInput]
  );

  const addTagChip = useCallback((t) => {
    const cur = new Set(tags.map(x => x.toLowerCase()));
    if (cur.has(t.toLowerCase())) return;
    const next = (tagsInput ? `${tagsInput}, ` : "") + t;
    setTagsInput(next);
  }, [tags, tagsInput]);

  const canSubmit = useMemo(() => {
    if (!title.trim()) return false;
    if (!uid) return false;
    if (scope === "workspace" && !workspaceId) return false;
    if (scope === "private" && !privateSpaceId) return false;

    // if user requests vaulted but no code for that scope, block
    if (isVaulted) {
      if (scope === "workspace" && hasWSCode === false) return false;
      if (scope === "private"   && hasPVCode === false) return false;
    }
    return true;
  }, [title, uid, scope, workspaceId, privateSpaceId, isVaulted, hasWSCode, hasPVCode]);

  const handleCreate = useCallback(async () => {
    if (!canSubmit || loading) return;
    setErr("");
    setLoading(true);

    try {
      const base = {
        created_by: uid,                       // ensure secure views see the owner
        title: title.trim(),
        notes: notes.trim() || null,
        tags: tags.length ? tags : null,       // stored in DB
        is_vaulted: !!isVaulted,               // toggle-based
        ...(calPayload ?? { calendar_enabled: false }),
      };

      // scope-specific
      const tagRows = await ensureTagsForScope({
        names: tags,
        scope,
        workspaceId,
        privateSpaceId,
        uid,
      });

      // INSERT into the right table
      let res;
        if (scope === "workspace") {
            const { data, error } = await supabase
                .from("workspace_vault_items")
                .insert({ ...base, workspace_id: workspaceId })
                .select()
                .single();
        if (error) throw error;
        res = data;
        } else {
            const body = {
                ...base,
                private_space_id: privateSpaceId,
                user_id: uid,                                 // ✅ REQUIRED by schema
                file_name: title.trim() || "Untitled",        // ✅ REQUIRED by schema
            };
            const { data, error } = await supabase
            .from("private_vault_items")
            .insert(body)
            .select()
            .single();
        if (error) throw error;
        res = data;
        }

      onCreated?.(res);
      onClose?.();
    } catch (e) {
      console.error("QuickAdd create failed:", { code: e?.code, details: e?.details, hint: e?.hint, message: e?.message });
      setErr(e?.message || "Failed to create item");
    } finally {
      setLoading(false);
    }
  }, [canSubmit, loading, scope, workspaceId, privateSpaceId, title, notes, tags, calPayload, isVaulted, uid, onCreated, onClose]);

  // close on esc / cmd+enter
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
        e.preventDefault();
        handleCreate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canSubmit, handleCreate, onClose]);

  if (!open) return null;

  const scopeNeedsCode = isVaulted && (
    (scope === "workspace" && hasWSCode === false) ||
    (scope === "private"   && hasPVCode === false)
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* modal */}
      <div className="relative z-[101] w-full max-w-xl rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={[
                "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold",
                scope === "workspace"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200",
              ].join(" ")}
              onClick={() => { setScope("workspace"); setIsVaulted(false); }}
            >
              <Users size={14} /> Workspace
            </button>
            <button
              type="button"
              className={[
                "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold",
                scope === "private"
                  ? "bg-violet-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200",
              ].join(" ")}
              onClick={() => { setScope("private"); setIsVaulted(true); }}
            >
              <Lock size={14} /> Private
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="px-5 py-4 space-y-4">
          {/* vault toggle + warning if no code */}
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={isVaulted}
                onChange={(e) => setIsVaulted(e.target.checked)}
              />
              Create as vaulted {scope === "private" ? "(uses your Private vault code)" : "(uses Workspace vault code)"}
            </label>
          </div>
          {scopeNeedsCode && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 text-xs">
              <ShieldAlert size={16} className="mt-0.5" />
              <div>
                You haven’t set a {scope} vault code yet.  
                Go to <a href="/dashboard" className="underline font-semibold">Dashboard → Vault codes</a> to set it before creating vaulted items.
              </div>
            </div>
          )}

          {/* scope pickers */}
          {scope === "workspace" ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Workspace</label>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm text-gray-800"
              >
                {workspaces.length === 0 && <option value="">No workspaces</option>}
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Private space</label>
              <select
                value={privateSpaceId}
                onChange={(e) => setPrivateSpaceId(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm text-gray-800"
              >
                {privateSpaces.length === 0 && <option value="">No private spaces</option>}
                {privateSpaces.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* title */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Title *</label>
            <input
              ref={firstFieldRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Quick note or document title"
              className="w-full border rounded px-3 py-2 text-sm text-gray-800"
            />
          </div>

          {/* notes */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add a quick description…"
              className="w-full border rounded px-3 py-2 text-sm text-gray-800"
            />
          </div>

          {/* tags */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tags (comma separated)</label>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="design, sprint, feedback"
                className="w-full border rounded px-3 py-2 text-sm text-gray-800"
              />
            </div>

            {/* available tags for this space */}
            {spaceTags.length > 0 && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1 inline-flex items-center gap-1">
                  <TagIcon size={12}/> Available tags in this {scope === "workspace" ? "workspace" : "private space"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {spaceTags.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addTagChip(t)}
                      className="text-[11px] px-2 py-[2px] rounded-full border bg-yellow-50 text-yellow-800 hover:bg-gray-50"
                      title={`Add "${t}"`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* calendar (optional) */}
          <div className="border rounded-lg p-3">
            <AddToCalendar
              initial={{ calendar_enabled: false }}
              isVaulted={isVaulted}
              onChange={setCalPayload}
            />
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        {/* footer */}
        <div className="px-5 py-3 border-t flex items-center justify-between">
          <p className="text-[11px] text-gray-500">
            ⌘/Ctrl + Enter to create
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded border text-gray-700 hover:bg-gray-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit || loading}
              onClick={handleCreate}
              className={[
                "inline-flex items-center gap-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-sm",
                (!canSubmit || loading) ? "opacity-60 cursor-not-allowed" : ""
              ].join(" ")}
            >
              {loading ? <Loader2 className="animate-spin" size={16}/> : <Plus size={16} />}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
