import React, { useMemo, useState } from "react";
import { MessageSquarePlus, Search } from "lucide-react";

import { useChatStore } from "@/store/useChatStore";
import { useMessengerStore } from "@/store/useMessengerStore";
import { useMessenger } from "@/hooks/useMessenger";

import MessageListItem from "./MessageListItem";
import AddFriendModal from "../Modals/AddFriendModal";

export default function MessageList({
  mode = "direct",
  workspaceId,
  activeChatId,
  onSelectChat,
}) {
  // Messages live in ChatStore
  const { messagesByChatId } = useChatStore();

  // Chat list + loading live in MessengerStore
  const { chats, loadingChats: chatsLoading } = useMessenger();

  const [localSearch, setLocalSearch] = useState("");
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);

  const { openAddFriendModal } = useMessengerStore(); // Keep this just for the modal function

  const chatItems = useMemo(() => {
    if (!Array.isArray(chats) || chats.length === 0) return [];

    // 1) Filter by mode (direct / workspace)
    const filteredByMode = chats.filter((chat) => {
      const type = chat.chat_type;
      if (mode === "direct") {
        return type === "direct";
      }
      if (mode === "workspace") {
        if (type !== "workspace") return false;
        if (workspaceId && chat.workspace_id && chat.workspace_id !== workspaceId)
          return false;
        return true;
      }
      return true;
    });

    // 2) Search by title / name
    const searched = filteredByMode.filter((chat) => {
      if (!localSearch.trim()) return true;
      const q = localSearch.toLowerCase();
      const title =
        chat.title ||
        chat.display_name ||
        chat.other_user_name ||
        "";
      return title.toLowerCase().includes(q);
    });

    // 3) Attach last message + sort by recency
    const withLast = searched.map((chat, index) => {
      // // DEBUG: LOG THE FIRST CHAT ONLY 
      // if (index === 0) {
      //   console.log("🔥 CHAT KEYS:", Object.keys(chat)); // <--- This prints the names of the columns
      //   console.log("🔥 MESSAGE PREVIEW:", chat.last_message_text || chat.preview || chat.content); 
      // }

      const chatId = chat.chat_id || chat.id; // <- normalize ID
      // Get last message from ChatStore if available
      const msgs = messagesByChatId?.[chatId]?.items || messagesByChatId?.[chatId] || [];
      
      let last = null;

      if (msgs.length > 0) {
        last = msgs[0]; 
      } else if (chat.lastMessageText || chat.last_message_text || chat.last_message_at) {
        // ✅ NEW: Check chat.lastMessageText (from the hook) first!
        last = {
          created_at: chat.lastMessageTime || chat.last_message_at,
          // Fallback chain: Hook Value -> DB Value -> Generic Text
          message_text: chat.lastMessageText || chat.last_message_text || "Loading preview...",
          message_type: 'text',
          id: 'preview',
        };
      } else {
        last = chat.last_message || null; 
      }

      const lastAt =
        last?.created_at ||
        chat.last_message_at ||
        chat.updated_at ||
        chat.created_at ||
        null;

      return { chat, chatId, lastMessage: last, lastAt };
    });

    return withLast.sort((a, b) => {
      if (!a.lastAt && !b.lastAt) return 0;
      if (!a.lastAt) return 1;
      if (!b.lastAt) return -1;
      return new Date(b.lastAt) - new Date(a.lastAt);
    });
  }, [chats, messagesByChatId, mode, workspaceId, localSearch]);

  return (
    <div className="flex h-full flex-col bg-slate-950">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-800 bg-slate-950/95">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              {mode === "direct" ? "Direct Messages" : "Workspace Threads"}
            </h2>
            <p className="text-[11px] text-slate-500">
              {mode === "direct"
                ? "Chats with your friends & teammates"
                : "Conversations inside this workspace"}
            </p>
          </div>

          <button
            type="button"
            onClick={openAddFriendModal}
            className="inline-flex items-center justify-center rounded-full bg-emerald-500/90 hover:bg-emerald-400 text-slate-950 transition text-xs px-2.5 py-1 shadow-sm"
          >
            <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />
            New
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <span className="absolute inset-y-0 left-2 flex items-center text-slate-500">
            <Search className="h-3.5 w-3.5" />
          </span>
          <input
            type="text"
            className="w-full rounded-lg bg-slate-900 border border-slate-700 px-7 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/80 focus:border-emerald-500/80"
            placeholder="Search conversations"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3 custom-scrollbar-thin">
        {chatsLoading && chatItems.length === 0 && (
          <div className="px-2 py-3 text-[11px] text-slate-500">
            Loading conversations…
          </div>
        )}

        {!chatsLoading && chatItems.length === 0 && (
          <div className="px-2 py-4 text-[11px] text-slate-500">
            No conversations yet.
            <br />
            <span className="text-slate-400">
              Tap <span className="font-semibold text-emerald-400">New</span> to
              start one.
            </span>
          </div>
        )}

        {chatItems.map(({ chat, chatId, lastMessage }) => (
          <MessageListItem
            key={chatId}
            chat={chat}
            chatId={chatId}
            mode={mode}
            lastMessage={lastMessage}
            isActive={activeChatId === chatId}
            onClick={() => onSelectChat(chatId)}
          />
        ))}
      </div>

      {/* Add friend modal (fallback if store doesn't manage it) */}
      {showAddFriendModal && (
        <AddFriendModal onClose={() => setShowAddFriendModal(false)} />
      )}
    </div>
  );
}
