import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export const useUserRole = (workspaceId) => {
  const [role, setRole] = useState(null);

  useEffect(() => {
    const fetchRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !workspaceId) return;

      const { data } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle();
        console.log("User role fetched:", data);

      setRole(data?.role || null);
    };

    fetchRole();
  }, [workspaceId]);

  return role;
};
