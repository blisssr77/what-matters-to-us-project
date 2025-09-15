import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import ResendEmailButton from "./ResendEmailButton";

export default function EmailConfirmGate({ children }) {
  const [verified, setVerified] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkVerification = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;

      if (confirmedAt || user?.app_metadata?.provider === "google") {
        setVerified(true);
        navigate("/dashboard"); //  Redirect if confirmed
      } else {
        setVerified(false);
      }
    };

    checkVerification();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;

      if (confirmedAt) {
        setVerified(true);
        navigate("/dashboard");
      }
    });

    return () => {
      listener.subscription.unsubscribe();
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
