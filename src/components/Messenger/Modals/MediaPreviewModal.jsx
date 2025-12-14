import React, { useMemo, useState } from "react";

export default function MediaPreviewModal({
  onClose,
  attachment, // { file?, url?, name?, type?, size? }
  onConfirm,
}) {
  const [caption, setCaption] = useState("");

  // ---- Determine attachment "kind" (image / video / file) ----
  const kind = useMemo(() => {
    if (!attachment) return "file";

    // Prefer explicit type on attachment or file MIME type
    const mime =
      (typeof attachment.type === "string" && attachment.type) ||
      attachment.file?.type ||
      "";

    const mimeLower = mime.toLowerCase();

    if (mimeLower.startsWith("image/")) return "image";
    if (mimeLower.startsWith("video/")) return "video";

    // Fallback: infer from filename extension
    const name = attachment.name || attachment.file?.name || "";
    const ext = name.split(".").pop()?.toLowerCase();

    if (ext) {
      if (["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(ext)) {
        return "image";
      }
      if (["mp4", "webm", "mov", "mkv"].includes(ext)) {
        return "video";
      }
    }

    return "file";
  }, [attachment]);

  if (!attachment) return null;

  const displayName =
    attachment.name || attachment.file?.name || "Attachment";

  const humanSize = useMemo(() => {
    const size = attachment.size ?? attachment.file?.size;
    if (!size) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }, [attachment]);

  const handleSend = () => {
    if (!onConfirm) return;
    onConfirm({
      caption: caption.trim() || null,
      file: attachment.file ?? null,
      rawAttachment: attachment,
    });
  };

  const previewUrl =
    attachment.url ||
    (attachment.file ? URL.createObjectURL(attachment.file) : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative flex w-full max-w-3xl flex-col gap-4 rounded-2xl bg-slate-950/95 p-4 text-slate-50 shadow-2xl border border-slate-800">
        <button
          className="absolute right-3 top-3 text-sm text-slate-400 hover:text-slate-100"
          onClick={onClose}
        >
          ✕
        </button>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-semibold">{displayName}</span>
            <span className="text-[11px] text-slate-400">
              {kind === "image"
                ? "Image attachment"
                : kind === "video"
                ? "Video attachment"
                : "File attachment"}
              {humanSize && ` · ${humanSize}`}
            </span>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Preview area */}
          <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/60 p-2 flex items-center justify-center">
            {kind === "image" && previewUrl ? (
              <img
                src={previewUrl}
                alt={displayName}
                className="max-h-[320px] w-auto rounded-lg object-contain"
              />
            ) : kind === "video" && previewUrl ? (
              <video
                src={previewUrl}
                controls
                className="max-h-[320px] w-full rounded-lg bg-black"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-xs text-slate-300">
                <div className="mb-1 rounded-full bg-slate-800/70 px-3 py-1 text-[11px]">
                  {kind.toUpperCase()}
                </div>
                <p className="text-center text-[11px] text-slate-400">
                  No inline preview available. This file will be sent as a downloadable attachment.
                </p>
              </div>
            )}
          </div>

          {/* Caption + actions */}
          <div className="w-64 flex flex-col">
            <label className="mb-1 block text-[11px] font-medium text-slate-300">
              Add a message (optional)
            </label>
            <textarea
              className="min-h-[96px] w-full flex-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-50 placeholder:text-slate-500"
              placeholder="Say something about this attachment…"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-700 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800/80"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                className="rounded-md bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Send attachment
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
