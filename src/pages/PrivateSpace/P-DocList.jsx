import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown, Settings, XCircle } from "lucide-react";
import { Calendar as CalendarIcon, Lock, FileText } from 'lucide-react';
import Layout from "@/components/Layout/Layout";
import WorkspaceTabs from "@/components/Layout/WorkspaceTabs";
import { usePrivateSpaceStore } from "@/store/usePrivateSpaceStore";
import dayjs from "dayjs";
import { supabase } from "@/lib/supabaseClient";
import CreatePrivateSpaceModal from "@/components/common/CreatePrivateSpaceModal";
import PrivateSpaceSettingsModal from "@/components/common/PrivatespaceSettingsModal";
import { usePrivateSpaceActions } from "@/hooks/usePrivateSpaceActions";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";

// Arrow pointing to the + button (Private Space)
const ArrowToPlusPrivate = () => (
  <div className="pointer-events-none absolute -top-6 right-3 flex flex-col items-end">
    <svg
      className="w-12 h-12 text-violet-400 animate-bounce"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M6 8c4 4 7 4 12-3" />
      <path d="M16 5l2-.5-.5 2" />
    </svg>
  </div>
);

// Empty state guide (Private Space)
// Pass `showVaultNudge={!hasVaultCode}` from the page.
const EmptyGuidePrivate = ({ onCreate, showVaultNudge = false }) => (
  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-6 text-slate-100 ring-1 ring-white/10">
    {/* Onboarding message: only when Vault Code is NOT set */}
    {showVaultNudge && (
      <div className="mb-4 rounded-lg border border-amber-300/40 bg-amber-50/70 p-3 text-amber-900">
        <p className="text-sm">
          <strong>Important:</strong> You haven’t set your Vault Code yet. Please visit your{" "}
          <a href="/dashboard" className="underline font-semibold hover:text-amber-700">
            Dashboard
          </a>{" "}
          to complete onboarding before creating your first private space.
        </p>
      </div>
    )}

    <div className="flex items-start gap-4 pt-6">
      <div className="h-10 w-10 shrink-0 rounded-xl bg-violet-600/20 text-violet-300 grid place-items-center ring-1 ring-violet-500/30">
        <span className="text-lg">🔒</span>
      </div>
      <div className="min-w-0">
        <h3 className="text-lg font-semibold">Create your first private space</h3>
        <p className="mt-1 text-sm text-slate-300">
          Private spaces are just for you—keep notes and docs separate from team workspaces.
          Click the <b>+</b> button above to start, or use the button below.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            + Create first private space
          </button>
        </div>
      </div>
    </div>

    {/* corner glow */}
    <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-violet-600/20 blur-3xl" />
    {/* arrow pointing to + */}
    <div className="absolute -top-1 right-0 translate-x-6">
      <ArrowToPlusPrivate />
    </div>
  </div>
);


