import React, { useState, useRef, useCallback } from "react";
import { Paperclip, Send } from "lucide-react";
import MediaPreviewModal from "../Modals/MediaPreviewModal";
import { sanitizeMessage } from "../../../utils/sanitizeMessage";

export default function ChatInput({
  chatId,
  onSendText,
  onSendAttachment,
}) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fileInputRef = useRef(null);

  const [attachmentDraft, setAttachmentDraft] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isSendingAttachment, setIsSendingAttachment] = useState(false);

  const disabled = !chatId || isSending || isSendingAttachment;

  // ---------- TEXT MESSAGE ----------
  const handleSendText = useCallback(async () => {
    const raw = text.trim();
    if (!raw || !chatId || !onSendText) return;

    const cleaned = sanitizeMessage ? sanitizeMessage(raw) : raw;

    setIsSending(true);
    setErrorMsg("");

    try {
      await onSendText(cleaned);
      setText("");
    } catch (err) {
      console.error("❌ onSendText failed:", err);
      setErrorMsg("Message failed to send. Please try again.");
    } finally {
      setIsSending(false);
    }
  }, [text, chatId, onSendText]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) handleSendText();
    }
  };

  // ---------- ATTACHMENT PICK ----------
  const handleAttachmentClick = () => {
    if (!chatId) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAttachmentDraft({
      file,
      name: file.name,
      size: file.size,
      type: file.type,
    });
    setShowPreview(true);
    e.target.value = "";
  };

  // ---------- ATTACHMENT SEND ----------
  const handleConfirmAttachment = async ({ caption }) => {
    if (!attachmentDraft || !chatId || !onSendAttachment) {
      setShowPreview(false);
      setAttachmentDraft(null);
      return;
    }

    setIsSendingAttachment(true);
    setErrorMsg("");

    try {
      await onSendAttachment({
        file: attachmentDraft.file,
        caption: caption || null,
      });

      setAttachmentDraft(null);
      setShowPreview(false);
    } catch (err) {
      console.error("❌ onSendAttachment failed:", err);
      setErrorMsg("Attachment failed to send. Please try again.");
    } finally {
      setIsSendingAttachment(false);
    }
  };

  const handleCancelPreview = () => {
    setShowPreview(false);
    setAttachmentDraft(null);
  };

  return (
    <>
      {/* MAIN INPUT BAR */}
      <div className="border-t border-slate-800 bg-slate-950/90 px-3 py-2">
        {errorMsg && (
          <div className="mb-1 text-[11px] text-red-400">{errorMsg}</div>
        )}

        <div className="flex items-end gap-2">
          {/* Left: icons */}
          <div className="flex flex-col gap-1.5 pb-0.5">
            <button
              type="button"
              onClick={handleAttachmentClick}
              disabled={!chatId}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800 hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Attach file"
            >
              <Paperclip size={14} />
            </button>
          </div>

          {/* Middle: text area */}
          <div className="flex-1">
            <div
              className={`
                flex items-center rounded-2xl border px-3 py-1.5
                bg-slate-900/70 border-slate-700
                focus-within:border-emerald-500/80
              `}
            >
              <textarea
                rows={1}
                className="max-h-24 flex-1 resize-none bg-transparent text-xs text-slate-50 outline-none placeholder:text-slate-500"
                placeholder={
                  chatId
                    ? "Message this chat…"
                    : "Select or start a chat to send a message…"
                }
                value={text}
                disabled={disabled}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
              <span>Press Enter to send · Shift+Enter for new line</span>
              {isSendingAttachment && <span>Uploading attachment…</span>}
            </div>
          </div>

          {/* Right: send */}
          <div className="pb-0.5">
            <button
              type="button"
              onClick={handleSendText}
              disabled={disabled || !text.trim()}
              className={`
                inline-flex h-9 w-9 items-center justify-center rounded-full
                bg-emerald-500 text-slate-950
                hover:bg-emerald-400
                disabled:opacity-40 disabled:cursor-not-allowed
              `}
            >
              {isSending ? (
                <svg
                  className="h-4 w-4 animate-spin text-slate-950"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  ></path>
                </svg>
              ) : (
                <Send size={15} />
              )}
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* MEDIA PREVIEW MODAL */}
      {showPreview && attachmentDraft && (
        <MediaPreviewModal
          attachment={attachmentDraft}
          onClose={handleCancelPreview}
          onConfirm={handleConfirmAttachment}
        />
      )}
    </>
  );
}
