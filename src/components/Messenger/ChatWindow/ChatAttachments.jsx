import React, { useRef } from "react";
import { Paperclip } from "lucide-react";

export default function ChatAttachments({ onFileSelected, disabled }) {
  const inputRef = useRef(null);

  const handleClick = () => {
    if (disabled) return;
    if (inputRef.current) inputRef.current.click();
  };

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file && onFileSelected) {
      onFileSelected(file);
    }
    // reset input so selecting the same file again still fires change
    e.target.value = "";
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 text-xs disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        <Paperclip size={16} />
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}