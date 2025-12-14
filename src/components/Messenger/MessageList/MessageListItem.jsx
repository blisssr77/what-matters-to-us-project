import React, { useMemo } from "react";
import { Circle } from "lucide-react";
import { formatMessagePreviewTime } from "../../../utils/formatMessageTime";

export default function MessageListItem({
  chat,
  chatId: propChatId,
  lastMessage,
  isActive,
  onClick,
  mode, // "direct" or "workspace"
}) {
  if (!chat) return null;

  const chatId = propChatId || chat.chat_id || chat.id;

  const isDirect = chat.chat_type === "direct";
  const isWorkspace = chat.chat_type === "workspace";

  const unreadCount = chat.unread_count || 0;

  // For direct chats: always try to show the *other person's* username
  const title = useMemo(() => {
    if (isDirect) {
      return (
        chat.other_user_name ||
        chat.other_user_username ||
        chat.other_user_email ||
        chat.title ||
        "Direct message"
      );
    }

    // Workspace or other chat types
    return (
      chat.workspace_name ||
      chat.title ||
      chat.display_name ||
      "Conversation"
    );
  }, [chat, isDirect]);

  const initials = useMemo(() => {
    if (!title) return "?";
    return title
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  }, [title]);

  // Last message preview
  const previewText = useMemo(() => {
    if (!lastMessage) return "No messages yet.";

    const type = lastMessage.message_type || "text";
    if (type === "text") {
      const raw = lastMessage.message_text || "";
      return raw.length > 80 ? raw.slice(0, 77) + "…" : raw;
    }
    if (type === "image") return "[Image]";
    if (type === "video") return "[Video]";
    if (type === "file") return "[File]";
    if (type === "invite") return "[Workspace invite]";
    if (type === "system") return lastMessage.message_text || "[System]";
    return "[Message]";
  }, [lastMessage]);

  // Time label
  const timeLabel = useMemo(() => {
    const ts =
      lastMessage?.created_at ||
      chat.last_message_at ||
      chat.updated_at ||
      chat.created_at ||
      null;

    if (!ts) return "";
    return formatMessagePreviewTime(ts);
  }, [lastMessage, chat]);

  console.log(`Chat ${title}: unread_count is`, chat.unread_count);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
        isActive
          ? "bg-slate-900/80 border border-slate-700"
          : "hover:bg-slate-900/60 border border-transparent"
      }`}
    >
      {/* Avatar / initials */}
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-slate-50">
        {initials}
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-slate-50">
            {title}
          </span>
          {timeLabel && (
            <span className="shrink-0 text-[9px] text-slate-500">
              {timeLabel}
            </span>
          )}
        </div>

        {/* 1. justify-between: Pushes text to left, badge to right
           2. gap-2: Gives a bit more breathing room 
        */}
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-slate-400">
          
          {/* Container for Icon + Text needs to take available space (flex-1) */}
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isWorkspace && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-800/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-300">
                <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                WS
              </span>
            )}
            <span className="truncate">{previewText}</span>
          </div>
          
          {/* BADGE UPDATES:
             1. shrink-0: CRITICAL. Prevents the circle from becoming an oval if text is long.
             2. Removed ml-2: justify-between handles the spacing now.
          */}
          {unreadCount > 0 && (
            <div className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-slate-950">
              {unreadCount}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
