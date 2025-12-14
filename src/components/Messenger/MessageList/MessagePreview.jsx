import React from "react";
import { formatMessageClock } from "../../../utils/formatMessageTime";
import { sanitizeMessage } from "../../../utils/sanitizeMessage";

export default function MessagePreview({ lastMessage }) {
  if (!lastMessage) {
    return (
      <p className="text-[11px] text-slate-500 italic truncate">
        No messages yet – say hi 👋
      </p>
    );
  }

  const text =
    lastMessage.message_text ||
    (lastMessage.message_type === "image"
      ? "[Image]"
      : lastMessage.message_type === "video"
      ? "[Video]"
      : lastMessage.message_type === "file"
      ? "[File]"
      : lastMessage.message_type === "invite"
      ? "[Workspace invite]"
      : "[Message]");

  const safeText = sanitizeMessage(text || "");

  return (
    <div className="flex items-center justify-between gap-2">
      <p className="flex-1 text-[11px] text-slate-500 truncate">
        {safeText}
      </p>
      <span className="shrink-0 text-[10px] text-slate-500 tabular-nums">
        {formatMessageClock(lastMessage.created_at)}
      </span>
    </div>
  );
}
