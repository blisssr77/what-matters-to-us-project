import React from "react";
import { useState, useEffect, useRef, Select } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Search, ChevronDown, XCircle, Lock, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import Layout from "../../../components/Layout/Layout";
import dayjs from "dayjs";
import { supabase } from "../../../lib/supabaseClient";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import { useUserRole } from "../../../hooks/useUserRole";
import WorkspaceSelector from "../../../components/Workspace/WorkspaceDocs/WorkspaceSelector";
import InviteModal from "../../../components/common/InviteModal";
import WorkspaceTabs from "@/components/Layout/WorkspaceTabs";
import WorkspaceSettingsModal from "@/components/common/WorkspaceSettingsModal";
import { useWorkspaceActions } from "../../../hooks/useWorkspaceActions";

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
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();
  const userRole = useUserRole(activeWorkspaceId);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    handleRename,
    handleRoleChange,
    workspaceActionLoading,
    workspaceActionErrorMsg,
  } = useWorkspaceActions({
    activeWorkspaceId,
    workspaceName,
    setWorkspaceName,
    setMembers,
  });


  const tagBoxRef = useRef();

  // Fetch all workspaces on component mount
  useEffect(() => {
    const fetchAllWorkspaces = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, workspaces(name, id)")
        .eq("user_id", user.id);
        console.log("Fetched workspaces:", data);

      if (error) {
        console.error("❌ Failed to fetch user workspaces", error);
        return;
      }

      // Flatten nested data
      const workspaceData = data.map((entry) => ({
        id: entry.workspaces.id,
        name: entry.workspaces.name,
      }));

      setWorkspaceList(workspaceData);
    };

    fetchAllWorkspaces();
  }, []);

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

  // Filter documents based on search term and selected tag
  const filteredDocs = allDocuments.filter((doc) => {
    const matchesSearch =
      doc.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.tags?.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTag = selectedTag ? doc.tags?.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  return (
    <Layout>
      {/* Header with Settings Icon */}
      <>
      <WorkspaceTabs
        workspaces={workspaceList}
        activeId={activeWorkspaceId}
        onSelect={(id) => setActiveWorkspaceId(id)}
        onSettingsClick={() => setSettingsModalOpen(true)} 
      />

      {/* <Button onClick={() => setSettingsModalOpen(true)}>
        <Settings className="w-4 h-4 mr-1" /> Settings
      </Button> */}
    </>
      
      
      <div className="p-6 max-w-5xl mx-auto text-sm">
        {/* Buttons Row */}
        <div className="flex justify-end gap-2 mb-4">
          {/* Workspace Selector */}
          <select
            className="bg-white border border-gray-300 rounded px-3 py-2 text-sm"
            value={activeWorkspaceId}
            onChange={(e) => setActiveWorkspaceId(e.target.value)}
          >
            {workspaceList.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>


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
        <h2 className="text-xl font-bold text-gray-900 mb-4">{workspaceName}</h2>

        {/* Search and Tag Filters */}
        <div className="flex flex-wrap md:flex-nowrap justify-between items-start gap-4 mb-6">

          {/* Search Bar */}
          <div className="relative w-full md:w-1/2"> 
            <Search className="absolute left-3 top-3 text-purple-600" size={18} />

            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
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
              className="w-full flex items-center justify-between px-4 py-2 border border-gray-300 rounded-lg text-gray-400 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {selectedTag ? `Tag: ${selectedTag}` : "Search by Tag"}
              <ChevronDown className="ml-2 text-gray-400" size={18} />
            </button>

            {/* Tag Filter Dropdown */}
            {showTagFilter && (
              <div className="absolute z-30 mt-2 w-full max-h-60 bg-white border border-gray-300 rounded-lg shadow p-3 text-gray-700">
                <input
                  type="text"
                  placeholder="Filter tags..."
                  value={tagSearchTerm}
                  onChange={(e) => setTagSearchTerm(e.target.value)}
                  className="w-full p-2 mb-2 border border-gray-300 rounded text-sm text-gray-700"
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
                        className={`cursor-pointer px-3 py-1 rounded text-sm ${
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

        {/* Vaulted Document Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredDocs.map((doc) => {
            const hasFiles = Array.isArray(doc.file_metas) && doc.file_metas.length > 0;
            const isVaulted = !!doc.is_vaulted;

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
                className={`relative cursor-pointer rounded-xl shadow-md p-4 hover:shadow-lg transition border hover:border-purple-700 ${
                  isVaulted ? "bg-gray-200 border-gray-300" : "bg-white border-purple-200"
                }`}
              >
                {/* Title + Icon */}
                <div className="flex items-center gap-3 mb-3">
                  {isVaulted ? (
                    <Lock className="text-purple-600" size={22} />
                  ) : (
                    <FileText className="text-purple-500" size={22} />
                  )}
                  <div className="text-md text-black font-extrabold truncate">
                    {doc.title || doc.name || "Untitled"}
                  </div>
                </div>

                {/* Tags */}
                {doc.tags?.length > 0 && (
                  <div className="mb-2 text-xs text-gray-800">
                    <strong>Tags:</strong>{" "}
                    {doc.tags.map((tag, index) => (
                      <React.Fragment key={tag}>
                        <span className="bg-yellow-50 px-1 rounded">{tag}</span>
                        {index < doc.tags.length - 1 && ", "}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {/* Public Note */}
                {doc.notes && <p className="text-sm text-gray-800 mb-2">{doc.notes}</p>}

                {/* Timestamps */}
                {doc.updated_at && doc.updated_at !== doc.created_at && (
                  <div className="text-xs text-gray-500 mb-1">
                    <strong>Last Modified:</strong>{" "}
                    {dayjs(doc.updated_at).format("MMM D, YYYY h:mm A")}
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  <strong>Uploaded:</strong>{" "}
                  {dayjs(doc.created_at).format("MMM D, YYYY h:mm A")}
                </div>

                {/* File Flag */}
                {hasFiles && (
                  <div className="text-xs text-red-600 font-semibold mt-2">
                    - Contains file -
                  </div>
                )}

                {/* Vaulted Label */}
                {isVaulted && (
                  <div className="absolute top-2 right-2 text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full shadow-sm">
                    Vaulted
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Workspace Members Section */}
      {members.length === 0 ? (
        <div className="text-sm text-gray-400">No members found in this workspace.</div>
      ) : (
        members.map((m) => (
          <div key={m.id} className="flex justify-between border p-3 rounded-lg shadow-sm bg-white">
            <div className="font-medium text-gray-800">{m.profiles?.username || "Unknown User"}</div>
            <div className="text-sm text-gray-500">{m.role}</div>
            <div className="text-xs text-gray-400">Invited by {m.invited_by_name}</div>
          </div>
        ))
      )}

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

      <WorkspaceSettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        userRole={userRole}
        workspaceName={workspaceName}
        setWorkspaceName={setWorkspaceName}
        handleRename={handleRename}
        errorMsg={workspaceActionErrorMsg}
        loading={workspaceActionLoading}
        members={members}
        handleRoleChange={handleRoleChange}
      />
    </Layout>
  );
}