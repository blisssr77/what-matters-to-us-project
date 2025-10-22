import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import ResendEmailButton from "./ResendEmailButton";

export default function EmailConfirmGate({ children }) {
  const [verified, setVerified] = useState(null);
  const navigate = useNavigate();
  const updateOnceRef = useRef(false);

  // Check email verification status on mount and on auth state changes
  useEffect(() => {
    const checkVerification = async () => {
      console.debug('[Gate] checkVerification');
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { setVerified(false); return; }

      // A) Supabase native (email/password) confirmation
      const confirmedAt = user.email_confirmed_at || user.confirmed_at;

      // B) Your app-level flag
      const { data: prof } = await supabase
        .from('profiles')
        .select('email_verified')
        .eq('id', user.id)
        .maybeSingle();

      const isVerified = Boolean(confirmedAt || prof?.email_verified);
      setVerified(isVerified);

      // If verified, and app-level flag not set, set it now
      // Optionally set your app flag once, but do not navigate here.
      if (isVerified && !updateOnceRef.current) {
        updateOnceRef.current = true;
        try {
          await supabase
            .from('profiles')
            .update({ email_verified: true, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        } catch (e) {
          console.warn('profiles.email_verified update failed:', e);
        }
      }

      checkVerification();

      const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
        console.debug('[Gate] onAuthStateChange');
        const u = session?.user;
        if (!u) return;
        const confirmedAt = u.email_confirmed_at || u.confirmed_at;
        const { data: prof } = await supabase
          .from('profiles').select('email_verified').eq('id', u.id).maybeSingle();
        const isVerified = Boolean(confirmedAt || prof?.email_verified);
        if (isVerified) {
          setVerified(true);
          navigate('/dashboard');
        }
        if (!isVerified) setVerified(false);
      });

      return () => sub.subscription.unsubscribe();
    };
  }, [navigate]);
  

  if (verified === null) return <p className="text-center mt-10">Checking...</p>;

  if (!verified) {
    return (
      <div className="p-6 text-center max-w-md mx-auto mt-20 bg-white border rounded-xl shadow">
        <p className="text-gray-800 mb-4 font-medium">
          ✉️ Please verify your email before continuing.
        </p>
        <p className="text-gray-600 text-sm mb-4">
          We’ve sent a confirmation email. Check your inbox or spam folder.
        </p>
        <ResendEmailButton />
      </div>
    );
  }

  return <>{children}</>;
}
