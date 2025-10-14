import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function usePvVaultCode() {
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

      // Check EITHER:
      // 1) user-level private_code_hash in vault_codes
      // 2) any of the user's private_spaces having a vault_code_hash
      const [c1, c2] = await Promise.all([
        supabase
          .from("vault_codes")
          .select("id", { head: true, count: "exact" })
          .eq("id", user.id)
          .not("private_code_hash", "is", null),
        supabase
          .from("private_spaces")
          .select("id", { head: true, count: "exact" })
          .eq("created_by", user.id)
          .not("vault_code_hash", "is", null),
      ]);

      if (alive) {
        const hasFromVaultCodes = !c1.error && (c1.count ?? 0) > 0;
        const hasFromPrivateSpaces = !c2.error && (c2.count ?? 0) > 0;
        setHas(hasFromVaultCodes || hasFromPrivateSpaces);
        setReady(true);
      }
    })();

    return () => { alive = false; };
  }, []);

  return { ready, has };
}
