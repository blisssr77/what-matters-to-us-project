import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function RecoverPage() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const hash = window.location.hash || '';
      const qs = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
      if (qs.get('type') !== 'recovery') {
        setErr('Invalid or expired link.');
        setReady(true);
        return;
      }
      // Ingest the hash to create a temporary recovery session
      await supabase.auth.getSession();
      setReady(true);
    })();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!pw || pw !== confirm) return setErr('Passwords do not match.');
    const { error } = await supabase.auth.updateUser({ password: pw });

    // Persist that the user has email/password now. Need to revisit this later.**************************************************
    localStorage.setItem('wm_has_email_pw', '1');

    if (error) return setErr(error.message);
    // (Optional) verify providers changed:
    const { data: { user } } = await supabase.auth.getUser();
    console.log('[recover] providers now:', user?.app_metadata?.providers, user?.identities);
    nav('/dashboard', { replace: true });
  }

  if (!ready) return <div>Loading…</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-white to-white px-4">
      <div className="w-full max-w-md">
        {/* Brand / heading */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-500 via-indigo-200 to-blue-500 bg-clip-text text-transparent animate-pulse-slow">
            WhatMatters
          </h1>
          <p className="mt-1 text-xs text-gray-500">Finish updating your password.</p>
        </div>

        {/* Card */}
        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl ring-1 ring-gray-900/5 border border-gray-100">
          <form onSubmit={onSubmit} className="p-6 sm:p-8 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 text-center">Set a new password</h2>

            {err && (
              <p className="text-sm text-red-500 text-center">{err}</p>
            )}

            <div>
              <label className="sr-only" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                placeholder="New password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                className="w-full px-3.5 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                required
              />
            </div>

            <div>
              <label className="sr-only" htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full px-3.5 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition"
            >
              Set password
            </button>

            <p className="text-[11px] text-center text-gray-400">
              You’ll be redirected after saving.
            </p>
          </form>
        </div>

        {/* tiny footer */}
        <p className="text-[11px] text-center text-gray-400 mt-4">
          © {new Date().getFullYear()} WhatMatters
        </p>
      </div>
    </div>
  );
}
