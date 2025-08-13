import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Search, ChevronDown, Lock } from "lucide-react";
import Layout from "@/components/Layout/Layout";
import WorkspaceTabs from "@/components/Layout/WorkspaceTabs"; 
import dayjs from "dayjs";
import { supabase } from "@/lib/supabaseClient";
import CreatePrivateSpaceModal from "@/components/common/CreatePrivateSpaceModal";

export default function PrivateDocList() {
  const navigate = useNavigate();

  // ---------- filters/search ----------
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [tagSearchTerm, setTagSearchTerm] = useState("");

  // ---------- spaces & active selection ----------
  const [spaces, setSpaces] = useState([]);
  const [activeSpaceId, setActiveSpaceId] = useState(null);
  const [spaceName, setSpaceName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // reorder UI (drag in tabs)
  const spacesForUI = useMemo(
    () => spaces.map((s) => ({ id: s.id, name: s.name })),
    [spaces]
  );
  // reorder handler from Tabs
  const handleReorder = async (newList) => {
    setSpaces(newList); // optimistic
    // persist sort_order
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

  // Toggle expand/collapse for a card
  const toggleExpand = (e, id) => {
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtered docs
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

  // Measure overflow for title and notes separately
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

  // Fetch all private spaces the user owns
  useEffect(() => {
    (async () => {
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("private_spaces")
        .select("id, name, sort_order")
        .eq("created_by", user.id)
        .order("sort_order", { ascending: true });

      if (!error) {
        setSpaces(data ?? []);
        if (!activeSpaceId && data?.length) setActiveSpaceId(data[0].id);
      }
    })();
  }, []);

  // Fetch active space name when activeSpaceId changes
  useEffect(() => {
    if (!activeSpaceId) {
      setSpaceName("");
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("private_spaces")
        .select("name")
        .eq("id", activeSpaceId)
        .single();

      setSpaceName(error ? "" : data?.name ?? "");
    })();
  }, [activeSpaceId]);

  // Fetch documents for active private space
  useEffect(() => {
    if (!activeSpaceId) return;
    (async () => {
      const { data, error } = await supabase
        .from("private_vault_items")
        .select("*")
        .eq("private_space_id", activeSpaceId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Failed to fetch private docs:", error);
        return;
      }
      setAllDocuments(data || []);
      setAllTags(Array.from(new Set((data || []).flatMap((d) => d.tags || []))));
      setExpanded({}); // reset expansion when switching spaces
    })();
  }, [activeSpaceId]);

  // Close tag filter when clicking outside
  useEffect(() => {
    const onDown = (e) => {
      if (tagBoxRef.current && !tagBoxRef.current.contains(e.target)) {
        setShowTagFilter(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <Layout noGutters>
      {/* Tabs bar (reusing WorkspaceTabs UI) */}
      <WorkspaceTabs
        workspaces={spacesForUI}
        activeId={activeSpaceId}
        onSelect={(id) => setActiveSpaceId(id)}
        onSettingsClick={() => navigate(`/privatespace/settings/${activeSpaceId}`)}
        onCreateClick={() => setShowCreateModal(true)}
        onReorder={handleReorder}
      />

      <div className="p-6 max-w-5xl mx-auto text-sm">
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
        <h2 className="text-xl font-bold text-gray-900 mb-4">{spaceName}</h2>

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
              <div className="absolute z-30 mt-2 w-full max-h-60 bg-white border border-gray-300 rounded-lg shadow p-3 text-gray-700">
                <input
                  type="text"
                  placeholder="Filter tags..."
                  value={tagSearchTerm}
                  onChange={(e) => setTagSearchTerm(e.target.value)}
                  className="w-full p-2 mb-2 border border-gray-300 rounded text-sm text-gray-700 hover:border-gray-500"
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
            const hasFiles = Array.isArray(doc.file_metas) && doc.file_metas.length > 0;
            const isVaulted = !!doc.is_vaulted;
            const isExpanded = !!expanded[doc.id];
            const canShowMore = (titleOverflow[doc.id] || noteOverflow[doc.id]) && (doc.title || doc.notes);

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
                  <div
                    ref={(el) => (titleRefs.current[doc.id] = el)}
                    className={`text-md text-black font-extrabold ${isExpanded ? "" : "line-clamp-5"}`}
                  >
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
                {doc.notes && (
                  <p
                    ref={(el) => (noteRefs.current[doc.id] = el)}
                    className={`text-sm text-gray-800 mb-2 ${isExpanded ? "" : "line-clamp-5"}`}
                  >
                    {doc.notes}
                  </p>
                )}

                {/* Show more / less (only if one of them overflows) */}
                {canShowMore && (
                  <button
                    onClick={(e) => toggleExpand(e, doc.id)}
                    className="mt-1 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-gray-300 text-gray-700 hover:border-purple-500 hover:text-purple-600 transition mb-2 font-semibold"
                  >
                    {isExpanded ? "Show less" : "Show more"}
                  </button>
                )}

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

      {/* Create Private Space Modal */}
      <CreatePrivateSpaceModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(ps) => {
          // add new space and activate it
          setSpaces((prev) => {
            const next = [...prev, { id: ps.id, name: ps.name, sort_order: prev.length }];
            return next;
          });
          setActiveSpaceId(ps.id);
        }}
      />
    </Layout>
  );
}