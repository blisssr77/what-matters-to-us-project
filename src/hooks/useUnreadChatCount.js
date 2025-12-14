import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient"; // Check your path
import { useConversationStore } from "@/store/useConversationStore";
import { useAuthStore } from "@/store/useAuthStore";

const useUnreadChatCount = () => {
  const { increaseUnreadCount } = useConversationStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;

    // Listen to the 'messages' table for new INSERTS
    const channel = supabase
      .channel("unread-messages-listener")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMessage = payload.new;

          // DEBUG: See if it fires when you send a message
          console.log("🔔 Realtime message detected:", newMessage);

          // Logic: If I am NOT the sender, it's an unread message for me
          // Your schema uses 'sender_id', so we access that exactly
          if (newMessage.sender_id && newMessage.sender_id !== user.id) {
            increaseUnreadCount(newMessage.sender_id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, increaseUnreadCount]);
};

export default useUnreadChatCount;