export default function PrivateDocList() {
  const navigate = useNavigate();

  // ---------- filters/search ----------
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [tagSearchTerm, setTagSearchTerm] = useState("");

  // ---------- spaces & active selection ----------
  const [spaces, setSpaces] = useState([]);
  const [spaceName, setSpaceName] = useState("");
  const ensureForUser = usePrivateSpaceStore((s) => s.ensureForUser);
  const activeSpaceId = usePrivateSpaceStore((s) => s.activeSpaceId);
  const setActiveSpaceId = usePrivateSpaceStore((s) => s.setActiveSpaceId);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPrivateSettings, setShowPrivateSettings] = useState(false);

  // Determine if the workspace list is empty
  const isEmpty = (PrivateDocList?.length ?? 0) === 0;
  const { hasVaultCode } = useOnboardingStatus();

  // ---------- actions ----------
  const {
    loading,
    errorMsg,
    successMsg,
    handleRenameSpace,
    handleDeleteSpace,
    verifyUserPrivateVaultCode,
  } = usePrivateSpaceActions({
    activeSpaceId,
    spaceName,
    setSpaceName,
  });

  // derived, always-correct space name
  const currentSpaceName = useMemo(() => {
    const found = spaces.find((s) => s.id === activeSpaceId);
    return found?.name || "";
  }, [spaces, activeSpaceId]);

  // open settings: prefill input with current space name
  const openSettings = useCallback(() => {
    setSpaceName(currentSpaceName || "");
    setShowPrivateSettings(true);
  }, [currentSpaceName]);

  // log current active space
  useEffect(() => {
    if (!activeSpaceId) {
      console.info("[PrivateDocList] Active space: (none)");
    } else {
      console.info("[PrivateDocList] Active space:", {
        id: activeSpaceId,
        name: currentSpaceName || "(unknown/loading)",
      });
    }
  }, [activeSpaceId, currentSpaceName]);

  // scope store to signed-in user
  useEffect(() => {
    (async () => {
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (ensureForUser) ensureForUser(user?.id ?? null);
    })();
  }, [ensureForUser]);

  const spacesForUI = useMemo(
    () => spaces.map((s) => ({ id: s.id, name: s.name })),
    [spaces]
  );

  // ---------- reorder spaces ----------
  const handleReorder = async (newList) => {
    setSpaces(newList); // optimistic
    const updates = newList.map((s, idx) => ({ id: s.id, sort_order: idx }));
    for (const u of updates) {
      const { error } = await supabase
        .from("private_spaces")
        .update({ sort_order: u.sort_order })
        .eq("id", u.id);
      if (error) console.error("sort_order update failed:", u.id, error);
    }
  };

  // ---------- docs ----------
  const [allDocuments, setAllDocuments] = useState([]);
  const [allTags, setAllTags] = useState([]);

  // ---------- expand & overflow ----------
  const [expanded, setExpanded] = useState({});
  const [titleOverflow, setTitleOverflow] = useState({});
  const [noteOverflow, setNoteOverflow] = useState({});
  const titleRefs = useRef({});
  const noteRefs = useRef({});
  const tagBoxRef = useRef();

  const toggleExpand = (e, id) => {
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // filtered docs (compute before overflow measuring, like Workspace list)
  const filteredDocs = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return allDocuments.filter((doc) => {
      const matchesSearch =
        doc.name?.toLowerCase().includes(term) ||
        doc.title?.toLowerCase().includes(term) ||
        doc.tags?.some((tag) => tag.toLowerCase().includes(term));
      const matchesTag = selectedTag ? doc.tags?.includes(selectedTag) : true;
      return matchesSearch && matchesTag;
    });
  }, [allDocuments, searchTerm, selectedTag]);

  // measure overflow (same pattern)
  useEffect(() => {
    const t = {};
    const n = {};
    filteredDocs.forEach((doc) => {
      const tEl = titleRefs.current[doc.id];
      const nEl = noteRefs.current[doc.id];
      if (tEl && tEl.scrollHeight > tEl.clientHeight) t[doc.id] = true;
      if (nEl && nEl.scrollHeight > nEl.clientHeight) n[doc.id] = true;
    });
    setTitleOverflow(t);
    setNoteOverflow(n);
  }, [filteredDocs]);

  // ---------- data fetching ----------
  const fetchSpaces = useCallback(async () => {
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("private_spaces")
      .select("id, name, sort_order")
      .eq("created_by", user.id)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("❌ Failed to fetch private spaces:", error);
      return;
    }

    setSpaces(data ?? []);
    console.info("[PrivateDocList] Fetched spaces:", data?.length ?? 0);
    if (!activeSpaceId && data?.length) setActiveSpaceId(data[0].id);
  }, [activeSpaceId, setActiveSpaceId]);

  // initial fetch
  useEffect(() => { fetchSpaces(); }, [fetchSpaces]);

  // fetch documents for active space
  const fetchDocuments = useCallback(async (spaceId) => {
    if (!spaceId) return;
    const { data, error } = await supabase
      .from("private_vault_items")
      .select("*")
      .eq("private_space_id", spaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Failed to fetch private docs:", error);
      return;
    }

    setAllDocuments(data || []);
    setAllTags(Array.from(new Set((data || []).flatMap((d) => d.tags || []))));
    setExpanded({});
  }, []);

  // fetch when active space changes
  useEffect(() => {
    if (activeSpaceId) fetchDocuments(activeSpaceId);
  }, [activeSpaceId, fetchDocuments]);

  // helper to run after delete (PrivateSpace)
  const handleConfirmDeleteSpace = async (code) => {
    const psId = activeSpaceId; // snapshot before mutations

    // If your modal already verified the code, you can skip this:
    // const okCode = await verifyUserPrivateVaultCode?.(code);
    // if (!okCode) return;

    // run your delete (client-side sequence from usePrivateSpaceActions)
    const ok = await handleDeleteSpace?.(); // it already deletes the space + items
    if (!ok) return;

    // compute nextId using current state
    const remaining = spaces.filter((s) => s.id !== psId);
    const nextId = remaining[0]?.id ?? null;

    // now update states separately (event handler = safe)
    setSpaces(remaining);
    setActiveSpaceId(nextId);
    setAllDocuments([]);
    setAllTags([]);                // optional: clear tag list after removal
    setShowPrivateSettings(false); // close settings modal if open
    setSpaceName(remaining.find((s) => s.id === nextId)?.name || "");
  };

  // action logs (rename/delete)
  useEffect(() => {
    if (successMsg) console.info("[PrivateDocList] Action success:", successMsg);
    if (errorMsg) console.warn("[PrivateDocList] Action error:", errorMsg);
  }, [successMsg, errorMsg]);

  // close tag filter on outside click
  useEffect(() => {
    const onDown = (e) => {
      if (tagBoxRef.current && !tagBoxRef.current.contains(e.target)) {
        setShowTagFilter(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ---- callbacks from modals ----
  const handleSpaceCreated = useCallback((space) => {
    // re-fetch + activate the newly created space
    fetchSpaces().then(() => {
      if (space?.id) setActiveSpaceId(space.id);
    });
  }, [fetchSpaces, setActiveSpaceId]);

  const handleSpaceRenamed = useCallback((spaceId, newName) => {
    setSpaces((prev) => prev.map((s) => (s.id === spaceId ? { ...s, name: newName } : s)));
    if (spaceId === activeSpaceId) setSpaceName(newName);
  }, [activeSpaceId]);

  const handleSpaceDeleted = useCallback((spaceId) => {
    setSpaces((prev) => {
      const remaining = prev.filter((s) => s.id !== spaceId);
      // choose next active
      const next = remaining[0]?.id ?? null;
      setActiveSpaceId(next);
      setAllDocuments([]);
      setAllTags([]);
      return remaining;
    });
  }, [setActiveSpaceId]);

  return (
    <Layout noGutters>
      {/* Tabs bar (reusing WorkspaceTabs UI) */}
      <WorkspaceTabs
        workspaces={spacesForUI}
        activeId={activeSpaceId}
        onSelect={(id) => setActiveSpaceId(id)}
        onSettingsClick={openSettings}
        onCreateClick={() => setShowCreateModal(true)}
        onReorder={handleReorder}
      />

      <div className="p-6 max-w-5xl mx-auto text-sm">
        {isEmpty ? (
          <EmptyGuidePrivate 
          onCreate={() => setShowCreateModal(true)}
          showVaultNudge={!hasVaultCode}
          />
        ) : (
          <>
        {/* Buttons Row */}
        <div className="flex justify-end gap-2 mb-4">
          <button
            onClick={() => navigate("/privatespace/vaults/file-upload")}
            className="btn-main"
          >
            + Upload Document
          </button>
          <button
            onClick={() => navigate("/privatespace/vaults/note-upload")}
            className="btn-main"
          >
            + Create Note
          </button>
        </div>

        {/* Title */}
        {/* <h2 className="text-xl font-bold text-gray-900 mb-4">{spaceName}</h2> */}

        {/* Search + Tag */}
        <div className="flex flex-wrap md:flex-nowrap justify-between items-start gap-4 mb-6">
          {/* Search */}
          <div className="relative w-full md:w-1/2">
            <Search className="absolute left-3 top-3 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-800 hover:border-gray-500 focus:outline-none focus:ring-0 focus:ring-gray-500 focus:ring-offset-1"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Tag filter */}
          <div className="relative w-full md:w-1/2" ref={tagBoxRef}>
            <button
              onClick={() => setShowTagFilter((s) => !s)}
              className="w-full flex items-center justify-between px-4 py-2 border border-gray-300 rounded-lg hover:border-gray-500 text-gray-400 bg-white shadow-sm focus:ring-0 focus:ring-gray-500"
              aria-expanded={showTagFilter}
            >
              {selectedTag ? `Tag: ${selectedTag}` : "Search by Tag"}
              <ChevronDown className="ml-2 text-gray-400" size={18} />
            </button>

            {showTagFilter && (
              <div className="absolute z-30 mt-2 w-full max-h-60 bg-white border border-gray-300 rounded-lg shadow p-3 text-gray-800">
                <input
                  type="text"
                  placeholder="Filter tags..."
                  value={tagSearchTerm}
                  onChange={(e) => setTagSearchTerm(e.target.value)}
                  className="w-full p-2 mb-2 border border-gray-300 rounded text-sm text-gray-800 hover:border-gray-500"
                />
                <div className="max-h-40 overflow-y-auto mb-1">
                  {allTags
                    .filter((t) => t.toLowerCase().includes(tagSearchTerm.toLowerCase()))
                    .map((tag) => (
                      <div
                        key={tag}
                        onClick={() => {
                          setSelectedTag(tag);
                          setShowTagFilter(false);
                        }}
                        className={`cursor-pointer px-3 py-1 rounded text-sm ${
                          tag === selectedTag
                            ? "bg-purple-100 text-purple-700 font-semibold"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        {tag}
                      </div>
                    ))}
                </div>
                {selectedTag && (
                  <button
                    className="text-xs text-red-500 underline"
                    onClick={() => setSelectedTag("")}
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Document Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredDocs.map((doc) => {
            const hasFiles   = Array.isArray(doc.file_metas) && doc.file_metas.length > 0;
            const isVaulted  = !!doc.is_vaulted;
            const isExpanded = !!expanded[doc.id];

            // calendar bits
            const isOnCalendar = !!doc.calendar_enabled;
            const start        = doc.start_at ? dayjs(doc.start_at) : null;
            const end          = doc.end_at ? dayjs(doc.end_at) : null;
            const isAllDay     = !!doc.all_day;
            const colorDot     = doc.calendar_color || '#2563eb';

            // creator chip (prefer a joined profile object if you fetched it)
            // supports any of: doc.creator, doc.owner, doc.profile, or flat fields
            const creator =
              doc.creator || doc.owner || doc.profile || {
                username: doc.owner_username || doc.created_by_username,
                first_name: doc.owner_first_name || doc.created_by_first_name,
              };

            return (
              <div
                key={doc.id}
                onClick={() =>
                  navigate(
                    hasFiles
                      ? `/privatespace/vaults/doc-view/${doc.id}`
                      : `/privatespace/vaults/note-view/${doc.id}`
                  )
                }
                className={[
                  'relative cursor-pointer rounded-xl p-4 transition shadow-md hover:shadow-lg border',
                  isVaulted
                    ? 'bg-gradient-to-br from-gray-300 to-white border-purple-100 hover:border-gray-700'
                    : 'bg-white border-purple-200 hover:border-purple-700',
                ].join(' ')}
              >
                {/* HEADER: title (left) + badges (right) */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  {/* Left: color dot + title */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="h-2.5 w-2.5 rounded-full mt-1.5 shrink-0"
                      style={{ background: isOnCalendar ? colorDot : '#e5e7eb' }}
                    />
                    <div
                      ref={(el) => (titleRefs.current[doc.id] = el)}
                      className={`text-[15px] leading-snug text-black font-bold ${
                        isExpanded ? '' : 'line-clamp-4'
                      }`}
                    >
                      {doc.title || doc.name || 'Untitled'}
                    </div>
                  </div>

                  {/* Right: badges (wrap nicely; no absolute positioning) */}
                  <div className="shrink-0 flex flex-wrap justify-end gap-1">
                    {isOnCalendar ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 text-white text-[10px] px-2 py-[2px] shadow">
                        <CalendarIcon size={12} /> On calendar
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 text-[10px] px-2 py-[2px] border">
                        <CalendarIcon size={12} /> Not on calendar
                      </span>
                    )}
                    {isVaulted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 text-[10px] px-2 py-[2px] border border-purple-200">
                        <Lock size={12} /> Vaulted
                      </span>
                    )}
                  </div>
                </div>

                {/* SUBHEADER: creator + schedule strip */}
                <div className="justify-end flex flex-wrap items-center gap-2 text-[10px] mb-2">
                  {(creator?.username || creator?.first_name) && (
                    <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-[2px] border">
                      {creator.username ? `@${creator.username}` : (creator.first_name || 'You')}
                    </span>
                  )}

                  {isOnCalendar ? (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-[2px] border border-blue-100">
                        <CalendarIcon size={12} />
                        {isAllDay
                          ? (start ? start.format('MMM D, YYYY') : 'All day')
                          : (start
                              ? `${start.format('MMM D, YYYY h:mm A')}${
                                  end ? ` – ${end.format('h:mm A')}` : ''
                                }`
                              : 'Scheduled')}
                      </span>
                      {/* {doc.calendar_status && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-[2px] border">
                          {doc.calendar_status}
                        </span>
                      )} */}
                      {doc.assignee_id && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-[2px] border">
                          Assigned
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-500">Not scheduled — open to add a time</span>
                  )}
                </div>

                {/* Public Note */}
                {doc.notes && (
                  <p
                    ref={(el) => (noteRefs.current[doc.id] = el)}
                    className={`text-sm mt-2 text-gray-800 ${isExpanded ? '' : 'line-clamp-5'}`}
                  >
                    {doc.notes}
                  </p>
                )}

                {/* Show more/less */}
                {(titleOverflow[doc.id] || noteOverflow[doc.id]) && (
                  <button
                    onClick={(e) => toggleExpand(e, doc.id)}
                    className="mt-2 inline-flex items-center gap-1 text-[9.5px] px-2 rounded-full border border-gray-300 text-gray-800 hover:border-gray-500 hover:text-purple-500 transition font-semibold"
                  >
                    {isExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}

                {/* Tags */}
                {doc.tags?.length > 0 && (
                  <div className="mt-2 mb-1 flex flex-wrap gap-1">
                    {doc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full bg-yellow-50 text-yellow-800 border border-yellow-200 px-2 py-[2px] text-[9.5px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Meta */}
                <div className="mt-2 space-y-1 text-[11px] text-gray-500">
                  {doc.updated_at && doc.updated_at !== doc.created_at && (
                    <div>Last modified: {dayjs(doc.updated_at).format('MMM D, YYYY h:mm A')}</div>
                  )}
                  <div>Uploaded: {dayjs(doc.created_at).format('MMM D, YYYY h:mm A')}</div>
                  {(creator?.username || creator?.first_name) && (
                    <div>
                      {creator.username ? `@${creator.username}` : (creator.first_name || 'You')}
                    </div>
                  )}
                  {hasFiles && <div className="text-red-600 font-semibold">-Contains file-</div>}
                </div>
              </div>
            );
          })}
        </div>
        </>
        )}
      </div>
      
      {/* Private Space Settings Modal */}
      <PrivateSpaceSettingsModal
        open={showPrivateSettings}
        onClose={() => setShowPrivateSettings(false)}
        spaceName={spaceName}
        setSpaceName={setSpaceName}
        onVerifyVaultCode={verifyUserPrivateVaultCode}
        onRenamed={(spaceId, newName) => {
          // keep local list & header in sync
          setSpaces(prev => prev.map(s => (s.id === spaceId ? { ...s, name: newName } : s)));
          if (spaceId === activeSpaceId) setSpaceName(newName);
          // optional: pull latest from DB
          fetchSpaces();
        }}
        onDeleted={(spaceId) => {
          // remove locally + pick next active
          setSpaces(prev => {
            const remaining = prev.filter(s => s.id !== spaceId);
            const nextId = remaining[0]?.id ?? null;
            setActiveSpaceId(nextId);
            setAllDocuments([]);
            setAllTags([]);
            return remaining;
          });
          // optional: pull latest from DB
          fetchSpaces();
        }}
      />

      {/* Create Private Space Modal */}
      <CreatePrivateSpaceModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(ps) => {
          // No manual sort_order setting — trigger does it.
          // Just refetch and activate the new space.
          fetchSpaces().then(() => setActiveSpaceId(ps.id));
          setShowCreateModal(false);
        }}
      />
    </Layout>
  );
}