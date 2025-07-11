import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Search, ChevronDown, XCircle } from "lucide-react";
import Layout from "../Layout/Layout";
import dayjs from "dayjs";
import { supabase } from "../../lib/supabaseClient";

export default function VaultedDocuments() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [allDocuments, setAllDocuments] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [tagSearchTerm, setTagSearchTerm] = useState("");

  const tagBoxRef = useRef();

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

  useEffect(() => {
    const fetchDocs = async () => {
      const { data, error } = await supabase
        .from("vaulted_documents")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: notes, error: noteError } = await supabase
        .from("vaulted_notes")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && !noteError) {
        const merged = [...data, ...notes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setAllDocuments(merged);
        const tags = Array.from(new Set(merged.flatMap((doc) => doc.tags || [])));
        setAllTags(tags);
      }
    };

    fetchDocs();
  }, []);

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
      <div className="p-6 max-w-5xl mx-auto">
        {/* Buttons Row */}
        <div className="flex justify-end gap-2 mb-4">
          <button
            onClick={() => navigate("/private/vaults/file-upload")}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
          >
            + Upload Document
          </button>
          <button
            onClick={() => navigate("/private/vaults/note-upload")}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
          >
            + Create Note
          </button>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-purple-800 mb-4">🔐 Your Vaulted Documents</h2>

        {/* Search and Tag Filters */}
        <div className="flex flex-wrap md:flex-nowrap justify-between items-start gap-4 mb-6">

          {/* Search Bar */}
          <div className="relative w-full md:w-1/2">
            <Search className="absolute left-3 top-3 text-purple-400" size={18} />

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
                className="absolute right-2 top-2 text-gray-400 hover:text-red-500"
              >
                ✕
              </button>
            )}
          </div>

          {/* Tag Toggle Button */}
          <div className="relative w-full md:w-1/2" ref={tagBoxRef}>
            <button
              onClick={() => setShowTagFilter(!showTagFilter)}
              className="w-full flex items-center justify-between px-4 py-2 border border-gray-300 rounded-lg text-gray-500 bg-white shadow-sm hover:border-purple-400"
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
                  className="w-full p-2 mb-2 border border-gray-300 rounded text-sm text-gray-700"
                />
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
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              onClick={() => navigate(doc.file_urls ? doc.file_urls : `/private/vaults/note/${doc.id}`)}
              className="cursor-pointer bg-white border border-gray-200 rounded-xl shadow-md p-4 hover:shadow-lg transition"
            >
              <div className="flex items-center gap-3 mb-3">
                <FileText className="text-purple-500" size={22} />
                <div className="text-lg text-gray-700 font-semibold truncate">
                  {doc.title || doc.name || "Untitled"}
                </div>
              </div>

              {doc.tags?.length > 0 && (
                <div className="mb-2 text-sm text-gray-600">
                  <strong>Tags:</strong> {doc.tags.join(", ")}
                </div>
              )}

              {doc.notes && (
                <p className="text-sm text-gray-600 mb-2">{doc.notes}</p>
              )}

              {doc.updated_at !== doc.created_at && (
                <div className="text-xs text-gray-400 mb-1">
                  <strong>Last Modified:</strong>{" "}
                  {dayjs(doc.updated_at).format("MMM D, YYYY h:mm A")}
                </div>
              )}

              <div className="text-xs text-gray-400">
                <strong>Uploaded:</strong>{" "}
                {dayjs(doc.created_at).format("MMM D, YYYY h:mm A")}
              </div>
              {doc.file_urls && (
                <div className="text-xs text-red-500 font-semibold mt-2">Contains File</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}