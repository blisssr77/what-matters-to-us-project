import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useWsVaultCode() {
  const [ready, setReady] = useState(false);
  const [has, setHas] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user?.id) {
        if (alive) { setHas(false); setReady(true); }
        return;
      }

      // Fast HEAD request: “do I have a non-null workspace_code_hash?”
      const { count, error } = await supabase
        .from("vault_codes")
        .select("id", { head: true, count: "exact" })
        .eq("id", user.id)
        .not("workspace_code_hash", "is", null);

      if (alive) {
        setHas(!error && (count ?? 0) > 0);
        setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { ready, has };
}
