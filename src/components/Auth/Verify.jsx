import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const verifyChannel = typeof window !== 'undefined'
  ? new BroadcastChannel('email-verify')
  : null;

export default function Verify() {
  const [status, setStatus] = useState('Verifying your email…');
  const closedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Supabase should have set the session in this tab via the link.
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setStatus('No active session found. Please log in again.');
          return;
        }

        // If Supabase confirmed email (email/password flow), mark your flag too.
        const confirmedAt = user.email_confirmed_at || user.confirmed_at;

        if (confirmedAt) {
          await supabase
            .from('profiles')
            .update({ email_verified: true, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        }

        setStatus('Email verified! You can return to your app.');
        // Notify the original tab (AuthPage listener will navigate)
        verifyChannel?.postMessage('verified');

        // Best effort: close this tab if it was opened by the email client and allowed to close.
        setTimeout(() => {
          if (!cancelled) window.close();
        }, 800);
      } catch (e) {
        setStatus(e?.message || 'Verification failed. You can close this tab and log in.');
      }
    })();

    return () => { cancelled = true; verifyChannel?.close?.(); };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow p-6 text-center border">
        <div className="text-gray-800 font-medium">{status}</div>
        <div className="text-sm text-gray-600 mt-2">
          If this tab doesn’t close automatically, you can switch back to the original tab.
        </div>
      </div>
    </div>
  );
}
