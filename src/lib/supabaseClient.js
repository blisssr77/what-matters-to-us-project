import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');

const g = globalThis;

// ---- HMR-safe singleton (persisted session) ----
export const supabase =
  g.__supabase ||
  createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // storageKey: 'sb-auth-main', // optional
    },
  })

if (!g.__supabase) g.__supabase = supabase

// ---- Optional: lazy non-persist client (use only if needed) ----
export function getSupabaseNoPersist() {
  if (g.__supabaseNoPersist) return g.__supabaseNoPersist
  const client = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'sb-auth-nopersist', // unique key
    },
  })
  g.__supabaseNoPersist = client
  return client
}