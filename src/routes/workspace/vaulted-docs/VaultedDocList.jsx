import React from "react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Search, ChevronDown, XCircle } from "lucide-react";
import Layout from "../../../components/Layout/Layout";
import dayjs from "dayjs";
import { supabase } from "../../../lib/supabaseClient";
import { useWorkspaceStore } from "../../../hooks/useWorkspaceStore";
import { useUserRole } from "../../../hooks/useUserRole";
import WorkspaceSelector from "../../../components/Workspace/WorkspaceDocs/WorkspaceSelectorMaybeNoNeed";


export default function WorkspaceVaultList() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [allDocuments, setAllDocuments] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [tagSearchTerm, setTagSearchTerm] = useState("");

  const tagBoxRef = useRef();
  const { activeWorkspaceId } = useWorkspaceStore();

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
      <div className="p-6 max-w-5xl mx-auto text-sm">
        {/* Buttons Row */}
        <div className="flex justify-end gap-2 mb-4">
          {/* Workspace Selector */}
          <div className="mb-4">
            <WorkspaceSelector />
          </div>

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
        <h2 className="text-2xl font-bold text-gray-900 mb-4">🔐 My Vaulted Documents</h2>

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
              className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-800 focus:outline-none focus:ring-0 focus:ring-gray-500"
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
              className="w-full flex items-center justify-between px-4 py-2 border border-gray-300 rounded-lg text-gray-400 bg-white shadow-sm focus:outline-none focus:ring-0 focus:ring-gray-500"
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
                  className="w-full p-2 mb-2 border border-gray-300 rounded text-sm text-gray-800"
                />

                {/* Display filtered tags */}
                <div className="max-h-40 overflow-y-auto">
                  {allTags
                    .filter((tag) => tag.toLowerCase().includes(tagSearchTerm.toLowerCase()))
                    .map((tag) => (
                      <div
                        key={tag}
                        onClick={() => {
                          setSelectedTag(tag);
                          setShowTagFilter(false);
                        }}
                        className={`cursor-pointer px-3 py-1 rounded text-sm mb-1 ${
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
                    className="mt-2 text-xs text-red-500 underline"
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

            return (
              <div
                key={doc.id}
                onClick={() =>
                  navigate(
                    hasFiles
                      ? `/workspace/vaults/doc-view/${doc.id}` // 🔐 Encrypted document
                      : `/workspace/vaults/note-view/${doc.id}`
                  )
                }
                className="cursor-pointer bg-white border border-gray-200 rounded-xl shadow-md p-4 hover:shadow-lg transition"
              >
                <div className="flex items-center gap-3 mb-3">
                  <FileText className="text-purple-500" size={22} />
                  <div className="text-lg text-gray-800 font-semibold truncate">
                    {doc.title || doc.name || "Untitled"}
                  </div>
                </div>

                {doc.tags?.length > 0 && (
                  <div className="mb-2 text-xs text-gray-800">
                    Tags:{" "}
                    {/* Map over each tag to apply individual styling */}
                    {doc.tags.map((tag, index) => (
                      <React.Fragment key={tag}> 
                        <span className="bg-yellow-50 px-1 rounded">
                          {tag}
                        </span>
                        {/* Add a comma and space after each tag, except the last one */}
                        {index < doc.tags.length - 1 && ", "}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {doc.notes && (
                  <p className="text-sm text-gray-800 mb-2">{doc.notes}</p>
                )}

                {doc.updated_at && doc.updated_at !== doc.created_at && (
                  <div className="text-xs text-gray-400 mb-1">
                    Last Modified:{" "}
                    {dayjs(doc.updated_at).format("MMM D, YYYY h:mm A")}
                  </div>
                )}

                <div className="text-xs text-gray-400">
                  Uploaded:{" "}
                  {dayjs(doc.created_at).format("MMM D, YYYY h:mm A")}
                </div>

                {hasFiles && (
                  <div className="text-xs text-red-500 font-semibold mt-2">
                    - Contains file -
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}