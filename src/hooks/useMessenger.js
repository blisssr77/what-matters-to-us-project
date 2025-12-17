import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  fetchChats as apiFetchChats,
  fetchMessages as apiFetchMessages,
  sendMessage as apiSendMessage,
  sendAttachment as apiSendAttachment,
} from "../lib/messenger";
import { useMessengerStore } from "../store/useMessengerStore";
import { useChatStore } from "../store/useChatStore";
import { formatMessagePreviewTime } from "../utils/formatMessageTime";

export function useMessenger() {
  // 1. Get the clear functions from your stores
  const { 
    upsertChatPreview, 
    clearMessenger // <--- Get this from Messenger Store
  } = useMessengerStore.getState();

  // If useChatStore has a reset function, get it here too. 
  // If not, you might need to add one to useChatStore.js similar to clearMessenger.
  const {
    messagesByChatId,
    setMessagesForChat,
    appendMessagesToChat,
    setChatHasMore,
    clearAllMessages // <--- Assuming you added a reset to useChatStore (Recommended)
  } = useChatStore();

  const {
    currentUserId,
    setCurrentUserId,
    chats,
    chatsLoading,
    chatsError,
    selectedChatId,
    setChats,
    setChatsLoading,
    setChatsError,
    setSelectedChatId,
    clearUnreadCount,
  } = useMessengerStore();

  const activeChatId = selectedChatId;

  // =============== Auth & Wipe Logic ===============
  useEffect(() => {
    (async () => {
      const { data, error: authErr } = await supabase.auth.getUser();
      
      // ✅ FIX: If no user, WIPE DATA immediately
      if (authErr || !data?.user) {
        console.log("No user found, wiping messenger data...");
        setCurrentUserId(null);
        clearMessenger();     // Wipe chats list
        if (clearAllMessages) clearAllMessages(); // Wipe messages cache (if exists)
        return;
      }

      // If user exists, but it's DIFFERENT from what we have in store (e.g. account switch)
      if (currentUserId && currentUserId !== data.user.id) {
        console.log("User changed, wiping old messenger data...");
        clearMessenger();
        if (clearAllMessages) clearAllMessages();
      }

      setCurrentUserId(data.user.id);
    })();
  }, [setCurrentUserId, clearMessenger, clearAllMessages, currentUserId]);

  // =============== Load chats ===============
  const loadChats = useCallback(async () => {
    if (!currentUserId) return;
    setChatsLoading(true);
    setChatsError(null);

    try {
      const list = await apiFetchChats(currentUserId);

      const sorted = [...list].sort((a, b) => {
        const tA = a.updated_at || a.created_at || "";
        const tB = b.updated_at || b.created_at || "";
        return tA < tB ? 1 : -1;
      });

      setChats(sorted);
    } catch (err) {
      console.error("loadChats error:", err);
      setChatsError("Failed to load chats.");
    } finally {
      setChatsLoading(false);
    }
  }, [currentUserId, setChats, setChatsError, setChatsLoading]);

  // Only load chats if we actually have a user
  useEffect(() => {
    if (currentUserId) {
      loadChats();
    }
  }, [currentUserId, loadChats]);

  // ... (The rest of your file remains exactly the same: openChat, loadInitialMessages, etc.)
  
  const openChat = useCallback(
    async (chatId) => {
      if (!chatId) return;
      clearUnreadCount(chatId);
      setSelectedChatId(chatId);

      const entry = messagesByChatId[chatId];
      const alreadyLoaded =
        entry && Array.isArray(entry.items) && entry.items.length > 0;

      if (!alreadyLoaded) {
        await loadInitialMessages(chatId);
      }
    },
    [clearUnreadCount, messagesByChatId, setSelectedChatId]
  );

  const loadInitialMessages = useCallback(
    async (chatId) => {
      if (!chatId) return;
      try {
        const { messages, hasMore } = await apiFetchMessages({
          chatId,
          limit: 50,
          before: null,
        });
        setMessagesForChat(chatId, messages, hasMore);
      } catch (err) {
        console.error("loadInitialMessages error:", err);
        setChatsError("Failed to load messages.");
      }
    },
    [setMessagesForChat, setChatsError]
  );

  const loadOlderMessages = useCallback(
    async (chatId) => {
      if (!chatId) return;
      const entry = messagesByChatId[chatId];
      const list = entry?.items || [];
      if (!list.length) {
        await loadInitialMessages(chatId);
        return;
      }
      const oldest = list[list.length - 1]; 
      const beforeTs = oldest?.created_at || null;
      if (!beforeTs) return;

      try {
        const { messages, hasMore } = await apiFetchMessages({
          chatId,
          limit: 50,
          before: beforeTs,
        });
        appendMessagesToChat(chatId, messages, { prepend: false });
        setChatHasMore(chatId, hasMore);
      } catch (err) {
        console.error("loadOlderMessages error:", err);
        setChatsError("Failed to load older messages.");
      }
    },
    [messagesByChatId, loadInitialMessages, appendMessagesToChat, setChatHasMore, setChatsError]
  );

  const sendTextMessage = useCallback(
    async (chatId, text) => {
      if (!currentUserId || !chatId || !text?.trim()) return null;

      try {
        const msg = await apiSendMessage({
          chatId,
          senderId: currentUserId,
          text: text.trim(),
          type: "text",
        });

        appendMessagesToChat(chatId, [msg], { prepend: true });

        upsertChatPreview({
          chat_id: chatId,
          last_message_at: msg.created_at,
          last_message_text: msg.message_text ?? null,
        });

        return msg;
      } catch (err) {
        console.error("sendTextMessage error:", err);
        setChatsError("Failed to send message.");
        return null;
      }
    },
    [currentUserId, appendMessagesToChat, setChatsError, upsertChatPreview]
  );

  const sendAttachment = useCallback(
    async ({ chatId, file, textAfter }) => {
      if (!currentUserId || !chatId || !file) return null;

      try {
        const result = await apiSendAttachment({
          chatId,
          senderId: currentUserId,
          file,
          textAfter: textAfter || null,
        });

        if (result.attachmentMessage) {
          appendMessagesToChat(chatId, [result.attachmentMessage], { prepend: true });
          upsertChatPreview({
            chat_id: chatId,
            last_message_at: result.attachmentMessage.created_at,
            last_message_text:
              result.attachmentMessage.message_type === "text"
                ? result.attachmentMessage.message_text
                : null,
          });
        }
        if (result.textMessage) {
          appendMessagesToChat(chatId, [result.textMessage], { prepend: true });
          upsertChatPreview({
            chat_id: chatId,
            last_message_at: result.textMessage.created_at,
            last_message_text: result.textMessage.message_text ?? null,
          });
        }

        return result;
      } catch (err) {
        console.error("sendAttachment error:", err);
        setChatsError("Failed to send attachment.");
        return null;
      }
    },
    [currentUserId, appendMessagesToChat, setChatsError, upsertChatPreview]
  );

  const activeMessages = useMemo(() => {
    if (!selectedChatId) return [];
    return messagesByChatId[selectedChatId]?.items || [];
  }, [selectedChatId, messagesByChatId]);

  const activeHasMore = useMemo(() => {
    if (!selectedChatId) return false;
    return !!messagesByChatId[selectedChatId]?.hasMore;
  }, [selectedChatId, messagesByChatId]);

  const chatsWithMeta = useMemo(() => {
    return (chats || []).map((chat) => {
      const entry = messagesByChatId[chat.id];
      const msgs = entry?.items || [];
      const last = msgs.length > 0 ? msgs[0] : null; 

      const lastText =
        last?.message_type === "text"
          ? last?.message_text
          : last
          ? `[${last?.message_type || "message"}]`
          : "";

      const lastTime = last?.created_at
        ? formatMessagePreviewTime(last.created_at)
        : null;

      return {
        ...chat,
        lastMessageText: lastText,
        lastMessageTime: lastTime,
      };
    });
  }, [chats, messagesByChatId]);

  return {
    currentUserId,
    chats: chatsWithMeta,
    loadingChats: chatsLoading,
    chatsError,
    activeChatId,
    activeMessages,
    activeHasMore,
    openChat,
    loadChats,
    loadInitialMessages,
    loadOlderMessages,
    sendTextMessage,
    sendAttachment,
    setSelectedChatId,
  };
}