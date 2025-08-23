import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspaceStore } from "@/hooks/useWorkspaceStore";
import { usePrivateSpaceStore } from "@/hooks/usePrivateSpaceStore";

export function useEnsureAuthScopedStores() {
  const ensureWorkspace = useWorkspaceStore((s) => s.ensureForUser);
  const ensurePrivate   = usePrivateSpaceStore((s) => s.ensureForUser);

  useEffect(() => {
    let unsub;
    (async () => {
      // Initial hydrate
      const { data: { user } = {} } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      ensureWorkspace(uid);
      ensurePrivate(uid);

      // Keep stores in sync on auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_evt, session) => {
          const nextUid = session?.user?.id ?? null;
          ensureWorkspace(nextUid);
          ensurePrivate(nextUid);
        }
      );
      unsub = () => subscription.unsubscribe();
    })();

    return () => unsub?.();
  }, [ensureWorkspace, ensurePrivate]);
}