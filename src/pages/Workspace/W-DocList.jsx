import React from "react";
import { useState, useEffect, useRef, Select } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown, XCircle, Settings } from "lucide-react";
import { Calendar as CalendarIcon, Lock, FileText } from 'lucide-react';
import Layout from "../../components/Layout/Layout";
import dayjs from "dayjs";
import { supabase } from "../../lib/supabaseClient";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { useUserRole } from "../../hooks/useUserRole";
import InviteModal from "../../components/common/InviteModal";
import WorkspaceTabs from "@/components/Layout/WorkspaceTabs";
import WorkspaceSettingsModal from "@/components/common/WorkspaceSettingsModal";
import CreateWorkspaceModal from "@/components/common/CreateWorkspaceModal";
import { useWorkspaceActions } from "../../hooks/useWorkspaceActions.js";
import FullscreenCard from "@/components/Layout/FullscreenCard";
import CardHeaderActions from "@/components/Layout/CardHeaderActions";

export default function WorkspaceVaultList() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [allDocuments, setAllDocuments] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [tagSearchTerm, setTagSearchTerm] = useState("");

  // Workspace related state
  const [workspaceList, setWorkspaceList] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [members, setMembers] = useState([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId);
  const setActiveWorkspaceId = useWorkspaceStore(s => s.setActiveWorkspaceId);
  const ensureForUser = useWorkspaceStore(s => s.ensureForUser);
  const userRole = useUserRole(activeWorkspaceId);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // State for document card expansion
  const [expanded, setExpanded] = useState({});
  const [titleOverflow, setTitleOverflow] = useState({});
  const [noteOverflow, setNoteOverflow] = useState({});
  const titleRefs = useRef({});
  const noteRefs = useRef({});

  // State for workspace creation modal
  const [showCreateWorkspaceModal, setShowCreateWorkspaceModal] = useState(false);

  const {
    handleRename,
    handleRoleChange,
    handleDeleteWorkspace,
    workspaceActionLoading,
    workspaceActionErrorMsg,
    workspaceActionSuccessMsg,
  } = useWorkspaceActions({
    activeWorkspaceId,
    workspaceName,
    setWorkspaceName,
    setMembers,
  });

  const tagBoxRef = useRef();

  // Toggle expand/collapse for document cards
  const toggleExpand = (e, id) => {
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 2) Compute filteredDocs BEFORE any effect that uses it
  const filteredDocs = React.useMemo(() => {
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

  // 3) It's safe to use filteredDocs in effects / deps
  useEffect(() => {
    const newTitleOverflow = {};
    const newNoteOverflow = {};

    filteredDocs.forEach((doc) => {
      const titleEl = titleRefs.current[doc.id];
      const noteEl = noteRefs.current[doc.id];
      if (titleEl && titleEl.scrollHeight > titleEl.clientHeight) newTitleOverflow[doc.id] = true;
      if (noteEl && noteEl.scrollHeight > noteEl.clientHeight) newNoteOverflow[doc.id] = true;
    });

    setTitleOverflow(newTitleOverflow);
    setNoteOverflow(newNoteOverflow);
  }, [filteredDocs]); 

  // Filter documents based on search term and selected tag
  useEffect(() => {
    const fetchAllWorkspaces = async () => {
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("workspace_members")
        .select(`
          workspace_id,
          sort_order,
          workspaces:workspaces!workspace_members_workspace_id_fkey (id, name)
        `)
        .eq("user_id", user.id);

      if (error) {
        console.error("❌ Failed to fetch user workspaces", error);
        return;
      }

      const mapped = (data || [])
        .filter((row) => row.workspaces)
        .map((row) => ({
          id: row.workspaces.id,
          name: row.workspaces.name,
          sort_order: row.sort_order ?? null,
        }));

      // sort: by sort_order first (nulls last), then by name
      const sorted = [...mapped].sort((a, b) => {
        const ao = a.sort_order ?? Number.POSITIVE_INFINITY;
        const bo = b.sort_order ?? Number.POSITIVE_INFINITY;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
      });

      setWorkspaceList(sorted);

      // ensure there's an active workspace
      if (!activeWorkspaceId && sorted.length) {
        setActiveWorkspaceId(sorted[0].id);
      }
    };

    fetchAllWorkspaces();
  }, [activeWorkspaceId, setActiveWorkspaceId]);

  // Fetch and ensure workspace data when activeWorkspaceId changes
  const handleReorder = async (newList) => {
    // optimistic UI
    setWorkspaceList(newList.map((ws, idx) => ({ ...ws, sort_order: idx })));

   const { data: { user } = {} } = await supabase.auth.getUser();
   if (!user) return;

   // persist per-user sort_order (one row per membership)
   for (let i = 0; i < newList.length; i++) {
     const ws = newList[i];
     const { error } = await supabase
       .from("workspace_members")
       .update({ sort_order: i })
       .match({ user_id: user.id, workspace_id: ws.id });
     if (error) console.error("Failed to persist sort_order", { wsId: ws.id, i, error });
   }
 };

  // Insert profile if it doesn't exist, from AuthPage.jsx and Google signup
  useEffect(() => {
    const insertProfileIfNeeded = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: existingProfile, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!existingProfile && !error) {
        await supabase.from("profiles").insert({
          id: user.id,
          email: user.email,
        });
      }
    };

    insertProfileIfNeeded();
  }, []);
  
  // Fetch members and their roles in the workspace
  useEffect(() => {
    const fetchMembersAndRole = async () => {
      if (!activeWorkspaceId) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setLoading(true);

      // 1. Get all members in this workspace
      const { data: membersData, error: membersError } = await supabase
        .from("workspace_members")
        .select("id, role, invited_by_name, profiles!workspace_members_user_id_fkey(username)")
        .eq("workspace_id", activeWorkspaceId);

      if (membersError) {
        console.error("❌ Failed to fetch members:", membersError);
      } else {
        setMembers(membersData);
      }

      setLoading(false);
    };

    fetchMembersAndRole();
  }, [activeWorkspaceId]);

  // Fetch all documents and notes on component mount
  useEffect(() => {
    if (!activeWorkspaceId) return;

    const fetchDocs = async () => {
      const { data, error } = await supabase
        .from("workspace_vault_items")
        .select("*")
        .order("created_at", { ascending: false })
        .eq("workspace_id", activeWorkspaceId);

      if (!error) {
        setAllDocuments(data);
        const tags = Array.from(new Set(data.flatMap((doc) => doc.tags || [])));
        setAllTags(tags);
      }
    };

    fetchDocs();
  }, [activeWorkspaceId]);

  // Close tag filter when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tagBoxRef.current && !tagBoxRef.current.contains(event.target)) {
        setShowTagFilter(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // helper to run after delete
  const handleConfirmDelete = async (code) => {
    const wsId = activeWorkspaceId;              // snapshot before mutations

    // run delete (RPC or client-side sequence)
    const ok = await handleDeleteWorkspace?.(code); // or serverDeleteWorkspace(code)
    if (!ok) return;

    // compute nextId using current state
    const remaining = workspaceList.filter(w => w.id !== wsId);
    const nextId = remaining[0]?.id ?? null;

    // now update states separately (event handler = safe)
    setWorkspaceList(remaining);
    setActiveWorkspaceId(nextId);
    setAllDocuments([]);
    setMembers([]);
    setSettingsModalOpen(false);
  };

  // Verify workspace vault code
  const verifyWorkspaceCode = async (code) => {
    if (!activeWorkspaceId) return false;
    const { data, error } = await supabase.rpc("verify_workspace_code", {
      p_workspace: activeWorkspaceId,
      p_code: code,
    });
    if (error) {
      console.error("verify_workspace_code error:", error);
      return false;
    }
    return !!data; // true if valid
  };

  return (
    <Layout noGutters>
      {/* Header with Settings Icon */}
      <>
      <WorkspaceTabs
        workspaces={workspaceList}
        activeId={activeWorkspaceId}
        onSelect={(id) => setActiveWorkspaceId(id)}
        onSettingsClick={() => setSettingsModalOpen(true)}
        onCreateClick={() => setShowCreateWorkspaceModal(true)}
        onReorder={handleReorder}
      />
      </>
      
      <div className="p-6 max-w-5xl mx-auto text-sm">
        {/* Buttons Row */}
        <div className="flex justify-end gap-2 mb-4">

          {/* Upload and Create Buttons */}
          <button
            onClick={() => navigate("/workspace/vaults/file-upload")}
            className="btn-main"
          >
            + Upload Document
          </button>
          <br />
          <button
            onClick={() => navigate("/workspace/vaults/note-upload")}
            className="btn-main"
          >
            + Create Note
          </button>
        </div>

        {/* Title */}
        {/* <h2 className="text-xl font-bold text-gray-900 mb-4">{workspaceName}</h2> */}

        {/* Search and Tag Filters */}
        <div className="flex flex-wrap md:flex-nowrap justify-between items-start gap-4 mb-6">

          {/* Search Bar */}
          <div className="relative w-full md:w-1/2"> 
            <Search className="absolute left-3 top-3 text-gray-500" size={18} />

            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg shadow-sm hover:border-gray-500 text-gray-800 focus:outline-none focus:ring-0 focus:ring-gray-500"
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

          {/* Tag Toggle Button */}
          <div className="relative w-full md:w-1/2" ref={tagBoxRef}>
            <button
              onClick={() => setShowTagFilter(!showTagFilter)}
              className="w-full flex items-center justify-between px-4 py-2 border border-gray-300 rounded-lg hover:border-gray-500 text-gray-400 bg-white shadow-sm focus:ring-0 focus:ring-gray-500"
            >
              {selectedTag ? `Tag: ${selectedTag}` : "Search by Tag"}
              <ChevronDown className="ml-2 text-gray-400" size={18} />
            </button>

            {/* Tag Filter Dropdown */}
            {showTagFilter && (
              <div className="absolute z-30 mt-2 w-full max-h-60 bg-white border border-gray-300 rounded-lg shadow p-3 text-gray-800">
                <input
                  type="text"
                  placeholder="Filter tags..."
                  value={tagSearchTerm}
                  onChange={(e) => setTagSearchTerm(e.target.value)}
                  className="w-full p-2 mb-2 border border-gray-300 rounded text-sm text-gray-800 hover:border-gray-500"
                />

                {/* Display filtered tags */}
                <div className="max-h-40 overflow-y-auto mb-1">
                  {allTags
                    .filter((tag) => tag.toLowerCase().includes(tagSearchTerm.toLowerCase()))
                    .map((tag) => (
                      <div
                        key={tag}
                        onClick={() => {
                          setSelectedTag(tag);
                          setShowTagFilter(false);
                        }}
                        className={`cursor-pointer px-3 py-1 rounded text-xs ${
                          tag === selectedTag ? "bg-purple-100 text-purple-700 font-semibold" : "hover:bg-gray-100"
                        }`}
                      >
                        {tag}
                      </div>
                    ))}
                </div>

                {/* Clear Filter Button */}
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

            // NEW: calendar bits
            const isOnCalendar = !!doc.calendar_enabled;
            const start = doc.start_at ? dayjs(doc.start_at) : null;
            const end   = doc.end_at ? dayjs(doc.end_at) : null;
            const isAllDay = !!doc.all_day;
            const colorDot = doc.calendar_color || '#2563eb';

            return (
              <div
                key={doc.id}
                onClick={() =>
                  navigate(
                    hasFiles
                      ? `/workspace/vaults/doc-view/${doc.id}`
                      : `/workspace/vaults/note-view/${doc.id}`
                  )
                }
                className={[
                  "relative cursor-pointer rounded-xl p-4 transition shadow-md hover:shadow-lg border",
                  isVaulted
                    ? "bg-gradient-to-br from-gray-300 to-white border-purple-100 hover:border-gray-700"
                    : "bg-white border-purple-200 hover:border-purple-700"
                ].join(" ")}
              >
                {/* HEADER: title (left) + badges (right) */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  {/* Left: color dot + title */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="h-2.5 w-2.5 rounded-full mt-1.5 shrink-0"
                      style={{ background: isOnCalendar ? colorDot : "#e5e7eb" }}
                    />
                    <div
                      ref={(el) => (titleRefs.current[doc.id] = el)}
                      className={`text-[15px] leading-snug text-black font-bold ${
                        isExpanded ? "" : "line-clamp-4"
                      }`}
                    >
                      {doc.title || doc.name || "Untitled"}
                    </div>
                  </div>

                  {/* Right: badges (no absolute; allow wrap) */}
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
                  {/* creator chip (docs on fetching below) */}
                  {doc.creator && (
                    <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-[2px] border">
                      {doc.creator.username
                        ? `@${doc.creator.username}`
                        : (doc.creator.first_name || "Unknown")}
                    </span>
                  )}

                  {isOnCalendar ? (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-[2px] border border-blue-100">
                        <CalendarIcon size={12} />
                        {isAllDay
                          ? (start ? start.format("MMM D, YYYY") : "All day")
                          : (start
                              ? `${start.format("MMM D, YYYY h:mm A")}${
                                  end ? ` – ${end.format("h:mm A")}` : ""
                                }`
                              : "Scheduled")}
                      </span>
                      {doc.calendar_status && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-[2px] border">
                          {doc.calendar_status}
                        </span>
                      )}
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
                    className={`text-sm mt-2 text-gray-800 ${isExpanded ? "" : "line-clamp-5"}`}
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
                    {isExpanded ? "Show less" : "Show more"}
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
                    <div>Last modified: {dayjs(doc.updated_at).format("MMM D, YYYY h:mm A")}</div>
                  )}
                  <div>Uploaded: {dayjs(doc.created_at).format("MMM D, YYYY h:mm A")}</div>
                  <div>{doc.creator && (
                      <span> {doc.creator.username ? `@${doc.creator.username}` : (doc.creator.first_name || 'Unknown')} </span>
                    )}
                  </div>
                  {hasFiles && <div className="text-red-600 font-semibold">-Contains file-</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite Button for Admins/Owner */}
      {(userRole === "admin" || userRole === "owner") && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => setShowInviteModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-full shadow-md text-sm font-semibold"
          >
            + Invite Member
          </button>
        </div>
      )}
      {/* Invite Modal */}
      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          workspaceId={activeWorkspaceId}
        />
      )}

      {/* Workspace Settings Modal */}
      <WorkspaceSettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        userRole={userRole}
        workspaceName={workspaceName}
        setWorkspaceName={setWorkspaceName}
        handleRename={handleRename}
        errorMsg={workspaceActionErrorMsg}
        loading={workspaceActionLoading}
        successMsg={workspaceActionSuccessMsg}
        members={members}
        setMembers={setMembers}
        handleRoleChange={handleRoleChange}
        onDelete={handleConfirmDelete}
        onVerifyVaultCode={verifyWorkspaceCode}
      />
      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        open={showCreateWorkspaceModal}
        onClose={() => setShowCreateWorkspaceModal(false)}
        onCreated={(newWs) => {
          setWorkspaceList((prev) => [...prev, { id: newWs.id, name: newWs.name, sort_order: prev.length }]);
          setActiveWorkspaceId(newWs.id);
        }}
      />
    </Layout>
  );
}