import { create } from "zustand";
import { supabase } from "@/lib/supabaseClient";

export const useConversationStore = create((set, get) => ({
  conversations: [],
  messages: [],
  selectedConversationId: null,

  setConversations: (conversations) => set({ conversations }),
  
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),

  // --- 1. FETCH CONVERSATIONS (The Room List) ---
  fetchConversations: async (userId) => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("conversations")
      .select(`
        *,
        conversation_participants!inner(user_id, unread_count)
      `)
      .eq("conversation_participants.user_id", userId)
      .order("last_message_at", { ascending: false });

    if (error) {
      console.error("Error fetching chats:", error);
      return;
    }

    // Flatten structure for easier UI consumption
    const formattedData = data.map((conv) => {
      // Since we filtered by userId, this array will only contain YOUR participant row
      const myParticipantInfo = conv.conversation_participants[0];

      return {
        ...conv,
        unreadCount: myParticipantInfo?.unread_count || 0,
      };
    });

    set({ conversations: formattedData });
  },

  // --- 2. FETCH MESSAGES (The Actual Chat) ---
  fetchMessages: async (conversationId) => {
    if (!conversationId) return;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }); // Oldest first for chat history

    if (error) {
      console.error("Error fetching messages:", error);
    } else {
      set({ messages: data || [] });
    }
  },

  // --- 3. SEND MESSAGE (Action) ---
  sendMessage: async (conversationId, senderId, content) => {
    // 1. Optimistic Update (Show it immediately)
    const tempId = crypto.randomUUID();
    const newMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      created_at: new Date().toISOString(),
    };

    set((state) => ({ messages: [...state.messages, newMessage] }));

    // 2. Send to Supabase
    const { error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: senderId, content });

    if (error) {
      console.error("Error sending message:", error);
      // Optional: Add logic here to remove the message if it failed
    }

    // 3. Update 'last_message_at' on the conversation
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
  },

  // --- 4. UTILS ---
  increaseUnreadCount: (conversationId) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, unreadCount: (c.unreadCount || 0) + 1 }
          : c
      ),
    }));
  },
}));