// src/lib/supabaseNoPersist.js
import { createClient } from "@supabase/supabase-js";

export const supabaseNoPersist = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "sb-nopersist",   // 👈 different key avoids the warning
      // optional: fully memory-only storage:
      // storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    },
  }
);
