import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useMessengerStore = create(
  persist(
    (set, get) => ({
      // Who is logged in (for messenger context)
      currentUserId: null,

      // List of chats from fetch_user_chats RPC
      chats: [],

      chatsLoading: false,
      chatsError: null,

      // Currently selected chat in the UI
      selectedChatId: null,

      // --- setters ---

      setCurrentUserId: (id) => set({ currentUserId: id }),

      setChatsLoading: (loading) => set({ chatsLoading: loading }),

      setChatsError: (err) => set({ chatsError: err }),

      setChats: (chats) =>
        set({
          chats: Array.isArray(chats) ? chats : [],
          chatsError: null,
        }),

      // Update or insert a chat preview, e.g. after sendMessage or receiving a new message
      upsertChatPreview: (updatedChat, options = {}) =>
        set((state) => {
          if (!updatedChat || !updatedChat.chat_id) return state;
          
          const { shouldIncrementUnread = false } = options;

          const existingIndex = state.chats.findIndex(
            (c) => c.chat_id === updatedChat.chat_id || c.id === updatedChat.chat_id
          );

          let newChats;
          
          // Case 1: Chat exists in the list
          if (existingIndex !== -1) {
            newChats = [...state.chats];
            const existingChat = newChats[existingIndex];
            
            // Calculate new count atomically
            const currentCount = existingChat.unread_count || 0;
            const newCount = shouldIncrementUnread ? currentCount + 1 : currentCount;

            newChats[existingIndex] = {
              ...existingChat,
              ...updatedChat,
              unread_count: newCount, // Update count while updating preview
            };
            
            // Move to top (optional, but good UX)
            // If you want the updated chat to jump to index 0:
            /* const [movedChat] = newChats.splice(existingIndex, 1);
            newChats.unshift(movedChat);
            */
             
          } else {
            // Case 2: New chat coming in via realtime (we might not have all data, but we start it)
            newChats = [
              {
                ...updatedChat,
                unread_count: shouldIncrementUnread ? 1 : 0,
              }, 
              ...state.chats
            ];
          }

          return { ...state, chats: newChats };
        }),

        // 1. ADD +1 to unread count
        incrementUnreadCount: (targetChatId) =>
          set((state) => {
            console.log("Store: Attempting to increment count for Chat ID:", targetChatId);
            
            let found = false;
            const newChats = state.chats.map((chat) => {
              // Check both ID styles just in case
              const currentId = chat.id || chat.chat_id; 
              
              if (currentId === targetChatId) {
                console.log(`MATCH FOUND! Current count: ${chat.unread_count}`);
                found = true;
                // If undefined, start at 0, then add 1
                const current = chat.unread_count || 0;
                return { ...chat, unread_count: current + 1 };
              }
              return chat;
            });

            if (!found) {
              console.warn("Store: Could not find a chat with that ID in the list:", state.chats);
            }

            return { ...state, chats: newChats };
          }),

        // 2. CLEAR unread count
        clearUnreadCount: (chatId) =>
          set((state) => {
            const newChats = state.chats.map((chat) => {
              if (chat.chat_id === chatId || chat.id === chatId) {
                return { ...chat, unread_count: 0 };
              }
              return chat;
            })
            return { ...state, chats: newChats };
          }),

      setSelectedChatId: (chatId) => set({ selectedChatId: chatId }),

      clearMessenger: () =>
        set({
          chats: [],
          chatsLoading: false,
          chatsError: null,
          selectedChatId: null,
        }),
    }),
    {
      name: "messenger-store",
      // Persist only the minimum needed between sessions
      partialize: (s) => ({
        currentUserId: s.currentUserId,
        selectedChatId: s.selectedChatId,
      }),
    }
  )
);
