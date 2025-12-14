import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useMessengerStore } from "../store/useMessengerStore";
import { useChatStore } from "../store/useChatStore";

export function useRealtimeInbox() {
  const { currentUserId, upsertChatPreview, selectedChatId } = useMessengerStore();
  const { appendMessagesToChat, messagesByChatId } = useChatStore();

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel("messenger-inbox")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messenger_messages",
        },
        async (payload) => {
          const rawMsg = payload.new;
          if (!rawMsg?.chat_id) return;

          // 1. Deduplication Guard
          const currentMessages = messagesByChatId[rawMsg.chat_id]?.items || [];
          if (currentMessages.some((m) => m.id === rawMsg.id)) return;

          // 2. Hydrate Sender Info
          let senderData = { username: "Unknown", avatar_url: null };
          if (rawMsg.sender_id) {
            const { data } = await supabase
              .from("users") // or 'profiles'
              .select("id, username, avatar_url, full_name")
              .eq("id", rawMsg.sender_id)
              .single();
            if (data) senderData = data;
          }

          const completeMsg = { ...rawMsg, sender: senderData };

          // 3. Add to Messages Store (Content)
          appendMessagesToChat(rawMsg.chat_id, [completeMsg], { prepend: true });

          // 4. Calculate Logic
          const isMyMessage = rawMsg.sender_id === currentUserId;
          const isOpen = selectedChatId === rawMsg.chat_id;
          
          // ✅ LOGIC: Only increment if it's NOT my message AND I'm NOT looking at it
          const shouldIncrement = !isMyMessage && !isOpen;

          if (shouldIncrement) {
             console.log("INCREMENTING BADGE for chat:", rawMsg.chat_id);
          }

          // 5. Atomic Update (Preview + Badge)
          upsertChatPreview(
            {
              chat_id: rawMsg.chat_id,
              last_message_at: rawMsg.created_at,
              last_message_text: rawMsg.message_type === "text" ? rawMsg.message_text : `[${rawMsg.message_type}]`,
            },
            { shouldIncrementUnread: shouldIncrement } // <--- Passing the flag here
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, appendMessagesToChat, upsertChatPreview, messagesByChatId, selectedChatId]); // Added selectedChatId dependency
}