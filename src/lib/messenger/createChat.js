import { supabase } from "../supabaseClient";

/**
 * Create or fetch a direct chat between two users.
 * chat_type = 'direct'
 */
export async function createDirectChat(opts) {
  const { currentUserId, otherUserId } = opts || {};
  if (!currentUserId || !otherUserId) {
    throw new Error("createDirectChat: both currentUserId and otherUserId are required");
  }

  // Try to find existing chat in either order
  const { data: existing, error: findError } = await supabase
    .from("messenger_chats")
    .select("*")
    .eq("chat_type", "direct")
    .or(
      `and(user_a.eq.${currentUserId},user_b.eq.${otherUserId}),and(user_a.eq.${otherUserId},user_b.eq.${currentUserId})`
    )
    .limit(1);

  if (findError) {
    console.error("createDirectChat find error:", findError);
    throw findError;
  }

  if (existing && existing.length > 0) {
    return existing[0];
  }

  // Create new chat
  const { data: inserted, error: insertError } = await supabase
    .from("messenger_chats")
    .insert({
      chat_type: "direct",
      user_a: currentUserId,
      user_b: otherUserId,
    })
    .select("*")
    .single();

  if (insertError) {
    console.error("createDirectChat insert error:", insertError);
    throw insertError;
  }

  return inserted;
}

/**
 * Create or fetch a workspace chat (one per workspace).
 * chat_type = 'workspace'
 */
export async function createWorkspaceChat(opts) {
  const { workspaceId, currentUserId } = opts || {};
  if (!workspaceId || !currentUserId) {
    throw new Error("createWorkspaceChat: workspaceId and currentUserId are required");
  }

  // Try to find existing workspace chat
  const { data: existing, error: findError } = await supabase
    .from("messenger_chats")
    .select("*")
    .eq("chat_type", "workspace")
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (findError) {
    console.error("createWorkspaceChat find error:", findError);
    throw findError;
  }

  if (existing && existing.length > 0) {
    return existing[0];
  }

  // Create new workspace chat
  const { data: inserted, error: insertError } = await supabase
    .from("messenger_chats")
    .insert({
      chat_type: "workspace",
      workspace_id: workspaceId,
      // optional: title, created_at defaults, etc.
    })
    .select("*")
    .single();

  if (insertError) {
    console.error("createWorkspaceChat insert error:", insertError);
    throw insertError;
  }

  return inserted;
}
