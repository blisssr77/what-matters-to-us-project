import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { ArrowLeft } from "lucide-react";

export default function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState(null);

  useEffect(() => {
    const fetchNote = async () => {
      const { data, error } = await supabase
        .from("vaulted_notes")
        .select("*")
        .eq("id", id)
        .single();

      if (!error) setNote(data);
    };

    fetchNote();
  }, [id]);

  if (!note) return <p className="text-center text-gray-500 mt-10">Loading note...</p>;

  return (
    <div className="max-w-3xl mx-auto p-6 mt-10 bg-gradient-to-br from-gray-900 to-gray-950 text-white rounded-xl shadow-xl border border-gray-800">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-purple-400">📝 {note.title}</h2>
        <ArrowLeft
          onClick={() => navigate("/private/vaults")}
          className="cursor-pointer text-gray-400 hover:text-purple-400"
        />
      </div>
      <div className="whitespace-pre-wrap leading-relaxed text-gray-200 bg-black/20 p-4 rounded">
        {note.private_note}
      </div>

      {note.tags?.length > 0 && (
        <div className="mt-6">
          <strong className="text-sm text-purple-300">Tags:</strong>{" "}
          <span className="text-sm text-gray-300">{note.tags.join(", ")}</span>
        </div>
      )}
    </div>
  );
}
