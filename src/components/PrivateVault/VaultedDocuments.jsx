import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { FileText, Trash } from "lucide-react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

export default function VaultedDocuments() {
  const [documents, setDocuments] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("vaulted_documents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error) setDocuments(data);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-purple-500 mb-6">🔐 Your Vaulted Documents</h2>

        <div className="mb-6 flex justify-end">
            <button
                onClick={() => navigate("/private/vaults/file-upload")}
                className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
            >
                + Upload Document
            </button>
        </div>

        //
        <div className="p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Vaulted Documents</h2>
                <button
                onClick={() => navigate("/private/vaults/note-upload")}
                className="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                >
                + Create Note
                </button>
            </div>

            {/* Existing Vaulted Document Grid or List */}
            {/* ... */}
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="bg-white border border-gray-200 rounded-xl shadow-md p-4 flex flex-col justify-between hover:shadow-lg transition"
          >
            <div className="flex items-center gap-3 mb-3">
              <FileText className="text-purple-500" size={22} />
              <div className="text-lg font-semibold">{doc.name}</div>
            </div>

            {doc.tags && doc.tags.length > 0 && (
              <div className="mb-2 text-sm text-gray-600">
                <strong>Tags:</strong> {doc.tags.join(", ")}
              </div>
            )}

            {doc.notes && (
              <p className="text-sm text-gray-600 mb-2">{doc.notes}</p>
            )}

            <div className="text-xs text-gray-400 mb-3">
              Uploaded: {dayjs(doc.created_at).format("MMM D, YYYY h:mm A")}
            </div>

            <div className="flex justify-between items-center mt-auto">
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
              >
                View File
              </a>
              {/* Future: Delete button
              <button className="text-red-500 hover:text-red-600 transition">
                <Trash size={18} />
              </button> */}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
