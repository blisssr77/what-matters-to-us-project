import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useChatStore } from "../store/useChatStore";
import { normalizeMessageRow } from "../utils/messageNormalizer";

/**
 * Listen to realtime messages for a given chatId.
 * Call this inside ChatWindow, passing the activeChatId.
 */
export function useRealtimeMessage(chatId) {
  const { appendMessageToChat } = useChatStore();

  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`messenger:chat:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messenger_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const msg = normalizeMessageRow(payload.new);
          appendMessageToChat(chatId, msg);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // console.log("Subscribed to realtime chat:", chatId);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, appendMessageToChat]);
}
