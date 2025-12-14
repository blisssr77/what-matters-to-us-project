import { supabase } from "../supabaseClient";
import { normalizeMessageList } from "../../utils/messageNormalizer";

/**
 * Fetch messages for a chat.
 * - ordered newest → oldest (DESC)
 * - pagination via "before" created_at (optional)
 */
export async function fetchMessages(opts) {
  const { chatId, limit = 50, before = null } = opts || {};
  if (!chatId) throw new Error("fetchMessages: chatId is required");

  let query = supabase
    .from("messenger_messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetchMessages error:", error);
    throw error;
  }

  const normalized = normalizeMessageList(data || []);
  const hasMore = (data || []).length === limit;

  return {
    messages: normalized,
    hasMore,
  };
}

