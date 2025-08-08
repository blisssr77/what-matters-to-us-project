import { supabase } from "./supabaseClient";

export const fetchWorkspaceMembers = async (workspaceId) => {
  if (!workspaceId) return { data: [], error: "No workspace ID" };

    const { data, error } = await supabase
    .from("workspace_members")
    .select(`
        id,
        role,
        invited_by_name,
        profiles (
        username
        )
    `)
    .eq("workspace_id", workspaceId);
    console.log("Fetched members:", data);

  return { data, error };
};