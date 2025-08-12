import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');

const g = globalThis;

// Persisted (main) — created immediately
export const supabase =
  (import.meta.env.DEV && g.__sb_main) ||
  createClient(url, anon, {
    auth: {
      persistSession: true,
      storage: localStorage,
      storageKey: 'sb-auth-main-v1',
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

if (import.meta.env.DEV) g.__sb_main = supabase;

// 🔽 Lazy non-persist: create only when call getSupabaseNoPersist()
let _noPersist;
export function getSupabaseNoPersist() {
  if (!_noPersist) {
    _noPersist =
      (import.meta.env.DEV && g.__sb_nopersist) ||
      createClient(url, anon, {
        auth: {
          persistSession: false,
          storage: sessionStorage,
          storageKey: 'sb-auth-nopersist-v1',
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    if (import.meta.env.DEV) g.__sb_nopersist = _noPersist;
  }
  return _noPersist;
}