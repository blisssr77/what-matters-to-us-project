import { useState, useMemo } from "react";
import { GitMerge, X } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

/**
 * Merge one workspace tag (source) into another (target).
 *
 * Props:
 * - workspaceId: string (uuid)
 * - selectedTagId: string | null  // the "from" tag; require exactly one selected
 * - tags: Array<{ id, name, slug, usage_count?: number }>
 * - onMerged: () => void          // refresh list, clear selection
 */
export default function MergeTagsButton({
  workspaceId,
  selectedTagId,
  tags = [],
  onMerged,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const src = useMemo(() => tags.find(t => t.id === selectedTagId) || null, [tags, selectedTagId]);
  const candidates = useMemo(
    () => tags.filter(t => t.id !== selectedTagId).sort((a,b) => a.name.localeCompare(b.name)),
    [tags, selectedTagId]
  );

  const disabled = !src || candidates.length === 0;

  const openModal = () => {
    if (disabled) return;
    setTargetId(candidates[0]?.id || "");
    setErr("");
    setOpen(true);
  };

  const closeModal = () => {
    if (loading) return;
    setOpen(false);
    setTargetId("");
    setErr("");
  };

  const handleMerge = async () => {
    if (!workspaceId || !src?.id || !targetId) return;
    setLoading(true);
    setErr("");

    const { error } = await supabase.rpc("merge_workspace_tags", {
      p_workspace: workspaceId,
      p_from_id: src.id,
      p_to_id: targetId,
    });

    setLoading(false);

    if (error) {
      setErr(error.message || "Merge failed.");
      return;
    }

    // done
    closeModal();
    onMerged?.();
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={disabled}
        className={clsx(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm border",
          disabled
            ? "opacity-50 cursor-not-allowed bg-gray-100 text-gray-300 border-gray-200"
            : "bg-white hover:bg-gray-50 text-gray-700 border-gray-300",
          className
        )}
        title={disabled ? "Select exactly one tag to merge" : "Merge tag into another"}
      >
        <GitMerge size={16} />
        Merge
      </button>

      {!open ? null : (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-bold text-gray-800">Merge tag</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="px-4 py-3 space-y-3 text-sm">
              <div className="text-gray-700">
                This will move all usages of <b>{src?.name}</b>
                {typeof src?.usage_count === "number" ? (
                  <> (<span className="text-gray-500">{src.usage_count}</span> docs)</>
                ) : null}
                {" "}into another tag, then delete <b>{src?.name}</b>.
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs text-gray-500">Merge into</label>
                <select
                  className="border rounded px-2 py-1.5 text-sm bg-white"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                >
                  {candidates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{typeof t.usage_count === "number" ? ` (${t.usage_count})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {err ? <div className="text-xs text-red-600">{err}</div> : null}
              <div className="text-xs text-amber-600">
                Only workspace admins can merge tags. This action cannot be undone.
              </div>
            </div>

            <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
              <button
                onClick={closeModal}
                className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={loading || !targetId}
                className={clsx(
                  "px-3 py-1.5 rounded text-sm btn-2ndOnlyColor",
                  loading ? "bg-indigo-300" : "bg-indigo-600 hover:bg-indigo-700"
                )}
              >
                {loading ? "Merging…" : "Merge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
