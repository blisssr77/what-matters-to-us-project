import { create } from "zustand";

export const useChatStore = create((set, get) => ({
  // ----------------- MESSAGE STATE -----------------
  // Structure:
  // {
  //   [chatId]: {
  //     items: [...messages],
  //     loading: false,
  //     hasMore: true
  //   }
  // }
  messagesByChatId: {},

  error: null,

  // Initialize message container if not present
  initChatMessages: (chatId) =>
    set((state) => {
      if (!chatId) return state;
      if (state.messagesByChatId[chatId]) return state;

      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: {
            items: [],
            loading: false,
            hasMore: true,
          },
        },
      };
    }),

  // Replace the entire message list for a chat
  setMessagesForChat: (chatId, messages, hasMore = true) =>
    set((state) => {
      if (!chatId) return state;

      const existing = state.messagesByChatId[chatId] || {
        items: [],
        loading: false,
        hasMore: true,
      };

      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: {
            ...existing,
            items: Array.isArray(messages) ? messages : [],
            hasMore,
          },
        },
      };
    }),

  // Append or prepend messages
  appendMessagesToChat: (chatId, newMessages, options = {}) =>
    set((state) => {
      if (!chatId) return state;

      const { prepend = false } = options;

      const existing = state.messagesByChatId[chatId] || {
        items: [],
        loading: false,
        hasMore: true,
      };

      const incoming = Array.isArray(newMessages) ? newMessages : [];

      const items = prepend
        ? [...incoming, ...existing.items]
        : [...existing.items, ...incoming];

      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: {
            ...existing,
            items,
          },
        },
      };
    }),

  // Add a realtime message if not duplicate
  addSingleMessage: (chatId, message) =>
    set((state) => {
      if (!chatId || !message) return state;

      const existing = state.messagesByChatId[chatId] || {
        items: [],
        loading: false,
        hasMore: true,
      };

      const exists = existing.items.find((m) => m.id === message.id);
      if (exists) return state;

      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: {
            ...existing,
            items: [...existing.items, message],
          },
        },
      };
    }),

  // State flags
  setChatLoading: (chatId, loading) =>
    set((state) => {
      if (!chatId) return state;

      const existing = state.messagesByChatId[chatId] || {
        items: [],
        loading: false,
        hasMore: true,
      };

      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: { ...existing, loading },
        },
      };
    }),

  setChatHasMore: (chatId, hasMore) =>
    set((state) => {
      if (!chatId) return state;

      const existing = state.messagesByChatId[chatId] || {
        items: [],
        loading: false,
        hasMore: true,
      };

      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: { ...existing, hasMore },
        },
      };
    }),

  // Remove one chat’s messages
  clearChat: (chatId) =>
    set((state) => {
      if (!chatId) return state;
      const copy = { ...state.messagesByChatId };
      delete copy[chatId];
      return { messagesByChatId: copy };
    }),

  // Clear everything
  resetAllChats: () =>
    set({
      messagesByChatId: {},
      error: null,
    }),

  setError: (error) => set({ error }),
}));
