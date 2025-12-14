import { supabase } from "../supabaseClient";

/**
 * Fetch all chats visible to a user via the fetch_user_chats RPC.
 * This returns:
 * - direct chats with the "other user" info
 * - workspace / group chats with workspace info
 */
export async function fetchChats(userId) {
  if (!userId) throw new Error("fetchChats: userId is required");

  const { data, error } = await supabase.rpc("fetch_user_chats", {
    user_id: userId,
  });

  if (error) {
    console.error("fetchChats rpc error:", error);
    throw error;
  }

  const rows = data || [];

  return rows.map((row) => {
    // Other User Logic
    const otherDisplay =
      row.other_user_username ||
      row.other_user_email ||
      null;

    // Title Logic
    const baseTitle =
      row.chat_type === "direct"
        ? (otherDisplay || "Direct message")
        : row.workspace_name ||
          row.title ||
          (row.chat_type === "workspace"
            ? "Workspace chat"
            : "Group conversation");

    return {
      // --- Core IDs ---
      id: row.id,
      chat_id: row.id,

      chat_type: row.chat_type,
      title: baseTitle,

      // --- Timestamps ---
      created_at: row.created_at,
      updated_at: row.updated_at,
      // Ideally, use the real message time if available, otherwise fallback to updated_at
      last_message_at: row.last_message_at || row.updated_at,

      // --- MISSING DATA (The Fix) ---
      // We grab the text column so the UI has something to show on refresh
      last_message_text: row.last_message_text || row.last_message_content || row.preview || null,
      
      // We also grab the unread count for your badges!
      unread_count: row.unread_count || 0,

      // --- Workspace Info ---
      workspace_id: row.workspace_id,
      workspace_name: row.workspace_name,

      // --- User Info ---
      other_user_id: row.other_user_id,
      other_user_username: row.other_user_username,
      other_user_email: row.other_user_email,
      otherUserDisplayName: otherDisplay,
      display_name: otherDisplay,
      other_user_name: otherDisplay,
    };
  });
}
