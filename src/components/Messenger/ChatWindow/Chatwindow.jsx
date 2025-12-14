import React, { useMemo, useCallback } from "react";
import { useMessenger } from "../../../hooks/useMessenger";
import { useChatScroll } from "../../../hooks/useChatScroll";
import ChatHeader from "./ChatHeader";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";

export default function Chatwindow() {
  const {
    activeChatId,
    currentUserId,
    chats,
    activeMessages,
    activeHasMore,
    loadOlderMessages,
    // 🔹 add these from the hook:
    sendTextMessage,
    sendAttachment,
  } = useMessenger();

  // Scroll management for the messages area
  const { containerRef, isAtBottom, scrollToBottom } =
    useChatScroll(activeMessages);

  const activeChat = useMemo(
    () =>
      chats.find(
        (c) => c.id === activeChatId || c.chat_id === activeChatId
      ) || null,
    [chats, activeChatId]
  );

  const handleLoadOlder = useCallback(() => {
    if (!activeChatId) return;
    loadOlderMessages(activeChatId);
  }, [activeChatId, loadOlderMessages]);

  // 🔹 wrapper for sending text through the hook
  const handleSendText = useCallback(
    async (text) => {
      if (!activeChatId || !text?.trim()) return;
      await sendTextMessage(activeChatId, text);
      // store will update activeMessages and preview
    },
    [activeChatId, sendTextMessage]
  );

  // 🔹 wrapper for sending attachment through the hook
  const handleSendAttachment = useCallback(
    async ({ file, caption }) => {
      if (!activeChatId || !file) return;
      await sendAttachment({
        chatId: activeChatId,
        file,
        textAfter: caption || null,
      });
    },
    [activeChatId, sendAttachment]
  );

  if (!activeChatId || !activeChat) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70">
        <div className="text-center px-6">
          <p className="text-sm font-semibold text-slate-700">
            No conversation selected
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Choose a chat from the left panel to start messaging.
          </p>
        </div>
      </div>
    );
  }

  const isWorkspaceChat = activeChat.chat_type === "workspace";

  return (
    <div className="flex flex-1 min-h-0 flex-col rounded-2xl border border-slate-200 bg-slate-900/5 overflow-hidden">
      <ChatHeader chat={activeChat} isWorkspaceChat={isWorkspaceChat} />

      <div className="flex flex-1 min-h-0 flex-col bg-slate-50">
        <ChatMessages
          ref={containerRef}
          messages={activeMessages}
          hasMore={activeHasMore}
          onLoadMore={handleLoadOlder}
          currentUserId={currentUserId}
          isAtBottom={isAtBottom}
          onScrollToBottom={scrollToBottom}
        />

        <ChatInput
          chatId={activeChatId}
          onSendText={handleSendText}
          onSendAttachment={handleSendAttachment}
        />
      </div>
    </div>
  );
}
